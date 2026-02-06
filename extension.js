// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

class WindowMover {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();

        this._appConfigs = new Map();
        this._appData = new Map();
        this._processedWindows = new WeakSet();

        this._appSystem.connectObject('installed-changed',
            () => this._updateAppData(), this);

        this._settings.connectObject('changed',
            this._updateAppConfigs.bind(this), this);
        this._updateAppConfigs();
    }

    _updateAppConfigs() {
        this._appConfigs.clear();
        this._settings.get_strv('application-list').forEach(v => {
            const [appId, _, bgString] = v.split(':');
            if (appId) {
                const isBackground = (bgString === 'true');
                this._appConfigs.set(appId, { background: isBackground });
            }
        });
        this._updateAppData();
    }

    _updateAppData() {
        const ids = [...this._appConfigs.keys()];
        const removedApps = [...this._appData.keys()]
            .filter(a => !ids.includes(a.id));

        removedApps.forEach(app => {
            app.disconnectObject(this);
            this._appData.delete(app);
        });

        const addedApps = ids
            .map(id => this._appSystem.lookup_app(id))
            .filter(app => app && !this._appData.has(app));

        addedApps.forEach(app => {
            app.connectObject('windows-changed',
                this._appWindowsChanged.bind(this), this);
            this._appData.set(app, { windows: app.get_windows() });
        });
    }

    destroy() {
        this._appSystem.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;
        this._appConfigs.clear();
        this._updateAppData();
    }

    _moveWindow(window, app) {
        if (this._processedWindows.has(window)) return;

        if (window.skip_taskbar || window.is_on_all_workspaces()) return;
        if (window.get_transient_for() !== null) return;
        if (window.get_window_type() !== Meta.WindowType.NORMAL) return;
        if (window.is_above()) return;

        const currentWorkspace = window.get_workspace();
        const hasSibling = app.get_windows().some(w =>
            w !== window &&
            w.get_workspace() === currentWorkspace &&
            !w.skip_taskbar &&
            !w.is_on_all_workspaces()
        );

        if (hasSibling) {
            this._processedWindows.add(window);
            return;
        }

        this._processedWindows.add(window);

        const config = this._appConfigs.get(app.get_id());
        const moveInBackground = config ? config.background : false;

        // Delay para garantir que a janela e o workspace estão prontos
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            if (!window.get_compositor_private()) return GLib.SOURCE_REMOVE;
            if (window.get_transient_for() !== null) return GLib.SOURCE_REMOVE;

            const workspaceManager = global.workspace_manager;
            const lastIndex = workspaceManager.n_workspaces - 1;
            const lastWorkspace = workspaceManager.get_workspace_by_index(lastIndex);

            const isLastEmpty = lastWorkspace.list_windows().every(w =>
                w.is_on_all_workspaces() || w === window || w.is_above()
            );

            let targetWorkspace;
            if (isLastEmpty) {
                targetWorkspace = lastWorkspace;
            } else {
                targetWorkspace = workspaceManager.append_new_workspace(false, 0);
            }

            if (window.get_workspace() !== targetWorkspace) {
                // 1. Memoriza onde estamos
                const workspaceDeOrigem = workspaceManager.get_active_workspace();

                // 2. Move a janela
                window.change_workspace(targetWorkspace);

                // 3. Verifica se deve focar
                const globalFocus = this._settings.get_boolean('focus-new-workspace');

                if (globalFocus && !moveInBackground) {
                    Main.activateWindow(window);
                } else {
                    // Força a volta se a opção estiver desligada
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        workspaceDeOrigem.activate(global.get_current_time());
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }

            return GLib.SOURCE_REMOVE;
        });
    }

    _appWindowsChanged(app) {
        const data = this._appData.get(app);
        const windows = app.get_windows();

        windows.push(...data.windows.filter(w => {
            return !windows.includes(w) && w.get_compositor_private() !== null;
        }));

        if (this._appConfigs.has(app.id)) {
            windows.filter(w => !data.windows.includes(w)).forEach(window => {
                this._moveWindow(window, app);
            });
        }

        data.windows = windows;
    }
}

export default class AutoMoveExtension extends Extension {
    _getSettingsSafe() {
        try {
            return this.getSettings();
        } catch (e) {
            const schemaId = this.metadata['settings-schema'];
            const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                this.path,
                Gio.SettingsSchemaSource.get_default(),
                false
            );
            const schema = schemaSource.lookup(schemaId, true);
            if (!schema) {
                throw new Error(`Schema ${schemaId} not found in ${this.path}`);
            }
            return new Gio.Settings({ settings_schema: schema });
        }
    }

    enable() {
        // REMOVIDO: A linha que travava o gerenciador de workspaces
        this._windowMover = new WindowMover(this._getSettingsSafe());
    }

    disable() {
        // REMOVIDO: A linha que restaurava o gerenciador (não é mais necessária)
        if (this._windowMover) {
            this._windowMover.destroy();
            delete this._windowMover;
        }
    }
}

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
        this._timeouts = new Set(); // Rastreia timers para limpeza segura

        this._appSystem.connectObject('installed-changed',
            () => this._safeUpdateAppData(), this);

        this._settings.connectObject('changed',
            this._safeUpdateAppConfigs.bind(this), this);
        
        this._safeUpdateAppConfigs();
    }

    _safeUpdateAppConfigs() {
        try {
            this._updateAppConfigs();
        } catch (e) {
            console.error('[AutoMove] Error updating configs:', e);
        }
    }

    _safeUpdateAppData() {
        try {
            this._updateAppData();
        } catch (e) {
            console.error('[AutoMove] Error updating app data:', e);
        }
    }

    _updateAppConfigs() {
        this._appConfigs.clear();
        const settingsList = this._settings.get_strv('application-list');

        settingsList.forEach(v => {
            if (!v || v.trim() === '') return;
            const parts = v.split(':');
            const appId = parts[0];
            if (appId) {
                const bgString = parts[2];
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
                (a) => {
                    try {
                        this._appWindowsChanged(a);
                    } catch (e) {
                        console.error('[AutoMove] Error in windows-changed:', e);
                    }
                }, this);
            this._appData.set(app, { windows: app.get_windows() });
        });
    }

    destroy() {
        // Limpa todos os timers pendentes para evitar crash
        this._timeouts.forEach(id => GLib.source_remove(id));
        this._timeouts.clear();

        this._appSystem.disconnectObject(this);
        if (this._settings) {
            this._settings.disconnectObject(this);
        }
        this._settings = null;
        this._appConfigs.clear();
        
        // Desconecta sinais dos apps
        [...this._appData.keys()].forEach(app => app.disconnectObject(this));
        this._appData.clear();
    }

    _moveWindow(window, app) {
        // CRITICAL CHECK: Se a extensão foi destruída, pare imediatamente.
        if (!this._settings) return;

        if (this._processedWindows.has(window)) return;
        this._processedWindows.add(window);

        // Tratamento seguro de janelas filhas (Modais)
        try {
            const parent = window.get_transient_for();
            if (parent) {
                const parentWorkspace = parent.get_workspace();
                if (window.get_workspace() !== parentWorkspace) {
                    window.change_workspace(parentWorkspace);
                    parentWorkspace.activate(global.get_current_time());
                }
                return;
            }
        } catch (e) {
            console.warn('[AutoMove] Failed to handle modal window:', e);
            return;
        }

        if (window.skip_taskbar || window.is_on_all_workspaces()) return;
        if (window.get_window_type() !== Meta.WindowType.NORMAL) return;
        if (window.is_above()) return;

        const currentWorkspace = window.get_workspace();
        const hasSibling = app.get_windows().some(w =>
            w !== window &&
            w.get_workspace() === currentWorkspace &&
            !w.skip_taskbar &&
            !w.is_on_all_workspaces()
        );

        if (hasSibling) return;

        const config = this._appConfigs.get(app.get_id());
        const moveInBackground = config ? config.background : false;

        // Cria o timer e salva o ID para poder cancelar se necessário
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._timeouts.delete(timeoutId); // Remove da lista de ativos
            
            // CRITICAL CHECK 2: Configurações ainda existem?
            if (!this._settings) return GLib.SOURCE_REMOVE;

            try {
                if (!window.get_compositor_private() || window.get_transient_for()) {
                    return GLib.SOURCE_REMOVE;
                }

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
                    const workspaceDeOrigem = workspaceManager.get_active_workspace();
                    
                    window.change_workspace(targetWorkspace);

                    const globalFocus = this._settings.get_boolean('focus-new-workspace');

                    if (globalFocus && !moveInBackground) {
                        Main.activateWindow(window);
                    } else if (moveInBackground) {
                        // Modo background seguro
                        const bgTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            this._timeouts.delete(bgTimer);
                            if (this._settings && workspaceManager.get_active_workspace() !== workspaceDeOrigem) {
                                workspaceDeOrigem.activate(global.get_current_time());
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                        this._timeouts.add(bgTimer);
                    }
                }
            } catch (err) {
                console.error('[AutoMove] Error moving window:', err);
            }

            return GLib.SOURCE_REMOVE;
        });

        this._timeouts.add(timeoutId);
    }

    _appWindowsChanged(app) {
        const data = this._appData.get(app);
        if (!data) return;

        const windows = app.get_windows();
        const newWindows = windows.filter(w => !data.windows.includes(w) && w.get_compositor_private() !== null);

        if (this._appConfigs.has(app.id)) {
            newWindows.forEach(window => {
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
                // Fail gracefully instead of crashing
                console.error(`[AutoMove] Schema ${schemaId} not found`);
                return null;
            }
            return new Gio.Settings({ settings_schema: schema });
        }
    }

    enable() {
        const settings = this._getSettingsSafe();
        if (settings) {
            this._windowMover = new WindowMover(settings);
        }
    }

    disable() {
        if (this._windowMover) {
            this._windowMover.destroy();
            this._windowMover = null;
        }
    }
}

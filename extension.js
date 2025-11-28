// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta'; // <--- Importamos Meta para verificar tipos de janela
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

class WindowMover {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._appConfigs = new Set();
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
            const [appId, _] = v.split(':');
            if (appId) {
                this._appConfigs.add(appId);
            }
        });
        this._updateAppData();
    }

    _updateAppData() {
        const ids = [...this._appConfigs];
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
            this._appData.set(app, {windows: app.get_windows()});
        });
    }

    destroy() {
        this._appSystem.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;
        this._appConfigs.clear();
        this._updateAppData();
    }

    _moveWindow(window) {
        if (this._processedWindows.has(window))
            return;

        // --- FILTROS DE SEGURANÇA ---
        
        if (window.skip_taskbar || window.is_on_all_workspaces())
            return;

        // 1. Verifica se a janela tem uma "mãe" (transient_for).
        // Se tiver, ela é uma filha (pop-up, diálogo) e deve ficar junto da mãe.
        if (window.get_transient_for() !== null)
            return;

        // 2. Verifica o tipo da janela.
        // Se não for uma janela NORMAL (ex: é um DIALOG ou UTILITY), ignoramos.
        if (window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        // ---------------------------

        this._processedWindows.add(window);

        // Usamos o timeout de 100ms (compatibilidade com Mosaic + tempo para propriedades carregarem)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            
            // Verificação dupla de segurança dentro do timeout (pois propriedades podem mudar)
            if (!window.get_compositor_private()) return GLib.SOURCE_REMOVE;
            if (window.get_transient_for() !== null) return GLib.SOURCE_REMOVE;

            const workspaceManager = global.workspace_manager;
            const lastIndex = workspaceManager.n_workspaces - 1;
            const lastWorkspace = workspaceManager.get_workspace_by_index(lastIndex);
            
            const isLastEmpty = lastWorkspace.list_windows().every(w => 
                w.is_on_all_workspaces() || w === window
            );
            
            let targetWorkspace;
            
            if (isLastEmpty) {
                targetWorkspace = lastWorkspace;
            } else {
                targetWorkspace = workspaceManager.append_new_workspace(false, 0);
            }
            
            if (window.get_workspace() !== targetWorkspace) {
                window.change_workspace(targetWorkspace);
            }
            
            Main.activateWindow(window);

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
                this._moveWindow(window);
            });
        }
        
        data.windows = windows;
    }
}

export default class AutoMoveExtension extends Extension {
    enable() {
        this._prevCheckWorkspaces = Main.wm._workspaceTracker._checkWorkspaces;
        Main.wm._workspaceTracker._checkWorkspaces =
            this._getCheckWorkspaceOverride(this._prevCheckWorkspaces);
        this._windowMover = new WindowMover(this.getSettings());
    }

    disable() {
        Main.wm._workspaceTracker._checkWorkspaces = this._prevCheckWorkspaces;
        if (this._windowMover) {
            this._windowMover.destroy();
            delete this._windowMover;
        }
    }

    _getCheckWorkspaceOverride(originalMethod) {
        return function () {
            const keepAliveWorkspaces = [];
            let foundNonEmpty = false;
            for (let i = this._workspaces.length - 1; i >= 0; i--) {
                if (!foundNonEmpty) {
                    foundNonEmpty = this._workspaces[i].list_windows().some(
                        w => !w.is_on_all_workspaces());
                } else if (!this._workspaces[i]._keepAliveId) {
                    keepAliveWorkspaces.push(this._workspaces[i]);
                }
            }

            keepAliveWorkspaces.forEach(ws => (ws._keepAliveId = 1));
            originalMethod.call(this);
            keepAliveWorkspaces.forEach(ws => delete ws._keepAliveId);

            return false;
        };
    }
}

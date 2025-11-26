// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2011 Alessandro Crismani <alessandro.crismani@gmail.com>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

class WindowMover {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._appConfigs = new Set();
        this._appData = new Map();
        
        // Conjunto para rastrear processos agendados e limpar depois
        this._idleIds = new Set();

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
        // Limpeza rigorosa: remove qualquer ação pendente
        this._idleIds.forEach(id => GLib.Source.remove(id));
        this._idleIds.clear();

        this._appSystem.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;

        this._appConfigs.clear();
        this._updateAppData();
    }

    _moveWindow(window) {
        if (window.skip_taskbar || window.is_on_all_workspaces())
            return;

        // Agendamos a movimentação para o próximo ciclo (idle)
        // para garantir que a janela foi totalmente criada pelo sistema.
        let idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            // Removemos este ID da lista de rastreio pois já está executando
            this._idleIds.delete(idleId);

            // Verificação de segurança: a janela ainda existe?
            if (!window.get_compositor_private())
                return GLib.SOURCE_REMOVE;

            const workspaceManager = global.workspace_manager;
            const lastIndex = workspaceManager.n_workspaces - 1;
            const lastWorkspace = workspaceManager.get_workspace_by_index(lastIndex);
            
            // Verifica se o último workspace está vazio
            const isLastEmpty = lastWorkspace.list_windows().every(w => w.is_on_all_workspaces());

            let targetWorkspace;

            if (isLastEmpty) {
                targetWorkspace = lastWorkspace;
            } else {
                // Cria novo workspace sem ativar imediatamente (ativaremos abaixo)
                targetWorkspace = workspaceManager.append_new_workspace(false, 0);
            }
            
            // Move a janela
            window.change_workspace(targetWorkspace);
            
            // Garante foco, traz para frente e muda o usuário para o workspace
            Main.activateWindow(window);

            return GLib.SOURCE_REMOVE;
        });
        
        // Adicionamos o ID à lista para poder cancelar no destroy() se necessário
        this._idleIds.add(idleId);
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
        /* eslint-disable no

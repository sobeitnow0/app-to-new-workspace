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
        // Usamos WeakSet para não vazar memória segurando referências de janelas fechadas
        this._processedWindows = new WeakSet();

        this._appSystem.connectObject('installed-changed',
            () => this._updateAppData(), this);

        this._settings.connectObject('changed',
            this._updateAppConfigs.bind(this), this);
        this._updateAppConfigs();
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
        // Se já processamos essa janela, ignora para evitar loops
        if (this._processedWindows.has(window)) return;

        // --- CORREÇÃO 1: Tratamento de Modais (Janelas Filhas) ---
        const parent = window.get_transient_for();
        if (parent) {
            // Se a janela tem mãe, ela deve seguir a mãe, não importa a configuração
            const parentWorkspace = parent.get_workspace();
            if (window.get_workspace() !== parentWorkspace) {
                window.change_workspace(parentWorkspace);
                // Opcional: focar na modal para o usuário não se perder
                parentWorkspace.activate(global.get_current_time()); 
            }
            this._processedWindows.add(window);
            return; 
        }
        // ---------------------------------------------------------

        if (window.skip_taskbar || window.is_on_all_workspaces()) return;

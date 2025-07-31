/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';

const _handles = [];
const _windowids_moved = {}; // Renomeado para refletir o novo propósito

// Define o schema de configurações para a extensão
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.your-extension-name'; // **Mude 'your-extension-name' para o nome real da sua extensão**
const SETTINGS_KEY_APPS = 'apps-to-isolate';

export default class Extension {
    constructor() {
    }

    // Primeiro workspace livre no monitor especificado
    getFirstFreeMonitor(manager, mMonitor) {
        const n = manager.get_n_workspaces();
        for (let i = 0; i < n; i++) {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor() == mMonitor).length;
            if (win_count < 1)
                return i;
        }
        return -1;
    }

    // Último workspace ocupado no monitor especificado
    getLastOccupiedMonitor(manager, nCurrent, mMonitor) {
        for (let i = nCurrent - 1; i >= 0; i--) {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor() == mMonitor).length;
            if (win_count > 0)
                return i;
        }
        const n = manager.get_n_workspaces();
        for (let i = nCurrent + 1; i < n; i++) {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor() == mMonitor).length;
            if (win_count > 0)
                return i;
        }
        return -1;
    }

    // Mover a janela para um workspace livre
    placeOnNewWorkspace(win) {
        // Verifica se a janela já foi movida por esta extensão para evitar loops
        if (win.get_id() in _windowids_moved) {
            return;
        }

        const mMonitor = win.get_monitor();
        const manager = win.get_display().get_workspace_manager();
        const current = manager.get_active_workspace_index();

        const bWorkspacesOnlyOnPrimary = this._mutterSettings.get_boolean('workspaces-only-on-primary');

        let targetWorkspaceIndex = -1;

        if (bWorkspacesOnlyOnPrimary) {
            const mPrimary = win.get_display().get_primary_monitor();
            if (mMonitor !== mPrimary) {
                return; // Se workspaces são apenas no primário, e a janela não está nele, ignora
            }
            targetWorkspaceIndex = this.getFirstFreeMonitor(manager, mMonitor);
        } else {
            // Se workspaces em todos os monitores, busca um workspace livre no monitor da janela
            targetWorkspaceIndex = this.getFirstFreeMonitor(manager, mMonitor);
        }

        if (targetWorkspaceIndex === -1) {
            // Se não encontrou um workspace livre, cria um novo
            manager.create_workspace(current + 1);
            targetWorkspaceIndex = current + 1;
        }

        if (targetWorkspaceIndex !== current) {
            // Move a janela para o workspace alvo
            win.change_workspace_by_index(targetWorkspaceIndex, false);
            manager.get_workspace_by_index(targetWorkspaceIndex).activate(global.get_current_time()); // Opcional: ativa o novo workspace

            // Registra que esta janela foi movida para evitar re-movê-la
            _windowids_moved[win.get_id()] = true;
        }
    }

    // Retornar o workspace ao estado original se vazio
    backToPreviousWorkspace(win) {
        // Se a janela não foi movida por esta extensão, não faz nada
        if (!(win.get_id() in _windowids_moved)) {
            return;
        }

        // Remove do registro, pois a janela está saindo do workspace isolado
        delete _windowids_moved[win.get_id()];

        const mMonitor = win.get_monitor();
        const manager = win.get_display().get_workspace_manager();
        const current = win.get_workspace().index(); // Pega o índice do workspace da janela que está sendo destruída/minimizado/etc.

        // Verifica se o workspace da janela que está sendo fechada/minimizada está agora vazio
        const windowsInCurrentWorkspace = manager.get_workspace_by_index(current)
                                                .list_windows()
                                                .filter(w => !w.is_always_on_all_workspaces() && w.get_monitor() === mMonitor && w !== win)
                                                .length;

        if (windowsInCurrentWorkspace === 0) {
            // Se o workspace está vazio, remove-o ou reorganiza
            if (this._mutterSettings.get_boolean('dynamic-workspaces')) {
                // Se workspaces dinâmicos estão ativos, o sistema deve remover automaticamente
                // o workspace vazio. Não é necessário fazer nada aqui.
            } else {
                // Se não são dinâmicos, move os workspaces após o atual para trás
                const lastOccupied = this.getLastOccupiedMonitor(manager, current, mMonitor);
                if (lastOccupied !== -1 && lastOccupied < current) {
                    manager.reorder_workspace(manager.get_workspace_by_index(current), lastOccupied);
                } else if (lastOccupied !== -1 && lastOccupied > current) {
                     // Caso o último ocupado esteja à frente, precisamos de uma lógica mais robusta para "fechar" o workspace vazio
                    manager.remove_workspace(manager.get_workspace_by_index(current), global.get_current_time());
                } else if (manager.get_n_workspaces() > 1) { // Se for o único workspace e for o da janela, não remove
                     manager.remove_workspace(manager.get_workspace_by_index(current), global.get_current_time());
                }
            }
        }
    }

    // Evento quando uma janela é mapeada (aparece na tela)
    window_manager_map(act) {
        const win = act.meta_window;

        // Ignora janelas que não são "normais" ou que estão em todos os workspaces
        if (win.window_type !== Meta.WindowType.NORMAL || win.is_always_on_all_workspaces()) {
            return;
        }

        // Obtém o app_id da janela
        const app_id = win.get_wm_class(); // get_wm_class() é um bom substituto para get_app_id() em muitos casos

        // Verifica se o app_id está na lista de aplicativos pré-selecionados
        if (this._selectedApps.includes(app_id)) {
            this.placeOnNewWorkspace(win);
        }
    }

    // Evento quando uma janela é destruída (fechada)
    window_manager_destroy(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL) {
            return;
        }
        this.backToPreviousWorkspace(win);
    }

    // Evento quando uma janela é minimizada
    window_manager_minimize(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL || win.is_always_on_all_workspaces()) {
            return;
        }
        this.backToPreviousWorkspace(win);
    }

    // Não precisamos mais dos eventos de maximizar/desmaximizar para o comportamento principal
    // window_manager_size_change(act, change, rectold) {}
    // window_manager_size_changed(act) {}
    // window_manager_unminimize(act) {}

    enable() {
        this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        
        // Carrega as configurações da sua extensão
        this._settings = new Gio.Settings({ schema_id: SETTINGS_SCHEMA });
        this._selectedApps = this._settings.get_strv(SETTINGS_KEY_APPS); // Pega a lista de strings (app_ids)

        // Monitora mudanças nas configurações para atualizar a lista de apps
        _handles.push(this._settings.connect(`changed::${SETTINGS_KEY_APPS}`, () => {
            this._selectedApps = this._settings.get_strv(SETTINGS_KEY_APPS);
        }));

        _handles.push(global.window_manager.connect('map', (_, act) => { this.window_manager_map(act); }));
        _handles.push(global.window_manager.connect('destroy', (_, act) => { this.window_manager_destroy(act); }));
        _handles.push(global.window_manager.connect('minimize', (_, act) => { this.window_manager_minimize(act); }));
    }

    disable() {
        _handles.splice(0).forEach(h => global.window_manager.disconnect(h));
        this._mutterSettings = null;
        this._settings = null;
        this._selectedApps = [];
        // Limpa o registro de janelas movidas
        for (const key in _windowids_moved) {
            delete _windowids_moved[key];
        }
    }
}

// extension.js
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';

// Função para obter settings (necessária para prefs.js)
export function getSettings() {
    return new Gio.Settings({
        schema: 'apptonewworkspace_sobeit_com'
    });
}

let _signalId = 0;
let settings;

/**
 * Log condicional (só mostra se habilitado nas configurações)
 */
function debugLog(message) {
    if (settings.get_boolean('enable-logging')) {
        console.log(`[AppToNewWorkspace] ${message}`);
    }
}

/**
 * Verifica se a janela pertence a um app da lista de alvo
 */
function shouldHandleApp(win) {
    if (!win) return false;

    const wmClass = win.get_wm_class() || '';
    const app = win.get_application();
    const appId = app?.get_id() || '';
    const title = win.get_title() || '';

    debugLog(`Janela: "${title}" | wm_class: "${wmClass}" | app_id: "${appId}"`);

    const targetApps = settings.get_strv('target-apps');
    const lowerWm = wmClass.toLowerCase();
    const lowerAppId = appId.toLowerCase();
    const lowerTitle = title.toLowerCase();

    for (const target of targetApps) {
        const t = target.toLowerCase();
        if (
            lowerAppId.includes(t) ||
            lowerWm.includes(t) ||
            lowerTitle.includes(t)
        ) {
            debugLog(`✅ Match! App: "${target}" → Janela: "${title}"`);
            return true;
        }
    }
    return false;
}

function getOrCreateEmptyWorkspace(wm, monitorIndex) {
    const n = wm.get_n_workspaces();

    for (let i = 0; i < n; i++) {
        const ws = wm.get_workspace_by_index(i);
        const windows = ws.list_windows().filter(w =>
            !w.is_always_on_all_workspaces() &&
            w.get_window_type() === Meta.WindowType.NORMAL &&
            w.get_monitor() === monitorIndex
        );

        if (windows.length === 0) {
            debugLog(`Usando workspace vazio existente: ${i}`);
            return ws;
        }
    }

    debugLog('Criando novo workspace');
    return wm.append_new_workspace(false, global.get_current_time());
}

function moveToNewWorkspace(win, wmManager) {
    const monitorIndex = win.get_monitor();
    const emptyWs = getOrCreateEmptyWorkspace(wmManager, monitorIndex);
    const targetIndex = emptyWs.index();

    win.change_workspace(emptyWs);
    emptyWs.activate(global.get_current_time());

    debugLog(`Janela movida para workspace ${targetIndex}`);
}

function onWindowAdded(wm, actor) {
    const win = actor.meta_window;

    if (!win || win.window_type !== Meta.WindowType.NORMAL) {
        return;
    }

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        if (shouldHandleApp(win)) {
            const wmManager = win.get_display().get_workspace_manager();
            moveToNewWorkspace(win, wmManager);
        }
        return GLib.SOURCE_REMOVE;
    });
}

function enable() {
    settings = getSettings();
    debugLog('Extensão ativada');
    _signalId = global.window_manager.connect('map', onWindowAdded);
}

function disable() {
    if (_signalId > 0) {
        global.window_manager.disconnect(_signalId);
        _signalId = 0;
    }
    debugLog('Extensão desativada');
}

export { enable, disable };

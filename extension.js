// extension.js - Lógica principal da extensão "Redirecionador de Aplicativos para Nova Área de Trabalho"

// Importa os módulos necessários do GNOME Shell e Gtk
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const Meta = imports.gi.Meta; // Para interagir com o gerenciador de janelas
const Gio = imports.gi.Gio;   // Para lidar com aplicativos e GSettings
const GLib = imports.gi.GLib; // Para funções de utilidade (como timeouts)

// Variáveis globais para a extensão
let _settings;
let _windowCreatedSignalId;
let _redirectingWindow = null; // Usado para evitar recursão ao mover a janela

// Função para obter as configurações da extensão
function getSettings() {
    // Carrega o esquema GSettings definido em schemas/org.gnome.shell.extensions.app-to-new-workspace.gschema.xml
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
        Me.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    const schema = schemaSource.lookup('org.gnome.shell.extensions.app-to-new-workspace', true);
    if (!schema) {
        throw new Error('Esquema GSettings não encontrado. Verifique o arquivo gschema.xml.');
    }

    return new Gio.Settings({ settings_schema: schema });
}

// Handler para o evento de criação de janela
function onWindowCreated(display, window) {
    // Ignora janelas que não são do tipo "normal" (ex: dialogs, tooltips)
    if (window.get_window_type() !== Meta.WindowType.NORMAL) {
        return;
    }

    // Se esta janela está sendo redirecionada por nós mesmos, ignora para evitar recursão
    if (_redirectingWindow === window) {
        _redirectingWindow = null; // Reseta após o uso
        return;
    }

    const app = window.get_application();
    if (!app) {
        // A janela ainda não tem um aplicativo associado, tente novamente em um pequeno atraso
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            onWindowCreated(display, window);
            return GLib.SOURCE_REMOVE;
        });
        return;
    }

    const appId = app.get_id();
    const appsToRedirect = _settings.get_strv('applications-to-redirect');

    // Verifica se o ID do aplicativo está na lista de apps para redirecionar
    if (appsToRedirect.includes(appId)) {
        log(`[${Me.metadata.name}] Janela criada para aplicativo selecionado: ${appId}`);

        // Adiciona um pequeno atraso para garantir que a janela esteja totalmente mapeada e pronta para ser movida
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            // Cria uma nova área de trabalho
            const workspaceManager = global.workspace_manager;
            const newWorkspaceIndex = workspaceManager.get_n_workspaces(); // A nova área de trabalho será a última
            workspaceManager.append_new_workspace(false, global.get_current_time());
            log(`[${Me.metadata.name}] Nova área de trabalho criada no índice: ${newWorkspaceIndex}`);

            // Marca esta janela como sendo redirecionada por nós
            _redirectingWindow = window;

            // Move a janela para a nova área de trabalho
            window.change_workspace_by_index(newWorkspaceIndex, global.get_current_time());
            log(`[${Me.metadata.name}] Janela de ${appId} movida para a área de trabalho ${newWorkspaceIndex}`);

            // Ativa a nova área de trabalho
            const newWorkspace = workspaceManager.get_workspace_by_index(newWorkspaceIndex);
            if (newWorkspace) {
                newWorkspace.activate(global.get_current_time());
                log(`[${Me.metadata.name}] Ativando a área de trabalho: ${newWorkspaceIndex}`);
            } else {
                logError(`[${Me.metadata.name}] Não foi possível obter a nova área de trabalho no índice: ${newWorkspaceIndex}`);
            }

            return GLib.SOURCE_REMOVE; // Remove o timeout após a execução
        });
    }
}

// Função de inicialização da extensão
function init() {
    log(`[${Me.metadata.name}] Inicializando extensão.`);
}

// Função de habilitação da extensão
function enable() {
    log(`[${Me.metadata.name}] Habilitando extensão.`);
    _settings = getSettings();

    // Conecta ao sinal 'window-created' do display global
    _windowCreatedSignalId = global.display.connect('window-created', onWindowCreated);
}

// Função de desabilitação da extensão
function disable() {
    log(`[${Me.metadata.name}] Desabilitando extensão.`);

    // Desconecta o sinal para evitar vazamentos de memória ou comportamento indesejado
    if (_windowCreatedSignalId) {
        global.display.disconnect(_windowCreatedSignalId);
        _windowCreatedSignalId = null;
    }

    if (_settings) {
        _settings = null;
    }
    _redirectingWindow = null;
}

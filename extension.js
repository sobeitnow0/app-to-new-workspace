// Importa módulos necessários
const { Meta } = imports.gi;
const Gio = imports.gi.Gio; 

// Nome do esquema GSettings
const SCHEMA_ID = 'com.sobeitnow0.AutoNewWorkspace';

// Classe principal da Extensão
class Extension {
    constructor() {
        this.windowCreatedSignal = null;
        this.settings = null;
    }

    disable() {
        if (this.windowCreatedSignal) {
            global.display.disconnect(this.windowCreatedSignal);
            this.windowCreatedSignal = null;
        }
        this.settings = null;
    }

    enable() {
        // Inicializa o GSettings para ler as configurações
        this.settings = this._getSettings();
        
        // Conecta à função _onClientMapped
        this.windowCreatedSignal = global.display.connect(
            'client-mapped',
            this._onClientMapped.bind(this)
        );
    }

    // Função auxiliar para inicializar GSettings, garantindo que o esquema seja lido
    _getSettings() {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        
        const dir = Gio.File.new_for_path(Me.path + '/schemas');
        
        const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            dir.get_path(), 
            Gio.SettingsSchemaSource.get_default(), 
            false
        );

        const schema = schemaSource.lookup(SCHEMA_ID, true);

        if (!schema) {
            log(`[Auto New Workspace] Esquema não encontrado: ${SCHEMA_ID}`);
            return null;
        }

        return new Gio.Settings({ settings_schema: schema });
    }

    _onClientMapped(display, window) {
        // 1. FILTRO DE JANELA: Ignora janelas não-aplicativas
        if (window.is_override_redirect() || window.is_skip_taskbar()) {
            return;
        }

        // 2. FILTRO DE APLICATIVO: Verifica se o aplicativo está na lista
        const app_list = this.settings.get_strv('application-list');
        const app = window.get_application();
        
        if (!app || !app_list.includes(app.get_id())) {
            return;
        }

        // --- LÓGICA DE WORKSPACE ---
        
        const wsManager = global.workspace_manager;
        let targetWorkspace = null;

        // 3. BUSCA: Encontrar o primeiro Workspace Vazio
        for (let i = 0; i < wsManager.get_n_workspaces(); i++) {
            let workspace = wsManager.get_workspace_by_index(i);
            
            if (workspace.list_windows().length === 0) {
                targetWorkspace = workspace;
                break; 
            }
        }

        // 4. CRIAÇÃO: Se não houver vazio, crie um novo.
        if (!targetWorkspace) {
            wsManager.append_new_workspace(false, global.display.get_current_time());
            targetWorkspace = wsManager.get_workspace_by_index(wsManager.get_n_workspaces() - 1);
        }

        // 5. AÇÃO: Mover a janela e focar
        window.change_workspace(targetWorkspace);
        targetWorkspace.activate(global.display.get_current_time());
    }
}

function init() {
    return new Extension();
}

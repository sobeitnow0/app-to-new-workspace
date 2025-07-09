// prefs.js - Interface de usuário para as preferências da extensão

// Importa os módulos necessários para a interface de preferências
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Adw = imports.gi.Adw; // Para widgets modernos do GNOME (GTK4)
const GLib = imports.gi.GLib;

// Variável para armazenar as configurações
let _settings;

// Função para construir a interface de preferências
function buildPrefsWidget() {
    // Carrega as configurações da extensão
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
        Me.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    const schema = schemaSource.lookup('org.gnome.shell.extensions.app-to-new-workspace', true);
    if (!schema) {
        throw new Error('Esquema GSettings não encontrado. Verifique o arquivo gschema.xml.');
    }
    _settings = new Gio.Settings({ settings_schema: schema });

    // Cria o widget principal da janela de preferências (Adw.PreferencesWindow para GTK4)
    const prefsWindow = new Adw.PreferencesWindow({
        title: 'Preferências do Redirecionador de Aplicativos',
        modal: true,
        resizable: false,
    });

    // Cria uma página de preferências
    const page = new Adw.PreferencesPage();
    prefsWindow.add(page);

    // Cria um grupo para as opções
    const group = new Adw.PreferencesGroup({
        title: 'Aplicativos para Redirecionar',
        description: 'Selecione os aplicativos que sempre serão abertos em uma nova área de trabalho vazia.'
    });
    page.add(group);

    // Obtém todos os aplicativos instalados no sistema
    const allApps = Gio.AppInfo.get_all();
    // Filtra para obter apenas aplicativos que podem ser lançados
    const launchableApps = allApps.filter(app => app.should_show());
    // Ordena os aplicativos por nome
    launchableApps.sort((a, b) => GLib.strcasecmp(a.get_display_name(), b.get_display_name()));

    // Obtém os IDs dos aplicativos atualmente selecionados para redirecionamento
    let appsToRedirect = _settings.get_strv('applications-to-redirect');

    // Cria um dicionário para verificar rapidamente se um app está selecionado
    const selectedAppsMap = new Set(appsToRedirect);

    // Para cada aplicativo, cria uma linha de preferência com um switch
    launchableApps.forEach(app => {
        const appName = app.get_display_name();
        const appId = app.get_id(); // O ID do aplicativo (ex: 'firefox.desktop')

        const row = new Adw.ActionRow({
            title: appName,
        });

        const appSwitch = new Gtk.Switch({
            active: selectedAppsMap.has(appId), // Define o estado inicial do switch
            valign: Gtk.Align.CENTER,
        });

        // Conecta o switch ao evento 'notify::active' para atualizar as configurações
        appSwitch.connect('notify::active', () => {
            if (appSwitch.active) {
                // Adiciona o ID do aplicativo se o switch estiver ativo
                appsToRedirect.push(appId);
            } else {
                // Remove o ID do aplicativo se o switch estiver inativo
                appsToRedirect = appsToRedirect.filter(id => id !== appId);
            }
            // Salva a lista atualizada de IDs de aplicativos
            _settings.set_strv('applications-to-redirect', appsToRedirect);
            log(`[${Me.metadata.name}] Aplicativos para redirecionar atualizados: ${appsToRedirect.join(', ')}`);
        });

        row.add_suffix(appSwitch); // Adiciona o switch à direita da linha
        row.set_activatable_widget(appSwitch); // Torna o switch ativável ao clicar na linha
        group.add(row); // Adiciona a linha ao grupo
    });

    // Retorna o widget principal da janela de preferências
    return prefsWindow;
}

const { Adw, Gtk, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const SCHEMA_ID = 'com.sobeitnow0.AutoNewWorkspace';

class Prefs {
    constructor() {
        this._settings = new Gio.Settings({ schema_id: SCHEMA_ID });
    }

    buildPrefsWidget() {
        const prefsWidget = new Adw.PreferencesPage();
        prefsWidget.set_title("Configuração de Aplicativos");

        const appGroup = new Adw.PreferencesGroup({
            title: "Aplicativos para Mover Automaticamente",
            description: "Selecione quais aplicativos terão suas janelas movidas para o primeiro workspace vazio (criando um novo se necessário).",
        });

        let currentList = this._settings.get_strv('application-list');
        let apps = Gio.AppInfo.get_all();

        // Ordena os aplicativos pelo nome
        apps.sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

        for (const app of apps) {
            if (!app.get_id() || !app.should_show()) {
                continue;
            }

            const appId = app.get_id();
            const appName = app.get_display_name();

            const toggle = new Gtk.Switch({
                active: currentList.includes(appId), 
                valign: Gtk.Align.CENTER,
            });

            const row = new Adw.ActionRow({
                title: appName,
                subtitle: appId,
            });

            row.add_suffix(toggle);
            row.set_activatable_widget(toggle);

            // Conexão da mudança de estado
            toggle.connect('state-set', (sw, state) => {
                let list = this._settings.get_strv('application-list');
                
                if (state) {
                    if (!list.includes(appId)) {
                        list.push(appId);
                    }
                } else {
                    list = list.filter(id => id !== appId);
                }
                
                this._settings.set_strv('application-list', list);
                return false;
            });

            appGroup.add(row);
        }

        prefsWidget.add(appGroup);
        return prefsWidget;
    }
}

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    const prefs = new Prefs();
    window.add(prefs.buildPrefsWidget());
}

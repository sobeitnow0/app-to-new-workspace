// prefs.js
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Extension from './extension.js';

const SettingsRow = GObject.registerClass(
class SettingsRow extends Adw.PreferencesRow {
    constructor(settings) {
        super();

        this.settings = settings;

        this.box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_start: 10,
            margin_end: 10,
            margin_top: 10,
            margin_bottom: 10
        });

        this.entry = new Gtk.Entry({
            hexpand: true,
            placeholder_text: 'Ex: code, spotify, Alacritty'
        });
        this.button = new Gtk.Button({
            label: 'Remover',
            valign: Gtk.Align.CENTER
        });

        this.box.append(this.entry);
        this.box.append(this.button);

        this.set_child(this.box);

        this.button.connect('clicked', () => {
            const current = this.settings.get_strv('target-apps');
            const filtered = current.filter(app => app !== this.entry.text);
            this.settings.set_strv('target-apps', filtered);
            this.destroy();
        });
    }

    setText(text) {
        this.entry.text = text;
    }
});

const PreferencesPage = GObject.registerClass(
class PreferencesPage extends Adw.PreferencesPage {
    constructor(settings) {
        super();

        this.settings = settings;

        // Seção: Apps
        const appsGroup = new Adw.PreferencesGroup();
        appsGroup.title = 'Aplicativos Alvo';

        // Lista de apps
        this.listBox = new Gtk.ListBox();
        this.listBox.selection_mode = Gtk.SelectionMode.NONE;
        this.listBox.add_css_class('boxed-list');
        appsGroup.add(this.listBox);

        // Campo para adicionar novo
        const addBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_start: 10,
            margin_end: 10,
            margin_bottom: 10
        });

        this.newEntry = new Gtk.Entry({
            placeholder_text: 'Adicionar novo app (app_id, wm_class ou título)',
            hexpand: true
        });

        this.addButton = new Gtk.Button({
            label: 'Adicionar',
            valign: Gtk.Align.CENTER
        });

        addBox.append(this.newEntry);
        addBox.append(this.addButton);
        appsGroup.add(addBox);

        this.add(appsGroup);

        // Seção: Depuração
        const debugGroup = new Adw.PreferencesGroup();
        debugGroup.title = 'Depuração';

        const loggingSwitch = new Gtk.Switch({
            active: this.settings.get_boolean('enable-logging'),
            valign: Gtk.Align.CENTER
        });

        const loggingRow = new Adw.ActionRow();
        loggingRow.title = 'Habilitar logs';
        loggingRow.subtitle = 'Mostra logs no journalctl (útil para depuração)';
        loggingRow.add_suffix(loggingSwitch);
        loggingRow.activatable_widget = loggingSwitch;

        debugGroup.add(loggingRow);
        this.add(debugGroup);

        // Conectar sinais
        this.addButton.connect('clicked', () => this.onAddApp());
        this.newEntry.connect('activate', () => this.onAddApp());

        loggingSwitch.connect('notify::active', (sw) => {
            this.settings.set_boolean('enable-logging', sw.active);
        });

        // Carregar apps existentes
        this.loadApps();
    }

    onAddApp() {
        const text = this.newEntry.text.trim();
        if (!text) return;

        const current = this.settings.get_strv('target-apps');
        if (!current.includes(text)) {
            this.settings.set_strv('target-apps', [...current, text]);
            this.addAppRow(text);
        }
        this.newEntry.text = '';
    }

    loadApps() {
        const apps = this.settings.get_strv('target-apps');
        apps.forEach(app => this.addAppRow(app));
    }

    addAppRow(app) {
        const row = new SettingsRow(this.settings);
        row.setText(app);
        this.listBox.append(row);
    }
});

export default class AppInNewWorkspacePrefs {
    constructor() {
        this.settings = Extension.getSettings();
    }

    fillPreferencesWindow(window) {
        window._settings = this.settings;

        const page = new PreferencesPage(this.settings);
        page.settings = this.settings;

        window.add(page);
    }
}

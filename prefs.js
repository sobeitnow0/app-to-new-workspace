// SPDX-FileCopyrightText: 2012 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_KEY = 'application-list';

class NewItem extends GObject.Object {}
GObject.registerClass(NewItem);

class NewItemModel extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static {
        GObject.registerClass(this);
    }

    #item = new NewItem();

    vfunc_get_item_type() {
        return NewItem;
    }

    vfunc_get_n_items() {
        return 1;
    }

    vfunc_get_item(_pos) {
        return this.#item;
    }
}

class Rule extends GObject.Object {
    static [GObject.properties] = {
        'app-info': GObject.ParamSpec.object(
            'app-info', null, null,
            GObject.ParamFlags.READWRITE,
            GioUnix.DesktopAppInfo),
        // Mantemos a propriedade workspace mas não a exibimos, apenas para compatibilidade interna
        'workspace': GObject.ParamSpec.uint(
            'workspace', null, null,
            GObject.ParamFlags.READWRITE,
            1, 36, 1),
    };

    static {
        GObject.registerClass(this);
    }
}

class RulesList extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static {
        GObject.registerClass(this);
    }

    #settings;
    #rules = [];
    #changedId;

    constructor(settings) {
        super();

        this.#settings = settings;
        this.#changedId =
            this.#settings.connect(`changed::${SETTINGS_KEY}`,
                () => this.#sync());
        this.#sync();
    }

    append(appInfo) {
        const pos = this.#rules.length;

        // Hardcoded workspace 1, pois a extensão ignora o numero agora
        this.#rules.push(new Rule({appInfo, workspace: 1}));
        this.#saveRules();

        this.items_changed(pos, 0, 1);
    }

    remove(id) {
        const pos = this.#rules.findIndex(r => r.appInfo.get_id() === id);
        if (pos < 0)
            return;

        this.#rules.splice(pos, 1);
        this.#saveRules();

        this.items_changed(pos, 1, 0);
    }

    #saveRules() {
        this.#settings.block_signal_handler(this.#changedId);
        // Salva sempre com :1 para manter compatibilidade com o schema XML
        this.#settings.set_strv(SETTINGS_KEY,
            this.#rules.map(r => `${r.app_info.get_id()}:1`));
        this.#settings.unblock_signal_handler(this.#changedId);
    }

    #sync() {
        const removed = this.#rules.length;

        this.#rules = [];
        for (const stringRule of this.#settings.get_strv(SETTINGS_KEY)) {
            const [id, _] = stringRule.split(':');
            const appInfo = GioUnix.DesktopAppInfo.new(id);
            if (appInfo)
                this.#rules.push(new Rule({appInfo, workspace: 1}));
            else
                log(`Invalid ID ${id}`);
        }
        this.items_changed(0, removed, this.#rules.length);
    }

    vfunc_get_item_type() {
        return Rule;
    }

    vfunc_get_n_items() {
        return this.#rules.length;
    }

    vfunc_get_item(pos) {
        return this.#rules[pos] ?? null;
    }
}

class AutoMoveSettingsWidget extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);

        this.install_action('rules.add', null, self => self._addNewRule());
        this.install_action('rules.remove', 's',
            (self, name, param) => self._rules.remove(param.unpack()));
    }

    constructor(settings) {
        super({
            title: _('Aplicativos para Novo Workspace'),
            description: _('Aplicativos selecionados abrirão automaticamente em um novo workspace vazio.'),
        });

        this._settings = settings;
        this._rules = new RulesList(this._settings);

        const store = new Gio.ListStore({item_type: Gio.ListModel});
        const listModel = new Gtk.FlattenListModel({model: store});
        store.append(this._rules);
        store.append(new NewItemModel());

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this.add(this._list);

        this._list.bind_model(listModel, item => {
            return item instanceof NewItem
                ? new NewRuleRow()
                : new RuleRow(item);
        });
    }

    _addNewRule() {
        const dialog = new NewRuleDialog(this.get_root(), this._settings);
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
            if (appInfo)
                this._rules.append(appInfo);
            dialog.destroy();
        });
        dialog.show();
    }
}

class RuleRow extends Adw.ActionRow {
    static {
        GObject.registerClass(this);
    }

    constructor(rule) {
        const {appInfo} = rule;
        const id = appInfo.get_id();

        super({
            activatable: false,
            title: rule.appInfo.get_display_name(),
        });

        const icon = new Gtk.Image({
            css_classes: ['icon-dropshadow'],
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        this.add_prefix(icon);

        // Removemos o seletor de Workspace aqui

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', id),
            icon_name: 'edit-delete-symbolic',
            has_frame: false,
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(button);
    }
}

class NewRuleRow extends Gtk.ListBoxRow {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            action_name: 'rules.add',
            child: new Gtk.Image({
                icon_name: 'list-add-symbolic',
                pixel_size: 16,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            }),
        });
        this.update_property(
            [Gtk.AccessibleProperty.LABEL], [_('Adicionar App')]);
    }
}

class NewRuleDialog extends Gtk.AppChooserDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(parent, settings) {
        super({
            transient_for: parent,
            modal: true,
        });

        this._settings = settings;

        this.get_widget().set({
            show_all: true,
            show_other: true, 
        });

        this.get_widget().connect('application-selected',
            this._updateSensitivity.bind(this));
        this._updateSensitivity();
    }

    _updateSensitivity() {
        const rules = this._settings.get_strv(SETTINGS_KEY);
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !rules.some(i => i.startsWith(appInfo.get_id())));
    }
}

export default class AutoMovePrefs extends ExtensionPreferences {
    getPreferencesWidget() {
        return new AutoMoveSettingsWidget(this.getSettings());
    }
}

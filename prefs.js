cat <<EOF > prefs.js
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_KEY = 'application-list';
const WORKSPACE_MAX = 36; 

class NewItem extends GObject.Object {}
GObject.registerClass(NewItem);

class NewItemModel extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static { GObject.registerClass(this); }
    #item = new NewItem();
    vfunc_get_item_type() { return NewItem; }
    vfunc_get_n_items() { return 1; }
    vfunc_get_item(_pos) { return this.#item; }
}

class Rule extends GObject.Object {
    static [GObject.properties] = {
        'app-info': GObject.ParamSpec.object('app-info', null, null, GObject.ParamFlags.READWRITE, GioUnix.DesktopAppInfo),
        'workspace': GObject.ParamSpec.uint('workspace', null, null, GObject.ParamFlags.READWRITE, 1, WORKSPACE_MAX, 1),
    };
    static { GObject.registerClass(this); }
}

class RulesList extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static { GObject.registerClass(this); }
    #settings; #rules = []; #changedId;

    constructor(settings) {
        super();
        this.#settings = settings;
        this.#changedId = this.#settings.connect(\`changed::\${SETTINGS_KEY}\`, () => this.#sync());
        this.#sync();
    }

    append(appInfo) {
        const pos = this.#rules.length;
        this.#rules.push(new Rule({appInfo, workspace: 1}));
        this.#saveRules();
        this.items_changed(pos, 0, 1);
    }

    remove(id) {
        const pos = this.#rules.findIndex(r => r.appInfo.get_id() === id);
        if (pos < 0) return;
        this.#rules.splice(pos, 1);
        this.#saveRules();
        this.items_changed(pos, 1, 0);
    }

    changeWorkspace(id, workspace) {
        const pos = this.#rules.findIndex(r => r.appInfo.get_id() === id);
        if (pos < 0) return;
        this.#rules[pos].set({workspace});
        this.#saveRules();
    }

    #saveRules() {
        this.#settings.block_signal_handler(this.#changedId);
        this.#settings.set_strv(SETTINGS_KEY, this.#rules.map(r => \`\${r.app_info.get_id()}:\${r.workspace}\`));
        this.#settings.unblock_signal_handler(this.#changedId);
    }

    #sync() {
        const removed = this.#rules.length;
        this.#rules = [];
        for (const stringRule of this.#settings.get_strv(SETTINGS_KEY)) {
            const [id, workspace] = stringRule.split(':');
            const appInfo = GioUnix.DesktopAppInfo.new(id);
            if (appInfo) this.#rules.push(new Rule({appInfo, workspace}));
        }
        this.items_changed(0, removed, this.#rules.length);
    }

    vfunc_get_item_type() { return Rule; }
    vfunc_get_n_items() { return this.#rules.length; }
    vfunc_get_item(pos) { return this.#rules[pos] ?? null; }
}

class AutoMoveSettingsWidget extends Adw.PreferencesGroup {
    static { GObject.registerClass(this); }

    constructor(settings) {
        super({
            title: _('Application List'),
            description: _('Apps added here will open in a new workspace.'),
        });
        this._settings = settings;
        this._rules = new RulesList(this._settings);

        const actionGroup = new Gio.SimpleActionGroup();
        this.insert_action_group('rules', actionGroup);

        const addAction = new Gio.SimpleAction({ name: 'add' });
        addAction.connect('activate', () => this._addNewRule());
        actionGroup.add_action(addAction);

        const removeAction = new Gio.SimpleAction({ name: 'remove', parameter_type: new GLib.VariantType('s') });
        removeAction.connect('activate', (_, param) => { this._rules.remove(param.unpack()); });
        actionGroup.add_action(removeAction);

        const store = new Gio.ListStore({item_type: Gio.ListModel});
        const listModel = new Gtk.FlattenListModel({model: store});
        store.append(this._rules);
        store.append(new NewItemModel());

        this._list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
        this.add(this._list);
        this._list.bind_model(listModel, item => item instanceof NewItem ? new NewRuleRow() : new RuleRow(item));
    }

    _addNewRule() {
        const dialog = new NewRuleDialog(this.get_root(), this._settings);
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK ? dialog.get_widget().get_app_info() : null;
            if (appInfo) this._rules.append(appInfo);
            dialog.destroy();
        });
        dialog.show();
    }
}

class RuleRow extends Adw.ActionRow {
    static { GObject.registerClass(this); }
    constructor(rule) {
        const {appInfo} = rule;
        const id = appInfo.get_id();
        super({ activatable: false, title: rule.appInfo.get_display_name() });
        const icon = new Gtk.Image({ css_classes: ['icon-dropshadow'], gicon: appInfo.get_icon(), pixel_size: 32 });
        this.add_prefix(icon);
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
    static { GObject.registerClass(this); }
    constructor() {
        super({
            action_name: 'rules.add',
            child: new Gtk.Image({ icon_name: 'list-add-symbolic', pixel_size: 16, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 }),
        });
        this.update_property([Gtk.AccessibleProperty.LABEL], [_('Add Rule')]);
    }
}

class NewRuleDialog extends Gtk.AppChooserDialog {
    static { GObject.registerClass(this); }
    constructor(parent, settings) {
        super({ transient_for: parent, modal: true });
        this._settings = settings;
        this.get_widget().set({ show_all: true, show_other: true });
        this.get_widget().connect('application-selected', this._updateSensitivity.bind(this));
        this._updateSensitivity();
    }
    _updateSensitivity() {
        const rules = this._settings.get_strv(SETTINGS_KEY);
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK, appInfo && !rules.some(i => i.startsWith(appInfo.get_id())));
    }
}

export default class AutoMovePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new AutoMoveSettingsWidget(settings);
        page.add(group);
        window.add(page);
    }
}
EOF

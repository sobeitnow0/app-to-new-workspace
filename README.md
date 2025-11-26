# Auto Move to New Workspace

**Auto Move to New Workspace** is a GNOME Shell extension that automatically moves specific applications to a new, empty workspace as soon as they are opened.

Unlike the original extension which binds apps to fixed workspace numbers (e.g., "Firefox on Workspace 2"), this extension embraces GNOME's **dynamic workspace** philosophy. It ensures that your focus apps always get their own isolated space, without you having to manage workspace numbers manually.

## 🚀 Features

* **Dynamic Allocation:** Automatically detects the last available workspace. If it's empty, it uses it; if not, it creates a new one.
* **Zero Gaps:** Integrates with GNOME's native dynamic workspaces logic to prevent empty "ghost" workspaces.
* **Focus Management:** Uses `idle_add` strategies to handle race conditions, ensuring the window is fully mapped, moved, and focused immediately.
* **Minimalist Configuration:** Just add the apps you want to isolate. No need to assign numbers.

## ⚙️ Installation

### Manual Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/sobeitnow/auto-move-new-workspace.git](https://github.com/sobeitnow/auto-move-new-workspace.git)
    ```

2.  **Move to the extensions directory:**
    ```bash
    cp -r auto-move-new-workspace/auto-move-new-workspace@sobeitnow ~/.local/share/gnome-shell/extensions/
    ```

3.  **Compile the Schemas (Crucial):**
    Navigate to the extension folder and compile the settings schema. Without this, the extension will not load.
    ```bash
    cd ~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow
    glib-compile-schemas .
    ```

4.  **Restart GNOME Shell:**
    * **Wayland:** Log out and log back in.
    * **X11:** Press `Alt` + `F2`, type `r`, and hit `Enter`.

5.  **Enable the extension:**
    ```bash
    gnome-extensions enable auto-move-new-workspace@sobeitnow
    ```

## 🛠 Usage

1.  Open the **Extensions** app (or run `gnome-extensions prefs auto-move-new-workspace@sobeitnow`).
2.  Click "Add App".
3.  Select the application you want to isolate (e.g., Firefox, VS Code, Spotify).
4.  That's it! Next time you open that app, it will slide to a fresh workspace.

## 👏 Acknowledgements & Credits

This extension is a fork based on the robust architecture of **Auto Move Windows**, part of the official [GNOME Shell Extensions](https://gitlab.gnome.org/GNOME/gnome-shell-extensions) collection.

I would like to sincerely thank the original authors and the GNOME team for providing the solid foundation that made this modification possible.

* **Original Project:** [Auto Move Windows (GNOME GitLab)](https://gitlab.gnome.org/GNOME/gnome-shell-extensions/-/tree/main/extensions/auto-move-windows?ref_type=heads)
* **License:** This project respects the original terms and is distributed under the **GPL-2.0-or-later** license.

## 📜 License

Distributed under the GNU General Public License v2.0 or later. See `COPYING` for more information.

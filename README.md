# Auto Move to New Workspace

**Auto Move to New Workspace** is a GNOME Shell extension that automatically moves specific applications to a new, empty workspace as soon as they are opened.

Unlike the original extension which binds apps to fixed workspace numbers, this extension embraces GNOME's **dynamic workspace** philosophy. It ensures that your focused apps always get their own isolated space, automatically creating new workspaces when needed without leaving empty gaps.

## 🚀 Features

* **Dynamic Allocation:** Automatically detects the last available workspace. If it's empty, it uses it; if not, it creates a new one.
* **Tiling Manager Compatible:** Tuned with a strategic delay to work seamlessly alongside tiling extensions like **Mosaic**, **Forge**, or **Pop Shell**.
* **Smart Child Window Handling:** Detects dialogs, popups, and "Save As" windows, keeping them attached to their parent application instead of moving them away.
* **Universal Support:** Works out-of-the-box with Native apps (`apt`/`dnf`), **Flatpaks**, and **Snaps**.
* **Loop Protection:** Includes "vaccine" logic to prevent infinite workspace creation loops.

## ⚙️ Installation

### Manual Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/sobeitnow/auto-move-new-workspace.git](https://github.com/sobeitnow/auto-move-new-workspace.git)
    ```

2.  **Move to the extensions directory:**
    ```bash
    mkdir -p ~/.local/share/gnome-shell/extensions
    cp -r auto-move-new-workspace/auto-move-new-workspace@sobeitnow ~/.local/share/gnome-shell/extensions/
    ```

3.  **Compile the Schemas (Crucial Step):**
    Navigate to the extension folder and compile the settings schema.
    ```bash
    cd ~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow
    glib-compile-schemas .
    ```

4.  **Restart GNOME Shell:**
    * **Wayland Users:** Log Out and Log back in.
    * **X11 Users:** Press `Alt` + `F2`, type `r`, and hit `Enter`.

5.  **Enable the extension:**
    ```bash
    gnome-extensions enable auto-move-new-workspace@sobeitnow
    ```

## 🛠 Configuration & Usage

### Basic Usage
1.  Open the **Extensions** app (or run `gnome-extensions prefs auto-move-new-workspace@sobeitnow`).
2.  Click "Add App".
3.  Select the application you want to isolate (e.g., Firefox, VS Code, Spotify).

### Handling Flatpaks and Snaps
The extension automatically detects installed Flatpaks and Snaps. Just select them from the list.

---

## 🔧 Troubleshooting

### App opens in a "Login" window (e.g., Ferdium)
If an app opens a helper window first and isn't detected:
1.  Open the app and use GNOME Looking Glass (`Alt`+`F2`, type `lg`) to find the real `wmclass`.
2.  Use **Dconf Editor** to manually add the ID to `/org/gnome/shell/extensions/auto-move-new-workspace/application-list`.

---

## 🧠 Technical Architecture

### Compatibility Strategy (`timeout_add`)
We use a `GLib.timeout_add` strategy with a slight delay (100ms). This prevents race conditions with the window compositor and ensures compatibility with Tiling Window Managers like **Mosaic**.

### Infinite Loop Prevention (`WeakSet`)
We implement a `WeakSet` named `_processedWindows` to "vaccinate" windows once they are handled, preventing recursive workspace creation loops.

### Child Window Detection
To ensure a cohesive workflow, the extension checks window properties before moving:
1.  **Transient Check:** Uses `window.get_transient_for()` to see if the window belongs to a parent.
2.  **Type Check:** Verifies `window.get_window_type()` to ignore `DIALOG`, `UTILITY`, or `MODAL` windows.

## 👏 Acknowledgements

Based on the **Auto Move Windows** extension from the official [GNOME Shell Extensions](https://gitlab.gnome.org/GNOME/gnome-shell-extensions) collection.
Distributed under the **GPL-2.0-or-later** license.

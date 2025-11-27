# Auto Move to New Workspace

**Auto Move to New Workspace** is a GNOME Shell extension that automatically moves specific applications to a new, empty workspace as soon as they are opened.

Unlike the original extension which binds apps to fixed workspace numbers (e.g., "Firefox on Workspace 2"), this extension embraces GNOME's **dynamic workspace** philosophy. It ensures that your focused apps always get their own isolated space, automatically creating new workspaces when needed without leaving empty gaps.

## 🚀 Features

* **Dynamic Allocation:** Automatically detects the last available workspace. If it's empty, it uses it; if not, it creates a new one.
* **Tiling Manager Compatible:** Specifically tuned with a slight delay to work seamlessly alongside tiling extensions like **Mosaic**, **Forge**, or **Pop Shell**.
* **Zero Gaps:** Integrates with GNOME's native dynamic logic to prevent "ghost" workspaces.
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
    Navigate to the extension folder and compile the settings schema. The extension **will not load** without this.
    ```bash
    cd ~/.local/share/gnome-shell/extensions/auto-move-new-workspace@sobeitnow
    glib-compile-schemas .
    ```

4.  **Restart GNOME Shell:**
    * **Wayland Users (Ubuntu 22.04+, Fedora):** You must **Log Out** and Log back in.
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
4.  **Done!** Next time you open that app, it will slide to a fresh workspace.

### Handling Flatpaks and Snaps
The extension automatically detects installed Flatpaks and Snaps. Just select them from the list. No manual ID entry is required.

---

## 🔧 Troubleshooting & Advanced Tips

### Conflict with "Mosaic" or Tiling Extensions
This extension is optimized to work with **Mosaic**. If you experience layout glitches:
* Ensure you are using the latest version of this extension.
* We use a 100ms delay to allow Mosaic to finish its layout calculations before we move the window.

---

## 🧠 Technical Architecture

For developers or curious users, here is how the extension handles window management.

### Compatibility Strategy (`timeout_add`)
Instead of aggressively moving the window immediately (which conflicts with Tiling Window Managers like **Mosaic**), we use a `GLib.timeout_add` strategy with a slight delay (100ms).

This approach serves two purposes:
1.  **Race Condition Prevention:** Ensures the window compositor has fully registered the window properties.
2.  **Ecosystem Compatibility:** Gives other extensions enough time to perform their layout calculations without fighting for control, preventing crashes and visual glitches.

### Infinite Loop Prevention (`WeakSet`)
We implement a `WeakSet` named `_processedWindows` to "vaccinate" windows once they are handled. This prevents the "Infinite Workspace Loop" bug where moving a window triggers a new creation event recursively.

## 👏 Acknowledgements & Credits

This extension is a fork based on the robust architecture of **Auto Move Windows**, part of the official [GNOME Shell Extensions](https://gitlab.gnome.org/GNOME/gnome-shell-extensions) collection.

* **Original Project:** [Auto Move Windows (GNOME GitLab)](https://gitlab.gnome.org/GNOME/gnome-shell-extensions/-/tree/main/extensions/auto-move-windows?ref_type=heads)
* **License:** Distributed under the **GPL-2.0-or-later** license.

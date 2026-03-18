# Edge Alt-Tab

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-blue)](https://microsoftedge.microsoft.com/addons/microsoft-edge-add-ons)

**Edge Alt-Tab** is a productivity extension for Microsoft Edge and Google Chrome that brings the professional "Most Recently Used" (MRU) tab switching experience to your browser. Perfectly mimic the native Alt-Tab behavior found in Windows and Ubuntu.

<p align="center">
  <img src="icon128.png" alt="Edge Alt-Tab Logo" width="128">
</p>

## ✨ Features

- **🚀 True MRU Switching:** Always toggle back to your last-used tab instantly.
- **🎨 Fluent Design UI:** A beautiful, modern overlay featuring acrylic transparency (blur) and smooth scale animations.
- **⚙️ Fully Customizable:** 
  - Toggle between **Fluent** (Modern) and **Simple** (Classic) themes.
  - Choose a custom **Accent Color** for the selection indicator or use the browser default.
- **🖱️ Mouse & Keyboard Support:** 
  - Cycle through history with `Alt + Q`.
  - Click directly on a tab in the list to switch immediately.
  - Click the backdrop or press `Esc` to cancel.
- **🌐 Universal Icons:** Secure Base64 proxying ensures high-quality favicons load for all tabs, including `localhost` and local files, without triggering security prompts.
- **💾 Persistent History:** Your tab order is preserved across extension reloads and browser restarts.
- **🔒 Privacy First:** No data collection. Tab history is stored strictly on your local machine.

## ⌨️ Shortcuts

- **Trigger/Cycle:** `Alt + Q` (Default)
- **Commit:** Release `Alt` or click a tab.
- **Cancel:** Press `Esc` or click the backdrop.

> **Note:** You can customize the shortcut at `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`.

## 🛠️ Installation (Developer Mode)

1. Clone this repository or download the source code.
2. Open Microsoft Edge/Chrome and navigate to the **Extensions** page.
3. Enable **Developer mode** (toggle in the bottom-left or top-right).
4. Click **Load unpacked**.
5. Select the project folder.

## 🎨 Icon Generation

If you are contributing or forking this repo, you can use the included `generate_icons.html` file to recreate the project icons in all required sizes using the HTML5 Canvas API.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with ❤️ for power users.*

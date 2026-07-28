# Atual.dev Dashboard

![Electron](https://img.shields.io/badge/Electron-43.2.0-47848F)
![License](https://img.shields.io/badge/license-MIT-blue)
![React Doctor](https://img.shields.io/badge/React%20Doctor-100%25-22c55e)

A modern, real-time **system monitoring dashboard** built with **Electron v43**. Monitor your computer's CPU, memory, disk, network, processes, and battery — all in one beautiful desktop app with animated gauges, live charts, and a dark/light theme.

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Install & Run

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd atual-dev-dashboard

# 2. Install dependencies
npm install

# 3. Start the dashboard
npm start

# 4. Or start with DevTools open (for development)
npm run dev
```

> **Note:** On Windows, you may see a PowerShell/WMIC command window flash briefly — this is normal. The app uses system commands to gather data.

---

## 📁 Project Structure

```
atual-dev-dashboard/
├── src/
│   ├── main/
│   │   └── main.js                # 🧠 Main process (Node.js backend)
│   ├── preload/
│   │   └── preload.js             # 🔌 Secure bridge (contextBridge)
│   └── renderer/
│       ├── index.html              # 📄 HTML shell
│       ├── script/
│       │   ├── app.js              # 🎯 App orchestrator (entry point)
│       │   ├── charts.js           # 📈 Line charts & donut chart engine
│       │   ├── gauges.js           # ⭕ Animated ring gauge component
│       │   ├── utils.js            # 🧰 Shared helpers (formatBytes, $, etc.)
│       │   └── sections/
│       │       ├── overview-section.js     # Dashboard overview + system info
│       │       ├── performance-section.js  # CPU/Memory bars, gauges, charts
│       │       ├── developer-section.js    # npm/pip package manager
│       │       ├── network-section.js      # Network interfaces & speed
│       │       ├── disk-section.js         # Storage drive utilization
│       │       ├── processes-section.js    # Running processes table
│       │       ├── battery-section.js      # Battery gauge & power status
│       │       └── system-section.js       # OS details (imported by overview)
│       └── style/
│           ├── style.css                    # Global styles + theme variables
│           └── sections/
│               ├── overview.css
│               ├── performance.css
│               ├── developer.css
│               ├── network.css
│               ├── disk.css
│               ├── processes.css
│               └── battery.css
├── assets/
│   └── icon.png                    # App icon
├── package.json
├── .gitignore
└── README.md                       # 📖 You are here!
```

---

## 🧠 Architecture

This is an **Electron** app: a web page (HTML + CSS + JS) runs inside a desktop window and communicates with the operating system through a secure bridge.

### The Three Layers

```
┌──────────────────────────────────────────────────────────┐
│                    🖥️ OPERATING SYSTEM                     │
│  (CPU, Memory, Disk, Network, Processes, Battery, etc.)   │
└────────────────────┬─────────────────────────────────────┘
                     │  Node.js APIs
                     ▼
┌──────────────────────────────────────────────────────────┐
│              🧠 MAIN PROCESS (main.js)                     │
│                                                           │
│  • Reads system data via `os`, `child_process`, WMI       │
│  • Manages the BrowserWindow                              │
│  • Handles IPC requests from the renderer                 │
│  • Caches expensive data to avoid repeated exec() calls   │
│  • Runs elevated commands (UAC) when needed               │
└────────────────────┬─────────────────────────────────────┘
                     │  IPC (ipcMain / ipcRenderer)
                     ▼
┌──────────────────────────────────────────────────────────┐
│              🔌 PRELOAD SCRIPT (preload.js)                │
│                                                           │
│  • Securely exposes window.electronAPI to the renderer    │
│  • Uses contextBridge — no direct Node.js access          │
│  • Lists exactly which IPC channels are available         │
└────────────────────┬─────────────────────────────────────┘
                     │  contextBridge
                     ▼
┌──────────────────────────────────────────────────────────┐
│            🖥️ RENDERER PROCESS (index.html → app.js)      │
│                                                           │
│  • Pure frontend: HTML, CSS, ES modules                  │
│  • No Node.js access (security: sandbox + isolation)      │
│  • Calls window.electronAPI.* to fetch system data        │
│  • Renders live charts, gauges, and section content       │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. **App starts** → `main.js` creates a `BrowserWindow` and loads `index.html`
2. **Render cycle** (every 1.5s): `app.js` calls `window.electronAPI.getSystemInfo()` via IPC
3. **Main process** gathers data using `os.cpus()`, `os.totalmem()`, `exec()` for disk/processes, WMI/PowerShell for Windows-specific info (OS edition, battery, temperature)
4. **Data flows back** through the preload bridge
5. **Renderer updates** — each section function (`updateOverview`, `updatePerformancePage`, etc.) is called with fresh data
6. **Charts & gauges** animate smoothly via `requestAnimationFrame`

### Security

| Setting | Value | Why |
|---------|-------|-----|
| `nodeIntegration` | `false` | Webpage can't call Node.js APIs |
| `contextIsolation` | `true` | Preload and webpage run in separate worlds |
| `sandbox` | `true` | Extra OS-level sandboxing |
| IPC bridge | Whitelist-only | Only specific functions are exposed via `contextBridge` |

---

## 🗺️ Dashboard Sections

### 📊 Overview
Live summary of CPU load, memory usage, GPU temperature, and system uptime.
Also shows Device Info (processor, RAM, GPU, storage, system type) and Windows Info (edition, version, activation).

**File:** `overview-section.js` → `system-section.js`

### ⚡ Performance
- **CPU & Memory bars** — Color-coded progress bars (green → yellow → red)
- **Ring gauges** — Animated circular gauges for CPU, Memory, and Virtual Memory
- **Line charts** — Real-time history (60 samples) for CPU, Memory, and VM usage
- **Donut chart** — Memory distribution (used vs free)
- **Live metrics panel** — CPU, memory, temperature, load averages, free memory with bar animations

**File:** `performance-section.js`, `charts.js`, `gauges.js`

### 📦 Developer (Package Manager)
Manage globally installed npm and pip packages:
- **Tabbed interface** — Switch between npm and pip packages
- **Search & filter** — Real-time filtering as you type
- **Install** — Type a package name with autocomplete suggestions from the registry
- **Update / Uninstall** — Per-package action buttons
- **Admin detection** — Automatically detects if elevation is needed and offers to retry with admin privileges
- **Action log** — Shows command output in a collapsible panel

**File:** `developer-section.js`

### 🌐 Network
- **Real-time transfer speed** — Download/upload rates with adaptive bar scaling
- **All interfaces table** — Name, IP address, family (IPv4/IPv6), MAC address, internal status

**File:** `network-section.js`

### 💾 Disk
- **Per-drive cards** — Color-coded usage bars with mount point and total size
- **Storage summary** — Total, used, and free space across all drives

**File:** `disk-section.js`

### ⚙️ Processes
- **Top 30 processes** — Sorted by memory usage
- **Search** — Filter by process name in real time
- **PID, CPU %, memory columns** with memory usage bar

**File:** `processes-section.js`

### 🔋 Battery
- **Animated ring gauge** — Battery level with gradient colors (red → yellow → green)
- **Power status** — Charging, discharging, AC power, estimated runtime
- **Charge/discharge rate** — Calculated from level history over time
- **Detailed stats** — Design capacity, cycle count, voltage, chemistry (from WMI)

**File:** `battery-section.js`

---

## 🛠️ Features

| Feature | Details |
|---------|---------|
| ✅ **Real-time monitoring** | Auto-refreshes every 1.5 seconds |
| ✅ **Dark/Light theme** | Toggle with sidebar button or `Ctrl+T`; persisted in localStorage |
| ✅ **Smooth animations** | Canvas-based ring gauges with easing + line charts with 60s history |
| ✅ **Cross-platform** | Windows (WMI/PowerShell), macOS (pmset/ioreg), Linux (sysfs) |
| ✅ **Process search** | Filter running processes by name instantly |
| ✅ **Package manager** | Browse, install, update, and uninstall npm/pip global packages |
| ✅ **Admin elevation** | Auto-retries permission failures with UAC prompt |
| ✅ **Custom title bar** | Frameless window with minimize/maximize/close |
| ✅ **GPU info** | Reads GPU model and VRAM via Electron + WMI fallback |
| ✅ **CPU/GPU temperature** | Platform-specific thermal monitoring |
| ✅ **Network speed** | Real-time download/upload rate monitoring |
| ✅ **Secure** | `contextIsolation`, `sandbox`, no `nodeIntegration` |

---

## 🔧 Development

### Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch the dashboard |
| `npm run dev` | Launch with DevTools open |
| `npm run dist` | Build installers for current platform |
| `npm run dist:win` | Build Windows installer (NSIS) |
| `npm run dist:mac` | Build macOS DMG |
| `npm run dist:linux` | Build Linux AppImage + deb |

### Code Quality

This project is scanned with **React Doctor** — a deterministic code-quality tool:

```bash
npx react-doctor@latest
```

Current score: **100/100** — all Bugs, Security, Performance, and Maintainability issues resolved.

To check only new issues in a branch:
```bash
npx react-doctor@latest --scope changed
```

### Project Conventions

- **Main process** (`src/main/`): CommonJS (`require`/`module.exports`) — runs in Node.js
- **Renderer** (`src/renderer/`): ES modules (`import`/`export`) — runs in browser context
- **Each section** has its own JS module in `script/sections/` and CSS in `style/sections/`
- **Shared utilities** live in `utils.js`
- **Charts and gauges** are in dedicated modules (`charts.js`, `gauges.js`) for separation of concerns

---

## 🏗️ Building for Distribution

```bash
# Build for your current platform
npm run dist

# Build for a specific platform
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS DMG
npm run dist:linux  # Linux AppImage + deb
```

The build configuration is in `package.json` under the `"build"` key. Output goes to the `dist/` directory.

---

## 📄 License

MIT © Atual.dev

---

## 🙌 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Run `npx react-doctor@latest` to verify no regressions
5. Open a Pull Request

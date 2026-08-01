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
│   ├── main/                          # 🧠 Main process (Node.js backend)
│   │   ├── main.js                    # 🚀 Entry point: window + app lifecycle
│   │   ├── config.js                  # ⚙️ Window geometry, paths, safety limits
│   │   ├── ipc.js                     # 🔌 Every ipcMain.handle/on registration
│   │   ├── exec-async.js              # ⏱️ Promisified child_process.exec
│   │   ├── command-service.js         # ⚙️ Centralized exec: timeout/maxBuffer/errors
│   │   ├── logger.js                  # 📝 Local crash/error log (userData/logs)
│   │   ├── validators.js              # 🛡️ Phase 1 input validation (pure, tested)
│   │   └── providers/                 # 📡 System data collectors
│   │       ├── system.js              #   CPU, memory, OS edition/version/activation, GPU
│   │       ├── disk.js                #   Storage drive utilization
│   │       ├── battery.js             #   Battery level & specs
│   │       ├── temperature.js         #   CPU/GPU temperature
│   │       ├── network.js             #   Network transfer speed
│   │       ├── processes.js           #   Running process list
│   │       └── packages.js            #   npm/pip ops + whitelisted elevation
│   ├── preload/
│   │   └── preload.js                 # 🔌 Secure bridge (contextBridge)
│   └── renderer/
│       ├── index.html                 # 📄 HTML shell
│       ├── script/
│       │   ├── app.js                 # 🎯 App orchestrator (entry point)
│       │   ├── charts.js              # 📈 Line charts & donut chart engine
│       │   ├── gauges.js              # ⭕ Animated ring gauge component
│       │   ├── utils.js               # 🧰 Shared DOM/format helpers
│       │   ├── format.js              # 🎨 Shared formatters (speed, CPU model, errors)
│       │   ├── constants.js           # ⚙️ Refresh intervals + theme storage key
│       │   └── sections/              # 🧩 One module per section (init/update/destroy)
│       │       ├── overview-section.js       # Dashboard overview
│       │       ├── system-section.js         # Device + Windows info cards
│       │       ├── performance-section.js    # CPU/Memory bars, gauges, charts
│       │       ├── developer-section.js      # npm/pip package manager
│       │       ├── network-section.js        # Network interfaces & speed
│       │       ├── disk-section.js           # Storage drive utilization
│       │       ├── processes-section.js      # Running processes table
│       │       └── battery-section.js        # Battery gauge & power status
│       └── style/
│           ├── style.css                     # Global styles + theme variables
│           └── sections/                     # Per-section styles
│               ├── overview.css
│               ├── performance.css
│               ├── developer.css
│               ├── network.css
│               ├── disk.css
│               ├── processes.css
│               └── battery.css
├── scripts/                         # 🧪 Verification & evidence tooling
│   ├── evidence.js                  #   Phase 0 measure / capture / all
│   ├── launch-stability.js          #   Detached 30-min stability launch
│   ├── stability-harness.js         #   30-min stability test harness
│   └── verify-phase1.js             #   In-app hostile-package verification
├── test/                            # 🧪 Unit tests (node --test)
│   ├── validators.test.js           #   Phase 1 validators
│   ├── evidence.test.js             #   Phase 0 tool helpers
│   └── command-service.test.js      #   Phase 3 command service (8 tests)
├── assets/
│   └── icon.png                     # App icon
├── package.json
├── .gitignore
├── plan.md                          # 🗺️ Master roadmap
├── plan-phase.md                    # 📊 Phase tracker & evidence log
└── README.md                        # 📖 You are here!
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
│              🧠 MAIN PROCESS (main.js → providers/)        │
│                                                           │
│  • providers/* read system data via `os`, WMI, and the   │
│    command service (`command-service.js`)                │
│  • command-service.js centralizes exec(): standardized    │
│    timeout/maxBuffer/errors — never hangs, never rejects  │
│  • ipc.js registers every channel (single registration    │
│    point — no monolith)                                   │
│  • Manages the BrowserWindow                              │
│  • Caches expensive data to avoid repeated exec() calls   │
│  • Runs validated, whitelisted elevated commands (UAC)    │
│  • Crash guards: uncaughtException/unhandledRejection     │
│    logged to userData/logs + surfaced to the renderer     │
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
│  • app.js orchestrates sections via init/update/destroy   │
│  • Calls window.electronAPI.* to fetch system data        │
│  • Renders live charts, gauges, and section content       │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. **App starts** → `main.js` creates a `BrowserWindow` and loads `index.html`
2. **Render cycle** (every 1.5s): `app.js` calls `window.electronAPI.getSystemInfo()` via IPC
3. **Main process** — every provider shell call goes through `command-service.js` (battery, temperature, network, processes, disk, packages, system); `os`/WMI/PowerShell cover the rest
4. **Data flows back** through the preload bridge
5. **Renderer updates** — `app.js` calls each section's `update()` with fresh data
6. **Charts & gauges** animate smoothly via `requestAnimationFrame`

### Reliability (Phase 3)

- **Centralized command execution** — every provider shell call goes through `command-service.js`, which standardizes timeout (10 s default), `maxBuffer` (1 MB), and error normalization. `runCommand()` never rejects — it resolves a predictable result object, so providers use clean `async/await` instead of nested callbacks.
- **User-visible error states** — sections (disk, processes, network, battery, developer) show an inline ⚠️ banner when data fails to load and clear it automatically on the next successful refresh. No important failure hides in `console.error` alone.
- **Crash guards** — `uncaughtException` / `unhandledRejection` are logged locally to `<userData>/logs/main-error.log` and pushed to the renderer via `onMainError()`, which displays a fixed banner (auto-hides after 10 s). A main-process `uncaughtException` also closes the app shortly after the banner (the process state is unknown at that point); `unhandledRejection` is recoverable and keeps running.

### Security

| Setting | Value | Why |
|---------|-------|-----|
| `nodeIntegration` | `false` | Webpage can't call Node.js APIs |
| `contextIsolation` | `true` | Preload and webpage run in separate worlds |
| `sandbox` | `true` | Extra OS-level sandboxing |
| IPC bridge | Whitelist-only | Only specific functions are exposed via `contextBridge` |
| Input validation | `validators.js` | Every renderer-supplied value validated before any shell/network call |

---

## 🗺️ Dashboard Sections

### 📊 Overview
Live summary of CPU load, memory usage, GPU temperature, and system uptime.
Also shows Device Info (processor, RAM, GPU, storage, system type) and Windows Info (edition, version, activation).

**Files:** `overview-section.js` + `system-section.js`

### ⚡ Performance
- **CPU & Memory bars** — Color-coded progress bars (green → yellow → red)
- **Ring gauges** — Animated circular gauges for CPU, Memory, and Virtual Memory
- **Line charts** — Real-time history (60 samples) for CPU, Memory, and VM usage
- **Donut chart** — Memory distribution (used vs free)
- **Live metrics panel** — CPU, memory, temperature, load averages, free memory with bar animations

**Files:** `performance-section.js`, `charts.js`, `gauges.js`

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
| ✅ **Admin elevation** | Auto-retries permission failures with UAC prompt (whitelisted, validated) |
| ✅ **Custom title bar** | Frameless window with minimize/maximize/close |
| ✅ **GPU info** | Reads GPU model and VRAM via Electron + WMI fallback |
| ✅ **CPU/GPU temperature** | Platform-specific thermal monitoring |
| ✅ **Network speed** | Real-time download/upload rate monitoring |
| ✅ **Secure** | `contextIsolation`, `sandbox`, no `nodeIntegration`, validated IPC inputs |
| ✅ **Reliable** | Centralized command service (timeouts, no hangs), user-visible error banners per section, crash-guard logging + renderer alerts |

---

## 🔧 Development

### Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch the dashboard |
| `npm run dev` | Launch with DevTools open |
| `npm test` | Run unit tests (node --test, 32 tests) |
| `npm run doctor` | Run React Doctor code-quality scan |
| `npm run script:Phase1` | In-app security verification (boots real app, hostile probes) |
| `npm run dist:win` | Build Windows installer (NSIS) |
| `npm run dist:mac` | Build macOS DMG |
| `npm run dist:linux` | Build Linux AppImage + deb |

> **Note:** `npm run dist` (current-platform shorthand) is not defined — use the platform-specific commands above.

### Code Quality

This project is scanned with **React Doctor** — a deterministic code-quality tool:

```bash
npm run doctor
```

Current score: **100/100** — all Bugs, Security, Performance, and Maintainability issues resolved (React rules are informational for this non-React app; the security/maintainability signals are the real check).

To check only new issues in a branch:
```bash
npx react-doctor@latest --scope changed
```

### Testing

```bash
npm test
```

Runs `node --test` across `test/` (32 tests): Phase 1 input validators, Phase 0 evidence-tool helpers, and Phase 3 command-service tests (timeout/maxBuffer normalization, fallback-chain semantics, never-hang guarantees). Zero external test dependencies.

### Project Conventions

- **Main process** (`src/main/`): CommonJS (`require`/`module.exports`) — runs in Node.js
- **Providers** (`src/main/providers/`): one module per data domain; only the surface consumed by `ipc.js` is exported
- **Renderer** (`src/renderer/`): ES modules (`import`/`export`) — runs in browser context
- **Each section** (`script/sections/`) implements the `init()` / `update()` / `destroy()` lifecycle contract; `app.js` is the pure orchestrator
- **Shared utilities** live in `utils.js`; **formatters** in `format.js`; **intervals/keys** in `constants.js`
- **Charts and gauges** are in dedicated modules (`charts.js`, `gauges.js`) for separation of concerns

---

## 🗺️ Development Roadmap

The project follows a phased modernization plan:

| File | Purpose |
|------|---------|
| `plan.md` | Master roadmap: 11 phases from baseline → stable release |
| `plan-phase.md` | Living tracker: status, evidence, measurements, progress log |

**Status:** Phases 0–3 complete (baseline evidence, security hardening, architecture split + dead-code cleanup, reliability — command service, error states, crash guards). Phase 4 (TypeScript + Vite foundation) is next. See `plan-phase.md` for the full evidence log.

---

## 🏗️ Building for Distribution

```bash
# Windows NSIS installer
npm run dist:win

# macOS DMG
npm run dist:mac

# Linux AppImage + deb
npm run dist:linux
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
4. Run `npm test` and `npm run doctor` to verify no regressions
5. Open a Pull Request

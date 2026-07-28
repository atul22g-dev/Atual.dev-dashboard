# Atual.dev Dashboard

![Electron](https://img.shields.io/badge/Electron-43.2.0-47848F)
![License](https://img.shields.io/badge/license-MIT-blue)

A modern, real-time system monitoring dashboard built with **Electron v43**. Monitor your computer's CPU, memory, disk, network, processes, and battery — all in one beautiful desktop app.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- [Git](https://git-scm.com/)

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the dashboard (normal mode)
npm start

# 3. Or start with DevTools open (for developers)
npm run dev
```

---

## 📁 Project Structure

```
atual-dev-dashboard/
├── src/
│   ├── main/
│   │   └── main.js           # 🧠 Main process (Node.js backend)
│   ├── preload/
│   │   └── preload.js        # 🔌 Bridge between main & renderer
│   └── renderer/
│       ├── index.html         # 📄 HTML structure (the webpage)
│       ├── style.css          # 🎨 All CSS styles
│       ├── app.js             # 🎯 Main dashboard logic
│       ├── charts.js          # 📈 Chart engine (line & donut charts)
│       └── gauges.js          # ⭕ Animated ring gauge component
├── package.json               # 📦 Project config
├── .gitignore                 # 🙈 Files git should ignore
└── README.md                  # 📖 You are here!
```

---

## 🧠 Architecture (For Beginners)

This app uses **Electron**, which means it's a web app (HTML + CSS + JS) wrapped inside a desktop window. But how does it talk to your computer?

### The Two Processes

```
┌─────────────────────────────────────────────────────┐
│                  🖥️ YOUR COMPUTER                   │
│                                                     │
│  ┌──────────────┐       ┌──────────────────────┐   │
│  │  MAIN PROCESS │◄────►│  RENDERER PROCESS    │   │
│  │  (Node.js)    │  IPC │  (Webpage)           │   │
│  │               │      │                      │   │
│  │  • Reads CPU  │      │  • Shows dashboard   │   │
│  │  • Reads Disk │      │  • Draws charts      │   │
│  │  • Reads RAM  │      │  • Handles clicks    │   │
│  │  • Lists procs│      │  • Animates gauges   │   │
│  └───────┬───────┘      └──────────────────────┘   │
│          │                                               │
│  ┌───────┴───────┐                                       │
│  │  PRELOAD.JS   │  ← Secure bridge (middleman)          │
│  └───────────────┘                                       │
└─────────────────────────────────────────────────────┘
```

- **Main Process** (`src/main/main.js`): Has access to Node.js and your operating system. It reads system data (CPU, memory, disk, etc.) using built-in Node.js modules.
- **Renderer Process** (`src/renderer/*`): This is the web page you see. It has NO direct access to Node.js (security feature). It asks the main process for data through a secure bridge.
- **Preload Script** (`src/preload/preload.js`): The middleman that safely passes data between the two processes.

### How Data Flows

1. The app starts and creates a window
2. The renderer says: "Hey main process, what's my CPU usage?"
3. The preload script passes this request securely
4. The main process reads the CPU data from Node.js
5. The data flows back through the preload to the renderer
6. The renderer updates the dashboard UI

---

## 🗺️ Dashboard Sections

| Section | Description | Data Source |
|---------|-------------|-------------|
| **Overview** | Quick summary of CPU, memory, uptime, platform | `os` module |
| **System** | Detailed OS, CPU, and runtime versions | `os` module |
| **Performance** | Live CPU/Memory bars and animated ring gauges | `os` module |
| **Developer** | Real-time charts, network table, environment paths | `os` + `process` |
| **Network** | All network interfaces with IPs and MACs | `os.networkInterfaces()` |
| **Disk** | Drive usage with color-coded progress bars | `wmic` (Win) / `df` (Mac/Linux) |
| **Processes** | Top running processes with search | `tasklist` (Win) / `ps` (Mac/Linux) |
| **Battery** | Battery level gauge and power info | `electron.powerMonitor` |

---

## 🛠️ Features

- ✅ **Real-time monitoring** — Auto-refreshes every 3 seconds
- ✅ **Dark/Light theme** — Toggle with button or `Ctrl+T`
- ✅ **Smooth animations** — Canvas-based ring gauges & charts
- ✅ **Process search** — Filter running processes by name
- ✅ **Custom title bar** — Frameless window with drag support
- ✅ **Responsive layout** — Works at different window sizes
- ✅ **Secure** — `contextIsolation`, `sandbox`, no `nodeIntegration`

---

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Commit with clear messages
5. Open a Pull Request

---

## 📄 License

MIT © Atual.dev

# 📋 Development Plan — Atual.dev Dashboard

> A working, versioned development roadmap for the **Atual.dev Dashboard**, an Electron-based real-time system monitoring application.
>
> **This is the master roadmap.** It consolidates the engineering backlog, modernization vision, Windows-first strategy, low-end PC optimization, testing, and release work into one ordered, phase-by-phase improvement plan.

**Generated:** August 2026  
**Version:** 3.0.0 — phased modernization roadmap  
**License:** MIT

---

# 1. 🎯 Overview

## What this app is

Atual.dev Dashboard is a desktop system-monitoring application that displays:

- CPU usage and information
- Memory usage
- Disk information
- Network activity
- Processes
- Battery information
- CPU/GPU temperatures
- Developer package information for npm/pip
- Animated gauges
- Live charts
- Dark/light theme
- System information

The current application is feature-complete for v1 and works end-to-end through an Electron main process, preload bridge, and renderer.

## Modernization goal

Transform the existing application into a:

- Modern Windows desktop application
- Fast and lightweight application for low-end PCs
- Secure system-monitoring utility
- Maintainable TypeScript codebase
- Modern and responsive UI
- High-DPI / 4K compatible application
- Reliable offline-first application
- Properly packaged Windows application
- Easy-to-test and maintain application
- Safe and user-controlled update system

## Core principle

> **Modern does not mean heavy.**

The application should look and feel modern while keeping CPU, RAM, disk, and GPU usage low.

---

# 2. 🧭 Current State

## 2.1 Current Stack

| Area | Current |
|---|---|
| Desktop | Electron |
| Runtime | Node.js through Electron |
| Main process | CommonJS JavaScript |
| Renderer | ES modules / plain JavaScript |
| UI | HTML + CSS + JavaScript |
| Charts | Canvas |
| IPC | Electron contextBridge |
| Packaging | electron-builder |
| Platforms | Windows / macOS / Linux |
| Testing | No automated test framework currently |
| CI | No automated CI pipeline currently |

## 2.2 Current Architecture

```text
┌─────────────────────────────────────────────────────┐
│                    Operating System                 │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process              │
│                                                     │
│  System info / Disk / Battery / Network / Processes │
│  Temperature / Packages / Elevation / Window       │
└─────────────────────────┬───────────────────────────┘
                          │
                         IPC
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                    Preload Bridge                   │
│                                                     │
│              contextBridge / whitelist              │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                      Renderer                       │
│                                                     │
│ App orchestrator / Sections / Charts / Gauges / UI  │
└─────────────────────────────────────────────────────┘
```

## 2.3 Known Technical Debt

Status as of **2026-08-02** (Phases 0–3 complete): ✅ resolved · 🔄 in progress · ⏳ deferred.

- ✅ ~~`main.js` is a large monolithic file.~~ → split in Phase 2 (`main.js` entry + `providers/*` + `ipc.js` + `config.js` + `exec-async.js`)
- ✅ ~~Registry/package information must be safely escaped before entering HTML.~~ → Phase 1 (DOM-API rewriting, no unescaped dynamic HTML)
- ✅ ~~Renderer-provided values must never become arbitrary shell commands.~~ → Phase 1 (validated `validators.js`, whitelisted elevation)
- ✅ ~~Several command executions require consistent timeout and buffer handling.~~ → Phase 1 set timeout+maxBuffer everywhere; Phase 3 centralized them in `command-service.js` (`runCommand`/`runCommandUntilSuccess`, default 10 s / 1 MB, never-reject result objects)
- ✅ ~~There are nested callback chains that should become async/await.~~ → Phase 3 flattened all provider chains (battery/temperature/network/processes/disk/packages/system) onto the command service
- ⏳ Canvas rendering needs proper HiDPI support. → Phase 6
- ⏳ Refresh intervals are hardcoded and not adaptive. → centralized in `constants.js` (Phase 2); smart/adaptive polling is Phase 6
- ⏳ Hidden sections can perform unnecessary work. → Phase 6 (visibility-based work)
- ⏳ DOM elements are repeatedly queried in hot paths. → Phase 6 (cache DOM refs)
- ✅ ~~There is no automated test framework.~~ → `node --test` suite exists (24 tests: validators + evidence helpers); comprehensive coverage is Phase 5
- ⏳ There is no complete CI pipeline. → Phase 5
- ⏳ Windows WMI/`wmic` usage should move toward PowerShell/CIM-first behavior. → Phase 3/8
- ⏳ The UI needs a modern Windows-oriented visual system. → Phase 7
- 🔄 The project needs measurable low-end PC performance targets. → baseline measured in Phase 0 (`scripts/evidence.js measure`); targets enforced in Phase 6
- ⏳ The application needs a proper Windows packaging and release process. → Phase 9

---

# 3. 🏗️ Target Technology Stack

The modernization should use a lightweight stack.

| Area | Target |
|---|---|
| Desktop | Latest supported stable Electron release |
| Runtime | Node.js bundled through Electron |
| Language | TypeScript |
| Build | Vite |
| UI | Lightweight TypeScript UI; avoid unnecessary heavy frameworks |
| Styling | Modern CSS + CSS variables |
| Charts | Lightweight Canvas renderer |
| Unit tests | Vitest + Node test runner where appropriate |
| E2E | Playwright for Electron if compatible |
| Linting | ESLint |
| Formatting | Prettier |
| Packaging | electron-builder |
| Windows installer | NSIS |
| Primary architecture | Windows x64 |
| Future architecture | Windows ARM64 |

## Technology rules

- Prefer stable releases over prereleases.
- Do not introduce a framework merely because it is popular.
- Avoid large dependencies when native browser/Electron APIs are sufficient.
- Keep renderer bundles small.
- Keep system monitoring work in the main process.
- Keep privileged operations out of the renderer.
- Keep the preload API minimal and typed.

---

# 4. 🗺️ Phase Roadmap

## Phase 0 — Baseline & Audit

**Priority:** P1  
**Goal:** Record the current state before changing behavior.

**Status: ✅ COMPLETE** (2026-08-01) — full evidence in `plan-phase.md` §0.2–0.8.

### Tasks

- [x] Record current application behavior.
- [x] Record startup time.
- [x] Record idle CPU usage.
- [x] Record idle RAM usage.
- [x] Record renderer memory usage.
- [x] Capture current UI screenshots.
- [x] Create feature-behavior checklist.
- [ ] Record current build/package process. (deferred → Phase 9)
- [ ] Record supported Windows versions. (Win11 x64 documented; Win10 matrix deferred → Phase 10)
- [x] Record current known security issues.
- [x] Record current chart rendering behavior.
- [x] Record current refresh intervals.
- [ ] Establish a reference low-end Windows machine. (dev machine documented; low-end VM deferred)

### Baseline metrics

Measured 2026-08-01 on the dev machine (Windows 11 x64 · Intel i5-10300H · 8 cores · 31.8 GB RAM · `scripts/evidence.js measure`):

```text
Cold startup:        11,161 ms avg (5,675–18,475 across 5 runs) — target < 2 s
Idle CPU:            ≈ 1.3% (0.1–4.7%) — within < 1–2% target
Idle RAM:            ≈ 355 MB (323.8–373.3) — target < 150 MB
Renderer RAM:        324–410 MB working set (part of total; not isolated)
First UI render:     not separately measured (window-detect upper bound used)
Average FPS:         not measured in Phase 0 (Phase 6)
30-minute growth:    no uncontrolled growth — 390–435 MB band, transient 517 MB
                     peak (30-min stability test, 59 cycles, 0 crash/freeze/error)
```

### Reference machine

```text
OS:          Windows 11 x64 (build 26200)
CPU:         Intel Core i5-10300H @ 2.50 GHz (8 logical)
RAM:         31.8 GB
GPU:         Intel UHD Graphics (driver 31.0.101.1999)
Display:     1920×1080 @ 60 Hz, 125% scaling, 1 monitor
Node:        v26.5.1 · npm 11.17.0 · Electron 43.2.0 · electron-builder 25.1.8
```

### Known findings recorded

```text
Source:   4,502 LOC / 15 files (main.js 1,821 LOC; ~49 exec() sites)
Refresh:  System 1.5 s · Network 1.5 s · Disk 8 s · Processes 5 s
Security: 23 IPC channels (20 handle + 3 on); 0 shell:true; contextIsolation
          true, nodeIntegration false, sandbox true; CSP meta present
Features: 7/7 sections render + navigate; 0 renderer console errors
Issues:   battery undetectable on this machine; async fields show "--"/"-" on
          first render; GPU process crashes after many rapid launches
          (harness-only workaround in place)
```

### Exit criteria

- [x] Baseline measurements saved. (`plan-phase.md` + `scripts/evidence.js`)
- [x] Existing functionality documented.
- [x] Reference hardware documented.
- [x] No behavioral changes introduced.

---

# 5. 🔒 Phase 1 — Security Hardening

**Priority:** P0  
**Goal:** Remove high-risk security issues before major refactoring.

## 5.1 HTML / XSS protection

- [x] Create `escapeHtml()`.
- [x] Create `escapeAttr()`.
- [x] Escape registry/package data in text contexts.
- [x] Escape registry/package data in attribute contexts.
- [x] Review all dynamic HTML generation.
- [x] Avoid `innerHTML` when DOM APIs are practical.

## 5.2 Command injection protection

- [x] Validate package names in the main process.
- [x] Never trust renderer-provided package names.
- [x] Remove arbitrary renderer-controlled command strings.
- [x] Replace generic elevation commands with structured operations.
- [x] Whitelist package managers.
- [x] Whitelist package actions.

Example:

```ts
type PackageManager = "npm" | "pip";

type PackageAction =
  | "install"
  | "update"
  | "delete";
```

## 5.3 IPC validation

- [x] Validate every IPC argument.
- [x] Validate string types.
- [x] Validate enum values.
- [x] Validate package names.
- [x] Reject unexpected properties.
- [x] Return safe, predictable error objects.

## 5.4 Command execution

Prefer:

```text
execFile()
spawn()
```

over:

```text
exec()
shell: true
```

Use a shell only when technically required.

## 5.5 Command execution safety

Every remaining command execution must have:

- [x] Explicit timeout.
- [x] Explicit `maxBuffer`.
- [x] Controlled arguments.
- [x] Predictable error handling.
- [x] No arbitrary renderer input.

## 5.6 Electron security

Maintain:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
```

where compatible with the application architecture.

### Exit criteria

- [x] No known P0 security issue remains.
- [x] Renderer cannot execute arbitrary shell commands.
- [x] IPC inputs are validated.
- [x] Dynamic HTML is escaped.
- [x] Privileged APIs remain behind preload.

---

# 6. 🏗️ Phase 2 — Architecture Refactor

**Priority:** P0  
**Goal:** Turn the monolithic application into maintainable modules.

**Status: ✅ COMPLETE** (2026-08-02) — see `plan-phase.md` §2 for evidence. A final dead-code sweep (Phase 2.4) removed unused exports, unused imports, dead snapshot fields, and the `osInstallDate` probe.

## 6.1 Main process

Split the large main process into:

```text
src/
└── main/
    ├── main.ts
    ├── config.ts
    │
    ├── ipc/
    │   ├── index.ts
    │   ├── system.ipc.ts
    │   ├── processes.ipc.ts
    │   ├── packages.ipc.ts
    │   └── window.ipc.ts
    │
    ├── providers/
    │   ├── system.ts
    │   ├── os.ts
    │   ├── disk.ts
    │   ├── battery.ts
    │   ├── temperature.ts
    │   ├── network.ts
    │   ├── processes.ts
    │   └── packages.ts
    │
    ├── services/
    │   ├── command.service.ts
    │   ├── elevation.service.ts
    │   ├── monitoring.service.ts
    │   └── logger.service.ts
    │
    └── validators/
        ├── package.validator.ts
        └── ipc.validator.ts
```

## 6.2 Renderer contract

Every section should implement:

```ts
export function init(): void;
export function update(data: unknown): void;
export function destroy(): void;
```

Responsibilities:

### `init()`

- Cache DOM references.
- Bind events.
- Create required resources.
- Start section-specific work.

### `update()`

- Update only changed information.
- Avoid unnecessary DOM work.
- Avoid unnecessary chart redraws.

### `destroy()`

- Clear timers.
- Remove listeners.
- Stop animations.
- Release resources.

## 6.3 Shared helpers

Create:

```text
format.ts
constants.ts
validation.ts
dom.ts
errors.ts
```

Move reusable logic into these modules.

### Exit criteria

- [x] Main process is no longer a monolith.
- [x] Renderer sections use consistent lifecycle methods.
- [x] Shared logic is not duplicated.
- [x] No behavior regression.

## 6.4 Dead-code cleanup (Phase 2 follow-up, 2026-08-02)

- [x] Remove unused exports (renderer + main): de-exported `ChartEngine`/`DonutChart`/history arrays in `charts.js`, `diskInfoCache`/`renderDiskInfo` in `disk-section.js`, and all non-lifecycle exports in `developer-section.js` (only `init()/update()/destroy()` remain exported)
- [x] Remove unused imports: `$` in `app.js`, `formatBytes` in `battery-section.js`
- [x] Trim unused exports from `validators.js` (`MAX_NAME_LENGTH`, `MAX_QUERY_LENGTH` stay module-private)
- [x] Remove dead snapshot fields + probe: `osInstallDate`/`getOsInstallDate()` (and its `fs` + WMIC/PowerShell machinery), `nodeVersion`/`electronVersion`/`chromeVersion`/`v8Version`, `homedir`, `tmpdir` in `system.js` — never consumed by the renderer
- [x] Remove dead `DonutChart` methods (`getTextColor`, `getMutedColor`)
- [x] Verify: `npm test` 24/24 pass · `node --check` clean on all modified files · no remaining references to removed symbols

---

# 7. 🛡️ Phase 3 — Reliability & Error Handling

**Priority:** P1  
**Goal:** Prevent hangs, silent failures, and fragile asynchronous behavior.

**Status: ✅ COMPLETE** (2026-08-02) — centralized command service (`src/main/command-service.js`), flattened provider callback chains, user-visible error banners in every polling section, and uncaughtException/unhandledRejection crash guards with local logging. See `plan-phase.md` §3 for evidence.

## Command service

Create a centralized command runner:

```ts
interface CommandOptions {
  timeout?: number;
  maxBuffer?: number;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
```

## Tasks

- [x] Replace nested callbacks with async/await.
- [x] Centralize command execution.
- [x] Standardize errors.
- [x] Standardize timeout behavior.
- [x] Standardize `maxBuffer`.
- [x] Flatten battery fallback chains.
- [x] Flatten temperature fallback chains.
- [x] Add safe provider fallbacks.
- [x] Handle missing hardware.
- [x] Handle permission failures.
- [x] Handle missing commands.
- [x] Add local logging.

## UI error states

Every section should support:

```text
Loading
   ↓
Success
   ↓
Error
   ↓
Retry
```

No important failure should only appear in `console.error`.

## Crash protection

Add controlled handling for:

```text
uncaughtException
unhandledRejection
```

Do not hide errors silently. Log them locally and present safe user-facing states where appropriate.

### Exit criteria

- [x] No callback pyramids in core providers.
- [x] All provider failures are handled.
- [x] No section silently fails.
- [x] Long-running commands cannot hang indefinitely.

---

# 8. 🧩 Phase 4 — TypeScript + Vite Foundation

**Priority:** P1  
**Goal:** Establish the modern development foundation before major UI work.

Do not rewrite everything at once.

## Stage 1 — Configuration

- [ ] Add TypeScript.
- [ ] Add `tsconfig.json`.
- [ ] Enable strict mode progressively.
- [ ] Add Vite.
- [ ] Configure Electron main build.
- [ ] Configure preload build.
- [ ] Configure renderer build.

## Stage 2 — Utilities

Convert:

```text
utils.js → utils.ts
```

## Stage 3 — Providers

Convert:

```text
system
disk
battery
temperature
network
processes
packages
```

## Stage 4 — IPC

Convert:

```text
preload.js → preload.ts
ipc layer → TypeScript
```

## Stage 5 — Renderer

Convert:

```text
sections/*.js → sections/*.ts
charts.js → charts.ts
gauges.js → gauges.ts
app.js → app.ts
```

## Stage 6 — Main

Finally:

```text
main.js → main.ts
```

## Type safety

Create shared types:

```text
src/shared/
├── types/
│   ├── system.ts
│   ├── disk.ts
│   ├── network.ts
│   ├── process.ts
│   ├── battery.ts
│   └── packages.ts
└── ipc/
    └── contracts.ts
```

### Exit criteria

- [ ] Application code is TypeScript.
- [ ] Strict TypeScript is enabled.
- [ ] IPC contracts are typed.
- [ ] Vite production build works.
- [ ] Existing features continue to work.

---

# 9. 🧪 Phase 5 — Testing & CI

**Priority:** P1  
**Goal:** Make future changes safe.

## Unit testing

Test:

- [ ] CPU calculations.
- [ ] Memory calculations.
- [ ] Disk parsers.
- [ ] Battery parsers.
- [ ] Network calculations.
- [ ] Temperature conversions.
- [ ] Formatters.
- [ ] Validation functions.
- [ ] Chart math.
- [ ] Gauge calculations.

## Integration testing

Test:

- [ ] IPC handlers.
- [ ] IPC validation.
- [ ] Mocked providers.
- [ ] Provider failures.
- [ ] Missing hardware.
- [ ] Permission errors.
- [ ] Package operations.

## UI / E2E

If compatible with the selected Electron version:

- [ ] Window startup.
- [ ] Navigation.
- [ ] Dashboard rendering.
- [ ] Theme switching.
- [ ] Settings.
- [ ] Developer section.
- [ ] Error states.
- [ ] Window controls.

## Commands

```text
npm run test
npm run test:watch
npm run typecheck
npm run lint
npm run format
npm run build
```

## CI pipeline

```text
Install dependencies
        ↓
Typecheck
        ↓
Lint
        ↓
Unit tests
        ↓
Integration tests
        ↓
Build
        ↓
Package
```

### Exit criteria

- [ ] Tests run automatically.
- [ ] CI is required for merges/releases.
- [ ] Critical providers have coverage.
- [ ] No new feature is merged without appropriate tests.

---

# 10. ⚡ Phase 6 — Low-End PC Performance

**Priority:** P0/P1  
**Goal:** Make performance a first-class product requirement.

## Target hardware

The application should remain usable on:

- 4 GB RAM
- Dual-core CPU
- Integrated graphics
- Older Intel/AMD CPUs
- HDD storage
- 1366×768 displays
- Windows 10/11

## Performance targets

```text
Cold startup       < 2 seconds target
Idle CPU           < 1–2% target
Renderer RAM       < 150 MB target
Normal UI          60 FPS target
Interaction        < 100 ms target
Memory growth      No uncontrolled growth
```

Targets are measured rather than assumed and should be validated on real reference hardware.

## Smart polling

Do not refresh every metric at the same frequency.

Recommended starting points:

```text
CPU             → 1 second
Network         → 1 second
Memory          → 2 seconds
Temperature     → 2–3 seconds
Battery         → 2–3 seconds
Disk            → 3 seconds
Processes       → 3–5 seconds
OS details      → slow / on demand
Packages        → on demand
```

These values should be configurable and benchmarked.

## Monitoring service

Use:

```text
System Providers
       ↓
Monitoring Service
       ↓
Cached Snapshot
       ↓
IPC
       ↓
Renderer
```

Example:

```ts
interface SystemSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo[];
  network: NetworkInfo;
  battery?: BatteryInfo;
  temperatures: TemperatureInfo;
  processes?: ProcessInfo[];
}
```

## Visibility-based work

When a section is hidden:

- [ ] Stop unnecessary polling.
- [ ] Stop chart animation.
- [ ] Stop expensive DOM updates.
- [ ] Stop package scanning.
- [ ] Release section-specific resources.

Use:

```text
IntersectionObserver
requestAnimationFrame
lazy initialization
destroy()
```

## Low-end performance mode

### Balanced

- Normal polling.
- Normal charts.
- Normal animations.

### Low Power

- Lower polling frequency.
- Reduced animations.
- Less process scanning.
- Reduced visual effects.

### Low-End

- Minimal animation.
- No expensive blur.
- Reduced chart history.
- Lower refresh frequency.
- Simplified chart rendering.
- Hidden sections paused.

### Custom

Allow users to configure:

- Refresh frequency.
- Chart history.
- Animations.
- Hardware monitoring.

## Rendering optimization

- [ ] Cache DOM references.
- [ ] Use `DocumentFragment`.
- [ ] Use keyed list rendering.
- [ ] Update only changed values.
- [ ] Use `requestAnimationFrame`.
- [ ] Use `ResizeObserver`.
- [ ] Limit chart history.
- [ ] Avoid forced synchronous layouts.
- [ ] Avoid unnecessary style recalculation.
- [ ] Stop off-screen animations.

## HiDPI

Charts and gauges must support:

- 100%
- 125%
- 150%
- 175%
- 200%
- 4K displays
- Retina/high-DPI displays

Use device pixel ratio aware canvas backing stores.

### Exit criteria

- [ ] Startup benchmark passes.
- [ ] Idle CPU benchmark passes.
- [ ] Memory benchmark passes.
- [ ] 30–60 minute stability test passes.
- [ ] No obvious performance regression.
- [ ] Charts remain sharp at 150–200% scaling.

---

# 11. 🎨 Phase 7 — Modern UI/UX

**Priority:** P1  
**Goal:** Completely modernize the interface while keeping it lightweight.

## Design language

Use a modern Windows-inspired visual system:

- Clean layout.
- Rounded cards.
- Subtle borders.
- Minimal shadows.
- Consistent spacing.
- Clear typography.
- Better iconography.
- Controlled animations.
- Responsive navigation.
- Strong visual hierarchy.

Avoid excessive:

- Blur.
- Glass effects.
- Large shadows.
- Gradients.
- Continuous animations.

These effects can increase GPU/CPU usage on low-end machines.

## Main layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Atual.dev                                      ● System OK │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│ Dashboard      │ System Overview                            │
│                │                                            │
│ Performance    │ ┌────────┐ ┌────────┐ ┌────────┐          │
│                │ │ CPU    │ │ Memory │ │ Disk   │          │
│ Hardware       │ │  24%   │ │  61%   │ │  72%   │          │
│                │ └────────┘ └────────┘ └────────┘          │
│ Processes      │                                            │
│                │ ┌──────────────────────────────────────┐   │
│ Network        │ │          Performance Chart            │   │
│                │ │                                      │   │
│ Developer      │ └──────────────────────────────────────┘   │
│                │                                            │
│ Settings       │                                            │
└────────────────┴────────────────────────────────────────────┘
```

## Navigation

- [ ] Collapsible sidebar.
- [ ] Icons + labels.
- [ ] Active section indicator.
- [ ] Keyboard navigation.
- [ ] Focus states.
- [ ] Tooltips when collapsed.
- [ ] Remember last selected section.

## Dashboard

Cards for:

- CPU.
- CPU temperature.
- Memory.
- GPU.
- GPU temperature.
- Disk.
- Network.
- Battery.
- Uptime.

Allow users to:

- [ ] Show/hide cards.
- [ ] Reorder cards.
- [ ] Choose default dashboard layout.

## Charts

Charts must:

- [ ] Be HiDPI.
- [ ] Resize automatically.
- [ ] Avoid unnecessary redraws.
- [ ] Use RAF.
- [ ] Limit history.
- [ ] Pause when hidden.
- [ ] Avoid expensive effects on low-end mode.

## Themes

Support:

```text
System
Light
Dark
```

Also support:

- [ ] Windows accent color.
- [ ] CSS variables.
- [ ] Reduced motion.
- [ ] Compact mode.

## Accessibility

- [ ] Keyboard navigation.
- [ ] Screen-reader labels.
- [ ] Semantic HTML.
- [ ] Visible focus.
- [ ] Good contrast.
- [ ] Reduced-motion support.
- [ ] No status information conveyed by color alone.

Example:

```text
CPU 24% — Normal
```

instead of relying only on a colored indicator.

### Exit criteria

- [ ] All primary screens use the new design system.
- [ ] Light/dark/system themes work.
- [ ] Navigation is keyboard accessible.
- [ ] Reduced-motion mode works.
- [ ] UI performance remains within budget.

---

# 12. 🪟 Phase 8 — Windows-Native Experience

**Priority:** P1  
**Goal:** Build specifically for Windows rather than merely running on Windows.

## Windows support

- [ ] Windows 10.
- [ ] Windows 11.
- [ ] x64 primary architecture.
- [ ] High-DPI displays.
- [ ] Multi-monitor systems.
- [ ] 100–200% scaling.

## Windows features

- [ ] System tray.
- [ ] Minimize to tray.
- [ ] Start with Windows.
- [ ] Windows notifications.
- [ ] Windows theme detection.
- [ ] Windows accent color.
- [ ] Native keyboard shortcuts.
- [ ] Appropriate native context menus.

## Optional Windows 11 features

- [ ] Mica/Acrylic-style appearance where appropriate.
- [ ] Windows 11 visual integration.
- [ ] Quick system actions.

These features must remain optional or adaptive because visual effects should not compromise low-end performance.

### Exit criteria

- [ ] Tested on Windows 10.
- [ ] Tested on Windows 11.
- [ ] Tested at 100–200% scaling.
- [ ] Tested on multiple monitors.
- [ ] Tray behavior is reliable.
- [ ] Startup behavior is reliable.

---

# 13. 📦 Phase 9 — Packaging, Signing & Updates

**Priority:** P1/P2  
**Goal:** Produce a professional Windows release.

## Windows builds

Primary:

```text
Atual.dev-Setup-x64.exe
Atual.dev-Portable-x64.exe
```

Future:

```text
Atual.dev-Setup-arm64.exe
```

## Installer

- [ ] NSIS installer.
- [ ] Start Menu shortcut.
- [ ] Optional desktop shortcut.
- [ ] Uninstaller.
- [ ] Application icon.
- [ ] Version metadata.
- [ ] Upgrade without destroying settings.
- [ ] User data stored outside installation directory.

## Code signing

- [ ] Sign Windows release binaries.
- [ ] Protect signing credentials.
- [ ] Sign release artifacts in CI where practical.
- [ ] Verify signed binaries before release.

## Auto-update

Use a safe update process:

```text
Application
      ↓
Check update
      ↓
New version?
   /       \
 No         Yes
 |           |
Continue    Notify
             ↓
          Download
             ↓
          Verify
             ↓
          Install
```

Requirements:

- [ ] User-controlled updates.
- [ ] Stable release channel.
- [ ] Optional beta/dev channel later.
- [ ] Failed-update recovery.
- [ ] Update logs.
- [ ] No arbitrary executable replacement.

## Clean installation testing

- [ ] Clean Windows VM.
- [ ] No development dependencies.
- [ ] Fresh install.
- [ ] Upgrade from previous version.
- [ ] Uninstall.
- [ ] Reinstall.
- [ ] Settings persistence verified.

### Exit criteria

- [ ] Windows installer works.
- [ ] Portable build works.
- [ ] Signed build works.
- [ ] Upgrade works.
- [ ] Uninstall works.
- [ ] Update mechanism works.

---

# 14. 🧪 Phase 10 — Final Optimization & Release Candidate

**Priority:** P0 before stable release  
**Goal:** Validate the entire application under real-world conditions.

## Performance validation

- [ ] Cold startup benchmark.
- [ ] Warm startup benchmark.
- [ ] Idle CPU benchmark.
- [ ] Idle RAM benchmark.
- [ ] Renderer RAM benchmark.
- [ ] Chart FPS benchmark.
- [ ] 30-minute stability test.
- [ ] 60-minute stability test.
- [ ] Process-list stress test.
- [ ] Large disk test.
- [ ] Multiple-monitor test.

## Low-end validation

Test on:

```text
4 GB RAM
Dual-core CPU
Integrated GPU
HDD
1366×768
Windows 10/11
```

Verify:

- [ ] UI remains responsive.
- [ ] CPU remains low.
- [ ] RAM remains stable.
- [ ] Charts remain usable.
- [ ] Animations can be reduced/disabled.
- [ ] No long blocking operations.

## Security validation

- [ ] Dependency audit.
- [ ] IPC review.
- [ ] Preload review.
- [ ] Dynamic HTML review.
- [ ] Command execution review.
- [ ] Elevation review.
- [ ] Package input validation.
- [ ] Release artifact verification.

## UI validation

- [ ] Light theme.
- [ ] Dark theme.
- [ ] System theme.
- [ ] Reduced motion.
- [ ] Keyboard navigation.
- [ ] 100% DPI.
- [ ] 125% DPI.
- [ ] 150% DPI.
- [ ] 175% DPI.
- [ ] 200% DPI.
- [ ] 1366×768.
- [ ] 1920×1080.
- [ ] 2560×1440.
- [ ] 3840×2160.

## Regression testing

- [ ] CPU monitoring.
- [ ] Memory monitoring.
- [ ] Disk monitoring.
- [ ] Network monitoring.
- [ ] Battery.
- [ ] Temperature.
- [ ] Processes.
- [ ] Developer tools.
- [ ] npm operations.
- [ ] pip operations.
- [ ] Elevation.
- [ ] Settings.
- [ ] Tray.
- [ ] Startup.
- [ ] Updates.

### Exit criteria

- [ ] No P0/P1 security issues.
- [ ] No critical crash.
- [ ] No uncontrolled memory growth.
- [ ] Performance targets are documented.
- [ ] Windows installation is verified.
- [ ] Release candidate passes smoke tests.

---

# 15. 🔗 Phase Dependency Map

```text
Phase 0
Baseline & Audit
      │
      ▼
Phase 1
Security Hardening
      │
      ▼
Phase 2
Architecture Refactor
      │
      ├───────────────┐
      ▼               ▼
Phase 3           Phase 4
Reliability       TypeScript + Vite
      │               │
      └───────┬───────┘
              ▼
           Phase 5
        Testing & CI
              │
              ▼
           Phase 6
      Low-End Performance
              │
              ▼
           Phase 7
        Modern UI/UX
              │
              ▼
           Phase 8
      Windows Experience
              │
              ▼
           Phase 9
 Packaging / Signing / Updates
              │
              ▼
          Phase 10
Final Optimization / RC
              │
              ▼
        🚀 Stable Release
```

---

# 16. 🧪 Testing Strategy

| Level | What | Tooling |
|---|---|---|
| Unit | Utils, parsers, calculations | Vitest / Node test runner |
| Integration | IPC + providers | Vitest |
| E2E | Window, navigation, UI | Playwright for Electron |
| Static | TypeScript, lint, dependencies | TypeScript / ESLint / audit |
| Performance | Startup, CPU, RAM, FPS | Automated + manual |
| Manual | Windows hardware/scaling matrix | Release checklist |

## Test pyramid

```text
                 ┌──────────────┐
                 │     E2E      │
                 └──────┬───────┘
                        │
              ┌─────────┴─────────┐
              │   Integration     │
              └─────────┬─────────┘
                        │
          ┌─────────────┴─────────────┐
          │         Unit Tests        │
          └───────────────────────────┘
```

Prefer many fast unit tests and fewer expensive E2E tests.

---

# 17. 🧰 Developer Experience

## Required commands

```text
npm run dev
npm run build
npm run test
npm run test:watch
npm run typecheck
npm run lint
npm run format
npm run package
npm run package:portable
npm run release
```

## CI

Every pull request should run:

```text
Typecheck
    ↓
Lint
    ↓
Unit tests
    ↓
Integration tests
    ↓
Build
```

Release builds should additionally run:

```text
Windows package
    ↓
Installer validation
    ↓
Artifact verification
```

---

# 18. 📊 Performance Budget

Performance should be treated as a release requirement.

## Target budgets

| Metric | Target |
|---|---:|
| Cold startup | < 2 seconds target |
| Idle CPU | < 1–2% target |
| Renderer RAM | < 150 MB target |
| Normal UI | 60 FPS target |
| Interaction latency | < 100 ms target |
| Memory growth | No uncontrolled growth |
| Chart history | Fixed maximum |
| Hidden-section CPU | Near-zero where possible |

These are targets, not assumptions. They must be measured on real hardware.

---

# 19. 🔐 Security Definition of Done

- [ ] No unescaped external/registry data in HTML.
- [ ] No renderer-controlled shell commands.
- [ ] All IPC arguments validated.
- [ ] Elevation operations whitelisted.
- [ ] `execFile`/`spawn` preferred.
- [ ] Remaining shell calls documented.
- [ ] Timeouts configured.
- [ ] `maxBuffer` configured.
- [ ] Context isolation enabled.
- [ ] Node integration disabled in renderer.
- [ ] Sandbox retained where compatible.
- [ ] CSP enforced.
- [ ] Dependencies audited.
- [ ] Windows release signed.

---

# 20. 🎨 UI Definition of Done

- [ ] Modern Windows-inspired design.
- [ ] Consistent spacing.
- [ ] Consistent typography.
- [ ] Consistent icons.
- [ ] Dark mode.
- [ ] Light mode.
- [ ] System theme.
- [ ] Accent color.
- [ ] Responsive sidebar.
- [ ] Keyboard navigation.
- [ ] Focus states.
- [ ] Reduced motion.
- [ ] Accessible labels.
- [ ] Better loading states.
- [ ] Better empty states.
- [ ] Better error states.
- [ ] High-DPI charts.
- [ ] 150–200% scaling support.

---

# 21. ⚡ Performance Definition of Done

- [ ] Smart polling implemented.
- [ ] Developer section lazy-loaded.
- [ ] Hidden sections paused.
- [ ] DOM references cached.
- [ ] Incremental list rendering implemented.
- [ ] Charts use RAF scheduling.
- [ ] Charts use DPR-aware rendering.
- [ ] ResizeObserver used where appropriate.
- [ ] Chart history is capped.
- [ ] Low-End mode exists.
- [ ] Low Power mode exists.
- [ ] No uncontrolled memory growth.
- [ ] Startup benchmark documented.
- [ ] Low-end hardware benchmark documented.

---

# 22. 🪟 Windows Definition of Done

- [ ] Windows 10 tested.
- [ ] Windows 11 tested.
- [ ] x64 installer works.
- [ ] Portable build works.
- [ ] Start Menu shortcut works.
- [ ] Uninstaller works.
- [ ] Tray works.
- [ ] Minimize-to-tray works.
- [ ] Start-with-Windows works.
- [ ] Notifications work.
- [ ] Dark/light detection works.
- [ ] Accent color works.
- [ ] 100–200% scaling tested.
- [ ] Multi-monitor tested.
- [ ] Clean VM tested.
- [ ] Upgrade tested.
- [ ] Signed release tested.

---

# 23. 📦 Release Checklist

## Before release

- [ ] Update version.
- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Run tests.
- [ ] Run build.
- [ ] Run security audit.
- [ ] Build Windows installer.
- [ ] Build portable package.
- [ ] Verify application icon.
- [ ] Verify installer metadata.
- [ ] Test clean installation.
- [ ] Test upgrade.
- [ ] Test uninstall.
- [ ] Test application startup.
- [ ] Test system monitoring.
- [ ] Test settings.
- [ ] Test tray.
- [ ] Test auto-update.
- [ ] Sign artifacts.
- [ ] Generate changelog.
- [ ] Create Git tag.
- [ ] Publish release.

## Release artifacts

```text
Atual.dev-Setup-x64.exe
Atual.dev-Portable-x64.exe
checksums.txt
CHANGELOG.md
```

Future:

```text
Atual.dev-Setup-arm64.exe
```

---

# 24. 📁 Target Project Structure

```text
src/
├── main/
│   ├── main.ts
│   ├── config.ts
│   │
│   ├── ipc/
│   │   ├── index.ts
│   │   ├── system.ipc.ts
│   │   ├── processes.ipc.ts
│   │   ├── packages.ipc.ts
│   │   └── window.ipc.ts
│   │
│   ├── providers/
│   │   ├── system.ts
│   │   ├── os.ts
│   │   ├── disk.ts
│   │   ├── battery.ts
│   │   ├── temperature.ts
│   │   ├── network.ts
│   │   ├── processes.ts
│   │   └── packages.ts
│   │
│   ├── services/
│   │   ├── command.service.ts
│   │   ├── elevation.service.ts
│   │   ├── monitoring.service.ts
│   │   └── logger.service.ts
│   │
│   └── validators/
│       ├── package.validator.ts
│       └── ipc.validator.ts
│
├── preload/
│   └── preload.ts
│
├── shared/
│   ├── types/
│   │   ├── system.ts
│   │   ├── disk.ts
│   │   ├── network.ts
│   │   ├── process.ts
│   │   ├── battery.ts
│   │   └── packages.ts
│   │
│   └── ipc/
│       └── contracts.ts
│
└── renderer/
    ├── app/
    ├── components/
    ├── sections/
    ├── charts/
    ├── gauges/
    ├── styles/
    └── utils/
```

---

# 25. 🧭 Execution Rules

## Rule 1 — Do not rewrite everything at once

Refactor incrementally.

```text
Existing working code
        ↓
Security
        ↓
Architecture
        ↓
Tests
        ↓
TypeScript
        ↓
Performance
        ↓
UI
        ↓
Windows
        ↓
Release
```

## Rule 2 — Preserve behavior during refactors

Architecture changes should initially move code without changing functionality.

Only after the behavior is stable should deeper optimizations be introduced.

## Rule 3 — Measure performance

Never claim that something is optimized without measuring it.

## Rule 4 — Keep the renderer unprivileged

The renderer should not:

- Execute shell commands.
- Access Node APIs directly.
- Perform privileged operations.
- Decide what elevated command should run.

## Rule 5 — Windows-first does not mean Windows-only

The application may continue supporting macOS/Linux where practical, but Windows is the primary release target.

## Rule 6 — Performance beats visual effects

If a UI effect negatively affects low-end performance, disable or simplify it.

## Rule 7 — Stable releases over bleeding edge

Use stable, supported technology and upgrade intentionally.

---

# 26. 🏁 Final Architecture

```text
                         ┌───────────────────────┐
                         │       Atual.dev       │
                         │     Desktop App       │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
          ┌──────────────────┐              ┌──────────────────┐
          │     Renderer     │              │   Main Process   │
          │                  │              │                  │
          │ TypeScript UI    │              │ Monitoring       │
          │ Components       │              │ Providers        │
          │ Canvas Charts    │              │ Services         │
          │ CSS              │              │ IPC              │
          └────────┬─────────┘              └────────┬─────────┘
                   │                                 │
                   │          Typed IPC              │
                   └──────────────┬──────────────────┘
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │  Preload Bridge     │
                        │  contextBridge      │
                        │  Validated API      │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │ Windows / Hardware  │
                        └─────────────────────┘
```

---

# 27. 🚀 Final Product Goals

The final Atual.dev Dashboard should be:

### Modern

- Clean Windows-inspired UI.
- Excellent typography.
- Responsive layout.
- Dark/light/system themes.
- High-DPI support.

### Fast

- Fast startup.
- Low idle CPU.
- Low memory usage.
- Smart polling.
- Efficient charts.
- Low-end performance mode.

### Secure

- Secure Electron configuration.
- Validated IPC.
- No arbitrary shell execution.
- Safe package operations.
- Safe elevation.
- Signed releases.

### Maintainable

- TypeScript.
- Modular architecture.
- Typed IPC.
- Automated tests.
- CI.
- Clear provider/service boundaries.

### Windows-ready

- Windows 10/11.
- x64 installer.
- Portable build.
- Tray.
- Startup.
- Notifications.
- Auto-update.
- Code signing.

### Reliable

- No silent provider failures.
- Safe fallbacks.
- Timeouts.
- Memory stability.
- Long-running monitoring stability.

---

# 28. ✅ Master Definition of Done

Atual.dev is ready for a stable modern release when all of the following are true:

- [ ] Security P0 issues resolved.
- [ ] Architecture refactor completed.
- [ ] TypeScript migration completed.
- [ ] Vite production build completed.
- [ ] Automated unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E tests pass where supported.
- [ ] CI pipeline passes.
- [ ] Smart polling implemented.
- [ ] Low-End mode implemented.
- [ ] Low Power mode implemented.
- [ ] HiDPI rendering implemented.
- [ ] Modern UI completed.
- [ ] Dark/light/system themes completed.
- [ ] Accessibility completed.
- [ ] Windows-native features completed.
- [ ] Windows x64 installer works.
- [ ] Portable build works.
- [ ] Code signing works.
- [ ] Auto-update works.
- [ ] Clean VM installation passes.
- [ ] Upgrade passes.
- [ ] Uninstall passes.
- [ ] 30–60 minute stability test passes.
- [ ] Low-end PC benchmark passes.
- [ ] No uncontrolled memory growth.
- [ ] No critical console errors.
- [ ] No known P0/P1 security issues.
- [ ] Release artifacts verified.
- [ ] Changelog generated.
- [ ] Documentation updated.

---

# 29. 🎯 Recommended Priority Summary

```text
P0 — Critical
────────────────────────────────────
Security
Architecture
Low-end performance
Release stability

P1 — High Value
────────────────────────────────────
Reliability
TypeScript
Vite
Testing
CI
Modern UI
Windows features

P2 — Later
────────────────────────────────────
ARM64
Advanced customization
Advanced Windows effects
Hardware alerts
Plugin architecture
```

## Final principle

> **Build a modern Windows application without making it a heavy application.**

The target is not simply a prettier dashboard.

The target is a **secure, lightweight, fast, maintainable, modern Windows system monitor that remains responsive on low-end PCs.**
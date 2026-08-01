# 🗺️ plan-phase.md — Phase Tracker & Baseline

> **Living document** for executing the phased improvement plan defined in `plan.md` (master roadmap) and `plan-phase.md` (execution tracker).
> Status legend: ⏳ not started · 🔄 in progress · ✅ done · ⚠️ blocked

**Created:** August 1, 2026 · **Machine baseline:** Windows 11 x64, Intel i5-10300H (8 cores), 31.8 GB RAM, Node v26.5.1

> **Planning model:** Only two planning files are used: `plan.md` is the permanent master roadmap; this file is the execution/evidence tracker.

---

## 📊 Phase Overview

| # | Phase | Priority | Status |
|---|-------|----------|--------|
| 0 | Baseline & Audit | P1 | ✅ |
| 1 | Security Hardening | P0 | ⏳ |
| 2 | Architecture (split main.js) | P0 | ⏳ |
| 3 | Reliability | P1 | ⏳ |
| 4 | TypeScript + Vite Foundation | P1 | ⏳ |
| 5 | Testing & CI | P1 | ⏳ |
| 6 | Low-End Performance | P0/P1 | ⏳ |
| 7 | UI Modernization | P1 | ⏳ |
| 8 | Windows-Native | P1 | ⏳ |
| 9 | Packaging, Signing & Updates | P1/P2 | ⏳ |
| 10 | Final Optimization & Release Candidate | P0/P1 | ⏳ |

---

# 🔄 Phase 0 — Baseline & Audit

**Goal:** Record the exact starting state before security fixes, refactoring, optimization, UI redesign, or TypeScript/Vite migration.

**Current state:** Baseline measurements already exist. Phase 0 should remain **🔄 In progress** until the evidence checklist below is confirmed on the actual machine and screenshots/manual behavior checks are completed.

---

## 0.1 Baseline Snapshot

### Machine

| Metric | Value |
|---|---|
| OS | Windows 11 x64 |
| CPU | Intel i5-10300H |
| Logical processors | 8 |
| RAM | 31.8 GB |
| Node | v26.5.1 |

### Existing measurements

| Metric | Value | Interpretation |
|---|---:|---|
| Cold startup | **5,676 ms** | Above <2 s target |
| RAM at window-ready | **364.8 MB** | Above <150 MB target |
| RAM after idle settle | **323.8 MB** | Above <150 MB target |
| Idle CPU | **1.4%** | Within current <1–2% target |

> Startup is measured with a polling-based script, so the value includes measurement overhead. Use it as a repeatable before/after metric, not an exact paint-time measurement.

---

## 0.2 Exact Phase 0 Procedure

### Step A — Freeze the baseline

```powershell
git status
git add .
git commit -m "baseline: phase 0 starting point"
```

Do not modify application code while collecting baseline evidence.

### Step B — Record environment

```powershell
node --version
npm --version
npm list --depth=0
```

Also record:

```text
Windows version/build
CPU
RAM
GPU
GPU driver
Display resolution
Display scaling
Monitor count
Electron version
electron-builder version
Application version
```

### Step C — Record source structure

Current measured baseline:

```text
Total source LOC: 4,502
Source files: 15
main.js: 1,821 LOC
preload.js: 92 LOC
app.js: 369 LOC
charts.js: 734 LOC
gauges.js: 192 LOC
utils.js: 57 LOC
sections: 1,237 LOC across 8 files
exec() sites: ~49
```

### Step D — Record refresh behavior

Current hardcoded cadence:

```text
System:    1.5 s
Network:   1.5 s
Disk:      8 s
Processes: 5 s
```

Also record whether each task continues while its section is hidden.

### Step E — Measure startup

Run at least five cold starts and record:

```text
Run 1:
Run 2:
Run 3:
Run 4:
Run 5:
Average:
Minimum:
Maximum:
```

### Step F — Measure RAM

Record:

```text
Window ready:
5 minutes:
15 minutes:
30 minutes:
```

Do not assume growth is a memory leak. Record the trend for later investigation.

### Step G — Measure CPU

Record:

```text
Startup:
Idle dashboard:
Performance:
Processes:
Developer:
30-minute:
```

### Step H — Run the 30-minute stability test

During the run:

```text
[ ] Navigate all sections
[ ] Open Performance
[ ] Open Processes
[ ] Open Network
[ ] Open Developer
[ ] Return to Dashboard
[ ] Toggle theme
[ ] Resize
[ ] Minimize
[ ] Restore
[ ] Maximize
```

Record:

```text
Crash:
Freeze:
Broken chart:
Missing data:
Console error:
Start RAM:
End RAM:
RAM delta:
Start CPU:
End CPU:
```

### Step I — Feature audit

Verify:

```text
[ ] Overview
[ ] Performance charts
[ ] Network
[ ] Disk
[ ] Processes/search
[ ] Battery
[ ] Developer/npm/pip
[ ] Package install/update/delete
[ ] Elevation
[ ] Window controls
[ ] Theme
[ ] Sidebar navigation
```

For every failure:

```text
Feature:
Expected:
Actual:
Reproduction:
Severity:
Evidence:
```

### Step J — Screenshot baseline

Capture:

```text
dashboard-dark
dashboard-light
performance
hardware
processes
network
developer
settings
window-small
window-large
```

If possible also capture 100%, 125%, 150%, and 200% scaling.

### Step K — Console/error inventory

Record:

```text
Console errors:
Console warnings:
Unhandled rejections:
Failed IPC:
Failed resource loads:
```

### Step L — Security inventory

Do not fix anything yet. Record:

```text
contextIsolation:
nodeIntegration:
sandbox:
preload:
CSP:
IPC channels:
exec() sites:
execFile() sites:
spawn() sites:
shell: true:
innerHTML:
Renderer-controlled command inputs:
```

### Step M — Build baseline

Record:

```text
Build command:
Build result:
Build time:
Installer:
Portable build:
Warnings:
Errors:
```

---

## 0.3 Evidence Checklist

### Environment

- [x] Windows version recorded
- [x] CPU recorded
- [x] RAM recorded
- [ ] GPU + driver recorded
- [ ] Display resolution recorded
- [ ] Display scaling recorded
- [x] Node recorded
- [ ] npm recorded
- [ ] Electron version recorded
- [ ] electron-builder version recorded

### Performance

- [x] Startup baseline
- [x] RAM baseline
- [x] CPU baseline
- [ ] Five startup runs explicitly recorded
- [ ] 5-minute RAM sample
- [ ] 15-minute RAM sample
- [ ] 30-minute RAM sample
- [ ] 30-minute CPU sample
- [ ] Stability result

### Application behavior

- [x] Feature inventory from code inspection
- [ ] Manual feature pass completed
- [ ] Failure list created
- [ ] Error states recorded
- [ ] Console errors recorded

### UI

- [ ] Dashboard screenshot
- [ ] Performance screenshot
- [ ] Hardware screenshot
- [ ] Processes screenshot
- [ ] Network screenshot
- [ ] Developer screenshot
- [ ] Settings screenshot
- [ ] Dark/light screenshots
- [ ] Window-size screenshots
- [ ] DPI screenshots

### Architecture / security inventory

- [x] LOC baseline
- [x] File-count baseline
- [x] `exec()` count
- [x] Refresh cadence
- [ ] IPC channel inventory
- [ ] `innerHTML` inventory
- [ ] `shell: true` inventory
- [ ] Electron `webPreferences` recorded

### Project state

- [ ] Git baseline commit
- [ ] Build baseline
- [ ] Dependency baseline
- [ ] Known-issues register

---

## 0.4 Known Baseline Findings

### Performance

```text
Startup: 5.676 s
RAM:     323.8–364.8 MB
CPU:     1.4%
```

### Codebase

```text
4,502 LOC
15 source files
1,821 LOC main.js
~49 exec() sites
```

### Immediate future targets

```text
Phase 1 → security risks
Phase 2 → main.js architecture
Phase 3 → error/reliability behavior
Phase 4 → startup/RAM/polling/Canvas performance
Phase 5 → automated tests
Phase 6 → lint/format/CI
Phase 7 → UI modernization
Phase 8 → Windows integration
Phase 9 → TypeScript/Vite
Phase 10 → packaging/release
```

---

## 0.5 Important Baseline Rules

Do not interpret:

```text
5.7 s startup
324–365 MB RAM
1.4% CPU
```

as proof that the application is "bad".

They are **baseline measurements**.

The purpose is to compare:

```text
Before
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ↓
Final
```

using the same measurement method.

### Phase 0 must not fix

```text
❌ Security issues
❌ Architecture
❌ Polling
❌ Memory usage
❌ Startup time
❌ Canvas rendering
❌ UI
❌ TypeScript
❌ Vite
❌ Dependencies
```

Those are later phases.

---

## 0.6 Phase 0 Completion Rule

Phase 0 becomes **✅ COMPLETE** when every required evidence item above is either:

```text
✅ Verified
```

or explicitly:

```text
⚠️ Blocked — reason documented
```

The next phase may begin after the baseline is frozen and documented.

---

## 0.7 Phase 0 Progress Log

| Date | Item | Status | Evidence |
|---|---|---|---|
| 2026-08-01 | Hardware/runtime baseline | ✅ | Windows 11 x64, i5-10300H, 31.8 GB |
| 2026-08-01 | Startup measurement | ✅ | 5,676 ms |
| 2026-08-01 | RAM measurement | ✅ | 323.8–364.8 MB |
| 2026-08-01 | CPU measurement | ✅ | 1.4% |
| 2026-08-01 | Source metrics | ✅ | 4,502 LOC / 15 files |
| 2026-08-01 | Feature code audit | ✅ | 12 feature areas |
| 2026-08-01 | Reusable measurement script | ✅ | `scripts/measure-baseline.js` |
| — | Manual feature pass | ⏳ | |
| — | Screenshot evidence | ⏳ | |
| — | Console/error inventory | ⏳ | |
| — | Security inventory | ⏳ | |
| — | Build baseline | ⏳ | |
| — | Git baseline commit | ⏳ | |

---

## 0.8 Phase 0 Verdict

**Current verdict: 🔄 In progress**

The initial measurements are already useful:

- Startup is the largest obvious performance gap.
- RAM is significantly above the long-term target.
- Idle CPU is already close to the desired budget.
- The codebase has a large `main.js` and many command-execution sites.
- The current refresh model is fixed rather than adaptive.
- The application has enough existing functionality that future phases must preserve behavior.

Do not begin optimization until the remaining evidence checklist is completed.

# ⏳ Phase 1 — Security Hardening (P0)

**Goal:** eliminate the highest-risk issues. Details in `plan.md` §3.

- [ ] Escape registry data in all contexts (`escapeAttr` for `title=`/`data-pkg=`, `escapeHtml` for text) in `developer-section.js`
- [ ] Validate package names in main against `/^[a-zA-Z0-9@_./+-]+$/` before shell commands
- [ ] Whitelist elevation: replace `run-elevated(cmd)` with structured operations
- [ ] Validate every IPC argument in the registration path
- [ ] Prefer `execFile`/`spawn` without shell where possible
- [ ] Guarantee `timeout` + `maxBuffer` on all ~49 `exec()` call sites

**Verification:** npm registry XSS test on a hostile package name; code review; `npm run doctor`.

---

# ⏳ Phase 2 — Architecture (P0)

**Goal:** split the monolith, standardize the renderer. Unlocks Phase 5. Details in `plan.md` §2.

- [ ] Split `src/main/main.js` (1,821 LOC) → `main.js` (entry) + `providers/*` + `exec-async.js` + `config.js` + `ipc.js`
- [ ] Standardize section contract: `init()/update()/destroy()` in all 8 sections
- [ ] Extract shared helpers: `format.js` (`formatSpeed`, `formatCpuModel`, `isPermissionError`), `constants.js`

**Verification:** app boots + all 7 sections render; `react-doctor` still 100/100.

---

# ⏳ Phase 3 — Reliability (P1)

- [ ] Standard `runCommand` wrapper kills nested callback pyramids
- [ ] User-visible inline error states in every section
- [ ] `process.on('uncaughtException'/'unhandledRejection')` guard + local log

---

# ⏳ Phase 4 — TypeScript + Vite Foundation (P1)

**Goal:** Establish the modern TypeScript/Vite foundation without a big-bang rewrite.

- [ ] Add TypeScript configuration.
- [ ] Add Vite build configuration.
- [ ] Define shared IPC contracts.
- [ ] Convert utilities first.
- [ ] Convert providers incrementally.
- [ ] Convert preload/IPC.
- [ ] Convert renderer sections.
- [ ] Convert main process.
- [ ] Enable strict mode progressively.
- [ ] Verify production build after each migration step.

**Verification:** application boots, all baseline features still work, and typecheck/build pass.

# ⏳ Phase 5 — Testing & CI (P1)

**Goal:** Create automated protection before aggressive optimization.

- [ ] Unit tests for pure utilities/parsers.
- [ ] Provider tests with mocks.
- [ ] IPC integration tests.
- [ ] Renderer/component tests where practical.
- [ ] Electron smoke/E2E tests where compatible.
- [ ] `npm test`.
- [ ] `npm run test:watch`.
- [ ] CI runs typecheck → lint → test → build.

**Verification:** baseline behavior has automated regression coverage.

# ⏳ Phase 6 — Low-End Performance (P0/P1)

**Goal:** Reduce startup/RAM/CPU cost while preserving monitoring accuracy.

- [ ] Smart polling.
- [ ] Lazy-load Developer.
- [ ] Pause hidden sections.
- [ ] Cache DOM references.
- [ ] Incremental list rendering.
- [ ] DPR-aware Canvas.
- [ ] `ResizeObserver`.
- [ ] RAF coalescing.
- [ ] Cap chart history.
- [ ] Low Power mode.
- [ ] Low-End mode.
- [ ] Repeat baseline measurement.

**Targets:**
- Startup < 2 s target.
- Idle RAM < 150 MB target.
- Idle CPU < 1–2% target.

**Verification:** compare the same measurement method against the Phase 0 baseline.

# ⏳ Phase 7 — UI Modernization (P1)

- [ ] System/light/dark theme detection + accent color (CSS variables)
- [ ] Settings page with local config store
- [ ] Responsive collapsible sidebar, keyboard nav, focus states, `prefers-reduced-motion`
- [ ] Better empty/loading/error states; textual status alongside color indicators

---

# ⏳ Phase 8 — Windows-Native (P1)

- [ ] Tray icon + minimize-to-tray + start-with-Windows
- [ ] Windows notifications, accent-color/theme detection, native shortcuts
- [ ] Verified on 100–200% scaling and multi-monitor

---

# ⏳ Phase 9 — Packaging, Signing & Updates (P1/P2)

**Goal:** Produce a professional Windows release.

- [ ] NSIS installer.
- [ ] Portable build.
- [ ] User data outside install directory.
- [ ] Upgrade path.
- [ ] Uninstaller.
- [ ] Code signing.
- [ ] Safe auto-update.
- [ ] Update recovery behavior.
- [ ] Release artifact verification.

**Verification:** clean VM install → launch → update → uninstall.

# ⏳ Phase 10 — Final Optimization & Release Candidate (P0/P1)

**Goal:** Validate the entire application before stable release.

- [ ] 30–60 minute stability test.
- [ ] Low-end PC test.
- [ ] Windows 10 test.
- [ ] Windows 11 test.
- [ ] 100–200% DPI test.
- [ ] Multi-monitor test.
- [ ] Clean installation.
- [ ] Upgrade.
- [ ] Uninstall/reinstall.
- [ ] Security review.
- [ ] Performance regression review.
- [ ] Release candidate smoke test.

**Verification:** no P0/P1 blocker, no uncontrolled memory growth, acceptable startup/CPU/RAM, and all release-critical features pass.

## 🗂️ Two-File Workflow

Only two planning files are required:

```text
plan.md
  Permanent roadmap and project requirements.

plan-phase.md
  Live execution state, evidence, measurements, blockers, and progress.
```

### When to update `plan.md`

Update it when a requirement, target, architecture rule, technology decision, or Definition of Done changes.

### When to update `plan-phase.md`

Update it whenever work is performed:

```text
started
measured
tested
blocked
completed
regressed
verified
```

### Phase rule

Never mark a phase `✅` merely because code exists.

A phase is complete only when its verification evidence exists.


## 📈 Progress Log

| Date | Phase | Action | Result |
|------|-------|--------|--------|
| 2026-08-01 | 0 | Baseline measured | Startup 5.7s · RAM 324–365 MB · CPU 1.4% · doctor 100/100 |
| 2026-08-01 | 0 | Feature audit | 12 features verified by inspection |
| 2026-08-01 | 0 | Tooling | `scripts/measure-baseline.js` created (reusable) |

---

## 🧰 Reusable Tooling

- `scripts/measure-baseline.js` — spawns the app, measures startup/memory/CPU, auto-closes (~12 s run). Run before/after each performance phase to prove improvement.

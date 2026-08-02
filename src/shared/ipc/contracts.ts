/* ============================================================
   📦 SHARED IPC CONTRACTS (Phase 4 — Stage 4)
   ============================================================
   Single source of truth for the data shapes crossing the
   preload bridge and the full `window.electronAPI` surface the
   renderer is allowed to call. The main process (still CJS)
   mirrors these shapes via JSDoc; the renderer imports the
   real types from here.

   Keeping the channel names + payloads in one file makes the
   preload ↔ ipcMain contract auditable (see test/ipc.test.js).
   ============================================================ */

// ──────────────────────────────────────────────
// 📊 System data
// ──────────────────────────────────────────────

export interface VirtualMemory {
  used: number;
  free: number;
  total: number;
}

export interface GpuInfo {
  allGpus?: string;
}

export interface StorageSummary {
  storageFetched?: boolean;
  total?: number;
  used?: number;
}

export interface NetworkInterfaceInfo {
  name: string;
  address?: string;
  family?: string;
  mac?: string;
  internal?: boolean;
}

export interface SystemInfo {
  cpuUsage?: number;
  loadAvg: number[];
  cpus: number;
  cpuModel?: string;
  cpuSpeed?: number;
  totalMemory: number;
  freeMemory: number;
  usableMemory?: number;
  uptime: number;
  hostname: string;
  platform: string;
  arch: string;
  osType?: string;
  osRelease?: string;
  osEdition?: string;
  osDisplayVersion?: string;
  osActivationStatus?: string;
  gpuInfo?: GpuInfo;
  storageSummary?: StorageSummary;
  virtualMemory?: VirtualMemory;
  allInterfaces?: NetworkInterfaceInfo[];
  networkInterfaces?: NetworkInterfaceInfo[];
}

export interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  free: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface BatteryInfo {
  hasBattery: boolean;
  level: number;
  charging: boolean;
  acConnected: boolean;
}

export interface FanInfo {
  id: string;
  kind: 'cpu' | 'gpu';
  label: string;
  rpm: number;
  /** Unit of `rpm`: 'rpm' (tachometer) or 'pct' (nvidia-smi GPU fan %, 0-100). */
  unit?: 'rpm' | 'pct';
}

export interface FanInfoResult {
  supported: boolean;
  fans: FanInfo[];
}

export interface BatteryDetails {
  EstimatedRunTime?: string;
  estimatedRunTime?: string;
  TimeToFullCharge?: string;
  timeToFullCharge?: string;
  // Capacity fields (Windows CIM/WMIC, macOS ioreg, Linux sysfs) — used to
  // derive battery health = full-charge capacity ÷ design capacity.
  DesignCapacity?: string | number;
  FullChargeCapacity?: string | number;
  MaxCapacity?: string | number;
  charge_full_design?: string | number;
  charge_full?: string | number;
  CycleCount?: string | number;
  cycle_count?: string | number;
}

export interface NetworkSpeedData {
  speed?: { rx: number; tx: number };
  total?: { rx: number; tx: number };
}

export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
}

export interface PackageActionResult {
  success: boolean;
  message?: string;
}

export interface AdminStatus {
  isAdmin: boolean;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  url?: string;
  message?: string;
}

// ──────────────────────────────────────────────
// ⚙️ App preferences (Phase 7/8 — settings store)
// ──────────────────────────────────────────────

export interface AppPreferences {
  theme: 'system' | 'light' | 'dark';
  accentColor: string;
  perfMode: 'balanced' | 'lowPower' | 'lowEnd';
  reducedMotion: boolean;
  sidebarCollapsed: boolean;
  startWithWindows: boolean;
  minimizeToTray: boolean;
}

export type PartialPreferences = Partial<AppPreferences>;

// ──────────────────────────────────────────────
// 🔌 ElectronAPI — the complete preload bridge surface
// ──────────────────────────────────────────────

export interface ElectronAPI {
  // System data (async — returns a Promise)
  getSystemInfo(): Promise<SystemInfo>;
  getDiskInfo(): Promise<DiskInfo[]>;
  getBatteryInfo(): Promise<BatteryInfo>;
  getBatteryDetails(): Promise<BatteryDetails | null>;
  getProcessList(): Promise<ProcessInfo[]>;
  getVirtualMemory(): Promise<VirtualMemory | null>;
  getNetworkSpeed(): Promise<NetworkSpeedData | null>;
  getCpuTemp(): Promise<number | null>;
  getGpuTemp(): Promise<number | null>;
  getFanInfo(): Promise<FanInfoResult>;

  // Packages
  getNpmPackages(): Promise<PackageInfo[]>;
  getPipPackages(): Promise<PackageInfo[]>;
  updatePackage(type: string, name: string): Promise<PackageActionResult>;
  deletePackage(type: string, name: string): Promise<PackageActionResult>;
  installPackage(type: string, name: string): Promise<PackageActionResult>;
  elevatePackage(action: string, type: string, name: string): Promise<PackageActionResult>;
  searchNpmPackages(query: string): Promise<PackageInfo[]>;
  searchPipPackages(query: string): Promise<PackageInfo[]>;
  checkAdmin(): Promise<AdminStatus>;
  checkNpmAdmin(): Promise<boolean>;

  // Window controls
  minimize(): void;
  maximize(): void;
  close(): void;
  hideWindow(): void;
  showWindow(): void;
  notify(message: string): void;

  // Preferences (Phase 7/8)
  getAppPreferences(): Promise<AppPreferences>;
  setAppPreferences(prefs: PartialPreferences): Promise<AppPreferences>;

  // Update check (Phase 9)
  checkForUpdate(): Promise<UpdateCheckResult>;

  // Event listeners (main → renderer)
  onMaximize(callback: () => void): void;
  onUnmaximize(callback: () => void): void;
  onMainError(callback: (payload: { scope?: string; message?: string }) => void): void;
  removeMaximizeListeners(): void;
  removeMainErrorListeners(): void;
}

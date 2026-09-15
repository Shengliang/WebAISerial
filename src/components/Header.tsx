import React from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  Cloud,
  CloudOff,
  Cpu,
  Database,
  Download,
  FileCode2,
  HardDrive,
  Keyboard,
  Lock,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Terminal,
  Unlock,
  Users,
  X,
  Columns,
  Zap,
} from 'lucide-react';
import { LiveSessionState, SerialDevice, UserProfile } from '../types';
import { AppSyncState, AVAILABLE_USERS } from '../utils/syncManager';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  devices: SerialDevice[];
  activeDeviceId: string;
  onSelectDevice: (id: string) => void;
  onAddDevice: () => void;
  onRemoveDevice: (id: string) => void;
  splitView: boolean;
  onToggleSplitView: () => void;
  syncState: AppSyncState;
  currentUser: UserProfile;
  onSwitchUser: (user: UserProfile) => void;
  onOpenSyncModal: () => void;
  onOpenAnalytics: () => void;
  onOpenScripts: () => void;
  onOpenExport: () => void;
  onOpenDocs: () => void;
  onOpenShortcuts: () => void;
  onOpenFlasher: () => void;
  onOpenArchive: () => void;
  onOpenLiveModal?: () => void;
  onOpenArmSimulator?: () => void;
  liveState?: LiveSessionState;
  activeTaskId?: string;
  activeSessionId?: string;
}

export const Header: React.FC<HeaderProps> = ({
  devices,
  activeDeviceId,
  onSelectDevice,
  onAddDevice,
  onRemoveDevice,
  splitView,
  onToggleSplitView,
  syncState,
  currentUser,
  onSwitchUser,
  onOpenSyncModal,
  onOpenAnalytics,
  onOpenScripts,
  onOpenExport,
  onOpenDocs,
  onOpenShortcuts,
  onOpenFlasher,
  onOpenArchive,
  onOpenLiveModal,
  onOpenArmSimulator,
  liveState,
  activeTaskId = 'TASK-FW-2026-0913',
  activeSessionId = 'SESS-0042',
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const effectiveOnline = syncState.isOnline && !syncState.isSimulatedOffline;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-200 select-none">
      {/* Top Navbar */}
      <div className="px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80">
        {/* Branding */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-wide text-slate-100 flex items-center gap-1.5">
                SERIAL CONSOLE <span className="text-cyan-400 text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/50">v2.6</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Embedded Firmware Debugger & Real-Time Telemetry
            </p>
          </div>
        </div>

        {/* Global Action Tools & Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
          {/* Connectivity / Sync Status Badge */}
          <button
            onClick={onOpenSyncModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition border ${
              effectiveOnline
                ? syncState.syncStatus === 'syncing'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 animate-pulse'
                  : syncState.syncStatus === 'conflict'
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/70'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700/60'
            }`}
            title="Cloud Sync & Connectivity Status"
          >
            {effectiveOnline ? (
              syncState.syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              )
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="capitalize">
              {effectiveOnline
                ? syncState.syncStatus === 'syncing'
                  ? 'Syncing...'
                  : syncState.syncStatus === 'conflict'
                  ? 'Conflict!'
                  : 'Cloud Synced'
                : 'Offline Mode'}
            </span>
            {syncState.offlineSummary.newLogsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-600 text-cyan-50">
                +{syncState.offlineSummary.newLogsCount}
              </span>
            )}
          </button>

          {/* Encrypted Vault Badge */}
          <button
            onClick={onOpenSyncModal}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700/50"
            title="Encrypted Local Storage (AES-GCM 256-bit)"
          >
            {syncState.vaultLocked ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="hidden md:inline">Vault</span>
          </button>

          {/* Live Console Sharing (1 Writer, N Readers) */}
          <button
            onClick={onOpenLiveModal}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition border ${
              liveState?.isLive
                ? liveState.role === 'writer'
                  ? 'bg-rose-950 text-rose-200 border-rose-600 shadow-md shadow-rose-950 animate-pulse'
                  : 'bg-emerald-950 text-emerald-200 border-emerald-600 shadow-md shadow-emerald-950'
                : 'bg-slate-800/90 hover:bg-slate-750 text-rose-300 border-rose-900/70 hover:border-rose-700'
            }`}
            title="Share serial console live with team members across the web (1 Writer, N Readers)"
          >
            <Radio className={`w-3.5 h-3.5 ${liveState?.isLive ? 'animate-pulse text-rose-400' : 'text-rose-400'}`} />
            <span>
              {liveState?.isLive
                ? liveState.role === 'writer'
                  ? `Broadcasting (${liveState.participants.length})`
                  : `Live Observer (${liveState.participants.length})`
                : 'Live Share'}
            </span>
          </button>

          {/* ARM Cortex CPU Simulator & C IDE Button */}
          <button
            onClick={onOpenArmSimulator}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition shadow"
            title="ARM Cortex CPU Simulator, C IDE, LED Blinking Demo & Datapath Visualizer (Zero Hardware)"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>ARM C Simulator</span>
          </button>

          {/* Desktop App Install Button (PWA) */}
          <PWAInstallButton />

          {/* Flash & Reboot Workflow Button */}
          <button
            onClick={onOpenFlasher}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-amber-600 to-cyan-600 hover:from-amber-500 hover:to-cyan-500 text-white shadow transition"
            title="Download Image over serial -> Power Cycle -> Capture Boot Log"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Flash &amp; Reboot</span>
          </button>

          {/* 60-Month IndexedDB Archive Button */}
          <button
            onClick={onOpenArchive}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-700/70 transition shadow"
            title="IndexedDB 60-Month Session Archive &amp; SQLite Exporter"
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">60-Mo Archive</span>
          </button>

          {/* Analytics Button */}
          <button
            onClick={onOpenAnalytics}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
            title="Real-time Throughput & Session Analytics (Ctrl+Shift+A)"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Analytics</span>
          </button>

          {/* Script Automation Button */}
          <button
            onClick={onOpenScripts}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
            title="Custom Script Automation (Ctrl+Shift+S)"
          >
            <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Automation</span>
          </button>

          {/* Data Export Button */}
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
            title="Automated Data Export Tools (Ctrl+Shift+E)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Export</span>
          </button>

          {/* Documentation Button */}
          <button
            onClick={onOpenDocs}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
            title="API & Hardware Documentation"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Docs</span>
          </button>

          {/* Keyboard Shortcuts Cheatsheet */}
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 rounded-md text-slate-300 hover:text-white bg-slate-800/80 border border-slate-700 hover:bg-slate-700 transition"
            title="Keyboard Shortcuts Cheatsheet (?)"
            aria-label="Keyboard Shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          {/* User Profile Switcher */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md text-xs bg-slate-800 border border-slate-700 hover:border-slate-600 transition"
              title="Active User Session"
            >
              <div className="w-5 h-5 rounded-full bg-cyan-600 text-white font-bold text-[10px] flex items-center justify-center">
                {currentUser.avatarInitials}
              </div>
              <span className="text-slate-200 font-medium hidden sm:inline max-w-[90px] truncate">
                {currentUser.name}
              </span>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1.5 z-50">
                <div className="px-3 py-1.5 border-b border-slate-800 text-xs">
                  <p className="font-semibold text-slate-200">{currentUser.name}</p>
                  <p className="text-[11px] text-cyan-400 font-mono">{currentUser.role}</p>
                  <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
                </div>
                <div className="px-2 py-1 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  Switch Active Operator
                </div>
                {AVAILABLE_USERS.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSwitchUser(u);
                      setUserDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-800 transition ${
                      u.id === currentUser.id ? 'bg-cyan-950/60 text-cyan-300 font-medium' : 'text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-[10px] text-slate-400">{u.role}</div>
                    </div>
                    {u.id === currentUser.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Concurrent Device Connection Tabs Bar */}
      <div className="px-2 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto bg-slate-950/80">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {devices.map(device => {
            const isSelected = device.id === activeDeviceId;
            const isConnected = device.status === 'connected';

            return (
              <div
                key={device.id}
                onClick={() => onSelectDevice(device.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono cursor-pointer transition border ${
                  isSelected
                    ? 'bg-slate-800 text-cyan-200 border-cyan-600/70 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                {/* Device Type Icon & Status LED */}
                <span className="relative flex h-2 w-2">
                  {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isConnected
                        ? 'bg-emerald-500'
                        : device.status === 'connecting'
                        ? 'bg-amber-400 animate-pulse'
                        : device.status === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-600'
                    }`}
                  />
                </span>

                <span className="font-semibold">{device.name}</span>

                <span className="text-[10px] px-1 py-0.2 rounded bg-slate-950 text-slate-400">
                  {device.config.baudRate}
                </span>

                {devices.length > 1 && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveDevice(device.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition"
                    title="Close device tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Device Button */}
          <button
            onClick={onAddDevice}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-dashed border-slate-700 hover:border-slate-500 transition whitespace-nowrap"
            title="Add another concurrent serial device connection"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Add Device</span>
          </button>
        </div>

        {/* Multi-Device Split View Toggle & Active Task Indicator */}
        <div className="flex items-center gap-2 pl-2">
          {/* Active Task & Session Indicator */}
          <button
            onClick={onOpenArchive}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono hover:border-slate-500 transition"
            title="Current Task & Session context (Click to browse 60-month IndexedDB archive)"
          >
            <span className="text-slate-400">Task:</span>
            <span className="text-cyan-300 font-bold">{activeTaskId}</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400">{activeSessionId}</span>
          </button>

          {devices.length > 1 && (
            <button
              onClick={onToggleSplitView}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition border ${
                splitView
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Toggle split view across multiple devices"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{splitView ? 'Single' : 'Split View'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

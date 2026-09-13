import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  GitBranch,
  HardDrive,
  Key,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { ConflictResolutionStrategy, SyncConflict } from '../types';
import { AppSyncState, syncManager } from '../utils/syncManager';

interface SyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: AppSyncState;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({
  isOpen,
  onClose,
  syncState,
}) => {
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseSuccess, setPassphraseSuccess] = useState(false);

  if (!isOpen) return null;

  const effectiveOnline = syncState.isOnline && !syncState.isSimulatedOffline;

  const handleSimulateOfflineToggle = () => {
    syncManager.setSimulatedOffline(!syncState.isSimulatedOffline);
  };

  const handleManualSync = () => {
    syncManager.triggerSync();
  };

  const handleStrategyChange = (strategy: ConflictResolutionStrategy) => {
    syncManager.setConflictStrategy(strategy);
  };

  const handleVaultPassphraseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput.trim()) return;
    syncManager.setVaultKey(passphraseInput.trim());
    syncManager.setVaultLocked(false);
    setPassphraseSuccess(true);
    setTimeout(() => setPassphraseSuccess(false), 2000);
    setPassphraseInput('');
  };

  const handleToggleVaultLock = () => {
    syncManager.setVaultLocked(!syncState.vaultLocked);
  };

  const handleResolveConflict = (conflictId: string, resolution: 'local' | 'cloud' | 'merge') => {
    syncManager.resolveConflict(conflictId, resolution);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-100">
                Cloud Synchronization & Encrypted Offline Vault
              </h2>
              <p className="text-xs text-slate-400">
                Monitor connectivity state, offline mutation queue, multi-device conflict protocols, and AES-GCM vault
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top Connectivity Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  effectiveOnline
                    ? syncState.syncStatus === 'syncing'
                      ? 'bg-amber-500/20 text-amber-400'
                      : syncState.syncStatus === 'conflict'
                      ? 'bg-rose-500/20 text-rose-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {effectiveOnline ? (
                  syncState.syncStatus === 'syncing' ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Wifi className="w-5 h-5" />
                  )
                ) : (
                  <WifiOff className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-100">
                    {effectiveOnline
                      ? syncState.syncStatus === 'syncing'
                        ? 'Synchronizing Changes...'
                        : syncState.syncStatus === 'conflict'
                        ? 'Data Conflict Detected'
                        : 'Connected to Cloud Synchronization'
                      : 'Working in Offline Field Mode'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      effectiveOnline
                        ? syncState.syncStatus === 'synced'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : syncState.syncStatus === 'conflict'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {syncState.syncStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Last synced:{' '}
                  <span className="font-mono text-cyan-400">
                    {new Date(syncState.lastSyncedAt).toLocaleTimeString()}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Simulate Offline Button */}
              <button
                onClick={handleSimulateOfflineToggle}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  syncState.isSimulatedOffline
                    ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
                title="Toggle offline state simulation for field testing"
              >
                {syncState.isSimulatedOffline ? 'Exit Offline Sim' : 'Simulate Offline Mode'}
              </button>

              {/* Force Sync Now */}
              <button
                onClick={handleManualSync}
                disabled={!effectiveOnline || syncState.syncStatus === 'syncing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition shadow disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    syncState.syncStatus === 'syncing' ? 'animate-spin' : ''
                  }`}
                />
                <span>Sync Now</span>
              </button>
            </div>
          </div>

          {/* Offline Changes Summary Dashboard */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Offline Mutations Dashboard (Pending Cloud Synchronization)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                <span className="text-[11px] text-slate-400">Queued Logs</span>
                <div className="text-xl font-bold font-mono text-cyan-400">
                  {syncState.offlineSummary.newLogsCount}
                </div>
                <span className="text-[10px] text-slate-500">Auto-flushes on link</span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                <span className="text-[11px] text-slate-400">Saved Macros</span>
                <div className="text-xl font-bold font-mono text-indigo-400">
                  {syncState.offlineSummary.savedMacrosCount}
                </div>
                <span className="text-[10px] text-slate-500">Stored in vault</span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                <span className="text-[11px] text-slate-400">Modified Scripts</span>
                <div className="text-xl font-bold font-mono text-amber-400">
                  {syncState.offlineSummary.modifiedScriptsCount}
                </div>
                <span className="text-[10px] text-slate-500">Version tracked</span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                <span className="text-[11px] text-slate-400">Pending Sessions</span>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {syncState.offlineSummary.sessionsPendingSync}
                </div>
                <span className="text-[10px] text-slate-500">Encrypted records</span>
              </div>
            </div>
          </div>

          {/* Automated Data Conflict Resolution Protocols */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-sm text-slate-200">
                  Multi-Device Data Conflict Resolution Protocol
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Protocol Engine</span>
            </div>

            <p className="text-xs text-slate-400">
              Select how data collisions are resolved when two bench engineers modify test scripts or calibrations simultaneously:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStrategyChange('last_write_wins')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  syncState.conflictStrategy === 'last_write_wins'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-slate-100">Last-Write-Wins</div>
                <div className="text-[11px] text-slate-400">
                  Automatically accepts the most recent UTC timestamp from any node.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleStrategyChange('keep_local')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  syncState.conflictStrategy === 'keep_local'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-slate-100">Keep Local (Device Priority)</div>
                <div className="text-[11px] text-slate-400">
                  Favors physical workbench mutations over cloud baseline.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleStrategyChange('manual')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  syncState.conflictStrategy === 'manual'
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-slate-100">Interactive 3-Way Merge</div>
                <div className="text-[11px] text-slate-400">
                  Flags collision and presents side-by-side diff review modal.
                </div>
              </button>
            </div>

            {/* Active Conflicts List (if any) */}
            {syncState.conflicts.length > 0 && (
              <div className="mt-3 p-3 bg-rose-950/30 border border-rose-800/80 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>Unresolved Collision: {syncState.conflicts[0].title}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div className="border-r border-slate-800 pr-2 space-y-1">
                    <span className="text-cyan-400 font-bold">Local Device Version</span>
                    <pre className="text-[10px] text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(syncState.conflicts[0].localData, null, 2)}
                    </pre>
                    <button
                      onClick={() => handleResolveConflict(syncState.conflicts[0].id, 'local')}
                      className="mt-1 px-2 py-0.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-[10px] font-sans font-medium"
                    >
                      Accept Local
                    </button>
                  </div>
                  <div className="pl-2 space-y-1">
                    <span className="text-amber-400 font-bold">Cloud Server Baseline</span>
                    <pre className="text-[10px] text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(syncState.conflicts[0].cloudData, null, 2)}
                    </pre>
                    <button
                      onClick={() => handleResolveConflict(syncState.conflicts[0].id, 'cloud')}
                      className="mt-1 px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-sans font-medium"
                    >
                      Accept Cloud
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Encrypted Local Storage Vault */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-slate-200">
                  Encrypted Local Storage Vault
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800">
                <span>AES-GCM 256-bit</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Offline logs, sensitive hardware registers, and API keys are automatically encrypted client-side using Web Crypto PBKDF2 key derivation before hitting disk storage.
            </p>

            <form onSubmit={handleVaultPassphraseSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Key className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="password"
                  value={passphraseInput}
                  onChange={e => setPassphraseInput(e.target.value)}
                  placeholder="Set custom master passkey..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
              >
                Update Key
              </button>
              <button
                type="button"
                onClick={handleToggleVaultLock}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
              >
                {syncState.vaultLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unlock</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lock</span>
                  </>
                )}
              </button>
            </form>

            {passphraseSuccess && (
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Vault key updated. Local records re-encrypted.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

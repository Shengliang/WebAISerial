/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiDocumentationModal } from './components/ApiDocumentationModal';
import { AnalyticsDashboardModal } from './components/AnalyticsDashboardModal';
import { CommandInputBar } from './components/CommandInputBar';
import { DeviceConnectionBar } from './components/DeviceConnectionBar';
import { ExportModal } from './components/ExportModal';
import { Header } from './components/Header';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { MacroManagerModal } from './components/MacroManagerModal';
import { ScriptAutomationModal } from './components/ScriptAutomationModal';
import { SyncStatusModal } from './components/SyncStatusModal';
import { TerminalView } from './components/TerminalView';
import { DEFAULT_MACROS } from './data/defaultMacros';
import {
  CommandMacro,
  LineEnding,
  LogEntry,
  LogLevel,
  SerialDevice,
  SessionAnalytics,
  UserProfile,
} from './types';
import { parseHexInput } from './utils/hexFormatter';
import { serialService } from './utils/serialService';
import { AppSyncState, AVAILABLE_USERS, syncManager } from './utils/syncManager';

const INITIAL_DEVICES: SerialDevice[] = [
  {
    id: 'dev-1',
    name: 'ESP32-S3 Bench #1',
    portType: 'virtual',
    virtualProfile: 'esp32',
    status: 'disconnected',
    config: {
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    },
    rxBytesTotal: 0,
    txBytesTotal: 0,
    rxBytesSec: 0,
    txBytesSec: 0,
    dtr: false,
    rts: false,
    cts: true,
    dsr: true,
    color: '#06b6d4',
    lastActive: Date.now(),
  },
];

export default function App() {
  const [devices, setDevices] = useState<SerialDevice[]>(INITIAL_DEVICES);
  const [activeDeviceId, setActiveDeviceId] = useState<string>(INITIAL_DEVICES[0].id);
  const [splitView, setSplitView] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [macros, setMacros] = useState<CommandMacro[]>(DEFAULT_MACROS);
  const [isPaused, setIsPaused] = useState(false);

  // Sync and User Auth state
  const [syncState, setSyncState] = useState<AppSyncState>(syncManager.getState());
  const [currentUser, setCurrentUser] = useState<UserProfile>(syncManager.getCurrentUser());

  // Modals visibility
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isScriptsOpen, setIsScriptsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMacroManagerOpen, setIsMacroManagerOpen] = useState(false);

  // Session Analytics tracking
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics>({
    sessionId: 'session-' + Date.now(),
    sessionName: 'Firmware Bench Test Session',
    startTime: Date.now(),
    totalLogs: 0,
    errorCount: 0,
    warnCount: 0,
    rxBytes: 0,
    txBytes: 0,
    deviceIds: [INITIAL_DEVICES[0].id],
    throughputSamples: [],
  });

  // Keep references to prevent stale closures in async callbacks
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Initialize sync manager subscriber
  useEffect(() => {
    const unsubscribe = syncManager.subscribe(state => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  // Configure Serial Manager callbacks
  useEffect(() => {
    serialService.setCallbacks(
      (deviceId, text, rawBytes, direction = 'RX') => {
        if (isPausedRef.current && direction === 'RX') return;

        const currentDev = devicesRef.current.find(d => d.id === deviceId);
        const devName = currentDev ? currentDev.name : 'Serial Target';

        // Infer log level
        let level: LogLevel = 'INFO';
        const lower = text.toLowerCase();
        if (direction === 'TX') {
          level = 'COMMAND';
        } else if (
          lower.includes('error') ||
          lower.includes('panic') ||
          lower.includes('crash') ||
          lower.includes('abort') ||
          lower.includes('fault')
        ) {
          level = 'ERROR';
        } else if (lower.includes('warn') || lower.includes('alert')) {
          level = 'WARN';
        } else if (lower.includes('debug') || lower.includes('trace')) {
          level = 'DEBUG';
        }

        const newEntry: LogEntry = {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          timestamp: Date.now(),
          deviceId,
          deviceName: devName,
          level,
          direction,
          text,
          rawBytes,
        };

        setLogs(prev => {
          // Ring buffer limit: keep last 2500 entries to prevent memory bloating
          const next = prev.length > 2500 ? [...prev.slice(-2000), newEntry] : [...prev, newEntry];
          return next;
        });

        // Record for offline tracking
        syncManager.recordOfflineChange('log');
      },
      updatedDevice => {
        setDevices(prev =>
          prev.map(d => (d.id === updatedDevice.id ? { ...updatedDevice } : d))
        );
      }
    );
  }, []);

  // Periodic Throughput Sample collector for real-time Analytics chart
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      const totalRxSec = devicesRef.current.reduce((acc, d) => acc + d.rxBytesSec, 0);
      const totalTxSec = devicesRef.current.reduce((acc, d) => acc + d.txBytesSec, 0);

      setSessionAnalytics(prev => {
        const nextSamples = [
          ...prev.throughputSamples.slice(-29), // keep last 30 samples
          {
            time: timeStr,
            timestamp: Date.now(),
            rxBps: totalRxSec,
            txBps: totalTxSec,
          },
        ];

        return {
          ...prev,
          rxBytes: devicesRef.current.reduce((acc, d) => acc + d.rxBytesTotal, 0),
          txBytes: devicesRef.current.reduce((acc, d) => acc + d.txBytesTotal, 0),
          throughputSamples: nextSamples,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener for global view toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+A: Analytics
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsAnalyticsOpen(prev => !prev);
      }
      // Ctrl+Shift+S: Automation Scripts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsScriptsOpen(prev => !prev);
      }
      // Ctrl+Shift+E: Export
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsExportOpen(prev => !prev);
      }
      // Ctrl+P: Pause
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsPaused(prev => !prev);
      }
      // Ctrl+L: Clear logs
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setLogs(prev => prev.filter(l => l.deviceId !== activeDeviceId));
      }
      // Ctrl+Shift+O: Toggle offline simulation
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        syncManager.setSimulatedOffline(!syncState.isSimulatedOffline);
      }
      // ?: Open shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsShortcutsOpen(true);
      }
      // Escape: Close active modal
      if (e.key === 'Escape') {
        setIsAnalyticsOpen(false);
        setIsScriptsOpen(false);
        setIsExportOpen(false);
        setIsSyncModalOpen(false);
        setIsDocsOpen(false);
        setIsShortcutsOpen(false);
        setIsMacroManagerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDeviceId, syncState.isSimulatedOffline]);

  // Active Device selection
  const activeDevice = devices.find(d => d.id === activeDeviceId) || devices[0];

  // Device management handlers
  const handleUpdateConfig = useCallback((deviceId: string, patch: Partial<SerialDevice>) => {
    setDevices(prev =>
      prev.map(d => (d.id === deviceId ? { ...d, ...patch } : d))
    );
  }, []);

  const handleConnect = useCallback(async (device: SerialDevice) => {
    try {
      await serialService.connect(device);
    } catch (err: any) {
      // Handled in serialService status
    }
  }, []);

  const handleDisconnect = useCallback(async (deviceId: string) => {
    await serialService.disconnect(deviceId);
  }, []);

  const handleToggleSignal = useCallback(async (deviceId: string, signal: 'dtr' | 'rts') => {
    const dev = devicesRef.current.find(d => d.id === deviceId);
    if (!dev) return;
    const nextVal = signal === 'dtr' ? !dev.dtr : !dev.rts;
    await serialService.setSignals(deviceId, { [signal]: nextVal });
  }, []);

  const handleAddDevice = () => {
    const profiles = ['esp32', 'stm32', 'nrf52', 'custom_echo'] as const;
    const nextProfile = profiles[devices.length % profiles.length];
    const newId = 'dev-' + Date.now();
    const newName =
      nextProfile === 'esp32'
        ? `ESP32 Node #${devices.length + 1}`
        : nextProfile === 'stm32'
        ? `STM32-H7 CAN #${devices.length + 1}`
        : nextProfile === 'nrf52'
        ? `nRF52840 BLE #${devices.length + 1}`
        : `Echo Port #${devices.length + 1}`;

    const newDevice: SerialDevice = {
      id: newId,
      name: newName,
      portType: 'virtual',
      virtualProfile: nextProfile,
      status: 'disconnected',
      config: {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      },
      rxBytesTotal: 0,
      txBytesTotal: 0,
      rxBytesSec: 0,
      txBytesSec: 0,
      dtr: false,
      rts: false,
      cts: true,
      dsr: true,
      color: '#38bdf8',
      lastActive: Date.now(),
    };

    setDevices(prev => [...prev, newDevice]);
    setActiveDeviceId(newId);
  };

  const handleRemoveDevice = async (deviceId: string) => {
    await serialService.disconnect(deviceId);
    setDevices(prev => {
      const next = prev.filter(d => d.id !== deviceId);
      if (activeDeviceId === deviceId && next.length > 0) {
        setActiveDeviceId(next[0].id);
      }
      return next;
    });
  };

  // Command transmission
  const handleSendCommand = async (
    command: string,
    isHex: boolean,
    lineEnding: LineEnding
  ) => {
    if (!activeDevice || activeDevice.status !== 'connected') {
      alert('Please connect to the serial port or start the simulator first.');
      return;
    }

    try {
      if (isHex) {
        const bytes = parseHexInput(command);
        if (bytes.length === 0) return;
        await serialService.send(activeDevice.id, bytes);
      } else {
        let payload = command;
        if (lineEnding === 'CRLF') payload += '\r\n';
        else if (lineEnding === 'LF') payload += '\n';
        else if (lineEnding === 'CR') payload += '\r';
        await serialService.send(activeDevice.id, payload);
      }
    } catch (err: any) {
      console.error('Send failed:', err);
    }
  };

  const handleTriggerMacro = (macro: CommandMacro) => {
    handleSendCommand(macro.command, macro.isHex, 'CRLF');
  };

  const handleClearLogs = (deviceId: string) => {
    setLogs(prev => prev.filter(l => l.deviceId !== deviceId));
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Application Header */}
      <Header
        devices={devices}
        activeDeviceId={activeDeviceId}
        onSelectDevice={setActiveDeviceId}
        onAddDevice={handleAddDevice}
        onRemoveDevice={handleRemoveDevice}
        splitView={splitView}
        onToggleSplitView={() => setSplitView(!splitView)}
        syncState={syncState}
        currentUser={currentUser}
        onSwitchUser={u => {
          setCurrentUser(u);
          syncManager.switchUser(u);
        }}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        onOpenScripts={() => setIsScriptsOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Main Terminal Viewport Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {splitView && devices.length > 1 ? (
          /* Multi-Device Split View */
          <div className="flex-1 flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            {devices.slice(0, 2).map(device => (
              <div key={device.id} className="flex-1 flex flex-col min-h-0">
                <DeviceConnectionBar
                  device={device}
                  onUpdateConfig={handleUpdateConfig}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onToggleSignal={handleToggleSignal}
                />
                <div className="flex-1 min-h-0">
                  <TerminalView
                    logs={logs}
                    activeDeviceId={device.id}
                    onClearLogs={handleClearLogs}
                    isPaused={isPaused}
                    onTogglePause={() => setIsPaused(!isPaused)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single Active Device View */
          <div className="flex-1 flex flex-col min-h-0">
            {activeDevice && (
              <DeviceConnectionBar
                device={activeDevice}
                onUpdateConfig={handleUpdateConfig}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onToggleSignal={handleToggleSignal}
              />
            )}
            <div className="flex-1 min-h-0">
              <TerminalView
                logs={logs}
                activeDeviceId={activeDeviceId}
                onClearLogs={handleClearLogs}
                isPaused={isPaused}
                onTogglePause={() => setIsPaused(!isPaused)}
              />
            </div>
          </div>
        )}

        {/* Bottom Command Injection & Macros Bar */}
        <CommandInputBar
          onSendCommand={handleSendCommand}
          macros={macros}
          onTriggerMacro={handleTriggerMacro}
          onOpenMacroManager={() => setIsMacroManagerOpen(true)}
          disabled={!activeDevice || activeDevice.status !== 'connected'}
        />
      </div>

      {/* Modals & Dialogs */}
      <AnalyticsDashboardModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        logs={logs}
        devices={devices}
        sessionAnalytics={sessionAnalytics}
      />

      <ScriptAutomationModal
        isOpen={isScriptsOpen}
        onClose={() => setIsScriptsOpen(false)}
        activeDeviceId={activeDeviceId}
        onRunScriptFinished={() => syncManager.recordOfflineChange('script')}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        logs={logs}
        devices={devices}
        sessionAnalytics={sessionAnalytics}
      />

      <SyncStatusModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        syncState={syncState}
      />

      <ApiDocumentationModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <MacroManagerModal
        isOpen={isMacroManagerOpen}
        onClose={() => setIsMacroManagerOpen(false)}
        macros={macros}
        onSaveMacros={newMacros => {
          setMacros(newMacros);
          syncManager.recordOfflineChange('macro');
        }}
      />
    </div>
  );
}

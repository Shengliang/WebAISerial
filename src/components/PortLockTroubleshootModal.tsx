import React, { useState } from 'react';
import {
  X,
  Zap,
  Terminal,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Cpu,
  PowerOff,
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { serialService } from '../utils/serialService';

interface PortLockTroubleshootModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete?: () => void;
}

export const PortLockTroubleshootModal: React.FC<PortLockTroubleshootModalProps> = ({
  isOpen,
  onClose,
  onResetComplete,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = async (cmd: string) => {
    await copyToClipboard(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const handleForceReset = async () => {
    setIsResetting(true);
    setResetStatus(null);
    try {
      const result = await serialService.forceResetAllConnections();
      setResetStatus(
        result.closedPorts > 0
          ? `Successfully reset ${result.closedPorts} web connection(s).`
          : 'App connections are clear. If port is still locked, run "killall screen" in Terminal.'
      );
      if (onResetComplete) {
        onResetComplete();
      }
    } catch (err: any) {
      setResetStatus('Reset completed: ' + (err.message || String(err)));
    } finally {
      setIsResetting(false);
    }
  };

  const MAC_COMMANDS = [
    {
      title: 'Kill all screen sessions (Standard)',
      cmd: 'killall screen',
      desc: 'Instantly terminates all background macOS `screen` processes holding the serial device.',
    },
    {
      title: 'Force-kill all terminal serial locks',
      cmd: 'killall screen 2>/dev/null; pkill -9 -f "screen.*tty|cu -l"',
      desc: 'Cleans up any stubborn screen or cu terminal sessions on macOS.',
    },
  ];

  const LINUX_COMMANDS = [
    {
      title: 'Release busy USB device on Linux',
      cmd: 'sudo fuser -k /dev/ttyUSB0 /dev/ttyACM0 2>/dev/null',
      desc: 'Terminates any Linux process currently holding the USB serial device.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Serial Port Locked / Device Busy
              </h2>
              <p className="text-xs text-slate-400">
                Release busy hardware ports or terminate background terminal sessions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Step 1: Kill Old Web Connections */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                <PowerOff className="w-4 h-4" />
                <span>1. Kill Old Browser Connections & Release Locks</span>
              </div>
              <button
                type="button"
                onClick={handleForceReset}
                disabled={isResetting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition active:scale-95 disabled:opacity-50 shadow-sm border border-cyan-400/40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? 'Killing & Resetting...' : 'Kill Old Web Connections'}</span>
              </button>
            </div>
            <p className="text-slate-400 leading-relaxed">
              If another tab in Chrome or a previous session held onto the serial port, this button
              cancels all read/write locks, closes active ports, and revokes Chrome device handles so the
              port becomes freely available again.
            </p>
            {resetStatus && (
              <div className="px-3 py-2 rounded bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{resetStatus}</span>
              </div>
            )}
          </div>

          {/* Step 2: macOS Terminal Commands */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Terminal className="w-4 h-4" />
              <span>2. Exit or Kill macOS Terminal 'screen' Session</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Serial ports can only be opened by one program at a time. If you opened the device in macOS
              Terminal using <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded font-mono">screen /dev/cu.usb...</code>,
              it locks the hardware until exited.
            </p>

            <div className="space-y-2">
              {MAC_COMMANDS.map((item, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800/80 rounded-md p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-slate-200">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.cmd)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-semibold transition"
                    >
                      {copiedCmd === item.cmd ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-cyan-300 bg-slate-950 px-2 py-1 rounded select-all border border-slate-800">
                    {item.cmd}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-slate-400 text-[11px] bg-slate-900/50 p-2.5 rounded border border-slate-800/60">
              <span className="font-semibold text-slate-300">Shortcut within screen:</span> If you are
              currently in your terminal window running screen, press{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono">
                Ctrl + A
              </kbd>{' '}
              then{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono">
                Ctrl + \
              </kbd>{' '}
              (or <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono">k</kbd> then <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono">y</kbd>) to safely detach and kill screen.
            </div>
          </div>

          {/* Step 3: Hardware Reset */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 flex items-start gap-3">
            <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-slate-200">Hardware Reset Tip:</span>
              <p className="text-slate-400 text-[11px]">
                If the USB-UART chip (e.g. FTDI, CP2102, CH340) is stuck in an unreleased driver state,
                unplug the USB cable from your computer, wait 3 seconds, and plug it back in.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={handleForceReset}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 underline underline-offset-2"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>Reset All Ports Now</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

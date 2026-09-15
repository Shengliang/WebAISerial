import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Terminal,
  Cable,
  Power,
  Trash2,
  ArrowDown,
  Copy,
  Check,
  ExternalLink,
  Send,
  AlertCircle,
  X,
  SlidersHorizontal,
  Clock,
  CornerDownLeft,
  ChevronDown,
} from 'lucide-react';
import { LineEnding, LogEntry, SerialDevice } from '../types';
import { parseAnsi, stripAnsi } from '../utils/ansi';
import { isWebSerialSupported } from '../utils/serialService';

const BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];

interface CleanSerialConsoleProps {
  device: SerialDevice;
  logs: LogEntry[];
  onConnect: (device: SerialDevice) => void;
  onDisconnect: (deviceId: string) => void;
  onUpdateConfig: (deviceId: string, patch: Partial<SerialDevice>) => void;
  onSendCommand: (command: string, isHex: boolean, lineEnding: LineEnding) => Promise<void>;
  onClearLogs: (deviceId: string) => void;
  onSwitchToWorkbench?: () => void;
}

export const CleanSerialConsole: React.FC<CleanSerialConsoleProps> = ({
  device,
  logs,
  onConnect,
  onDisconnect,
  onUpdateConfig,
  onSendCommand,
  onClearLogs,
  onSwitchToWorkbench,
}) => {
  const [inputText, setInputText] = useState('');
  const [lineEnding, setLineEnding] = useState<LineEnding>('CRLF');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasWebSerial = isWebSerialSupported();
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isConnected = device.status === 'connected';
  const isConnecting = device.status === 'connecting';

  // Filter logs for this device
  const deviceLogs = useMemo(() => {
    return logs.filter(l => l.deviceId === device.id);
  }, [logs, device.id]);

  // Auto-scroll to bottom whenever new logs arrive
  useEffect(() => {
    if (autoScroll && !isScrolledUp && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [deviceLogs, autoScroll, isScrolledUp]);

  // Track scroll position to pause autoscroll when user scrolls up
  const handleScroll = () => {
    if (!terminalContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const scrolledAway = distanceToBottom > 40;
    setIsScrolledUp(scrolledAway);
  };

  const scrollToBottom = () => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
      setIsScrolledUp(false);
      setAutoScroll(true);
    }
  };

  // Handle command submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && lineEnding === 'none') return;

    const cmd = inputText;
    if (cmd.trim()) {
      setHistory(prev => [...prev.slice(-49), cmd]);
      setHistoryIndex(-1);
    }

    setInputText('');
    await onSendCommand(cmd, false, lineEnding);
  };

  // Keyboard navigation for history (Up/Down arrows)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputText(history[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputText('');
      } else {
        setHistoryIndex(nextIndex);
        setInputText(history[nextIndex] || '');
      }
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inputText) {
      // Send Ctrl+C / SIGINT break byte
      e.preventDefault();
      onSendCommand('\x03', false, 'none');
    }
  };

  const handleCopyAll = () => {
    const rawText = deviceLogs.map(l => stripAnsi(l.text)).join('');
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBaudChange = (newBaud: number) => {
    onUpdateConfig(device.id, {
      config: {
        ...device.config,
        baudRate: newBaud,
      },
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* Top Header & Connection Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md shrink-0">
        {/* Left: App Identity & Port Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-inner">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-white">
                  Serial Console
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-950 text-cyan-300 border border-cyan-800">
                  WebSerial
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                {isConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 font-medium">{device.name}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300">{device.config.baudRate} 8-N-1</span>
                  </>
                ) : isConnecting ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-300">Requesting Port...</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span className="text-slate-400">Disconnected</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">{device.config.baudRate} bps</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls & Connection Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Baud Rate Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs shadow-inner">
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Baud:</span>
            <select
              value={device.config.baudRate}
              disabled={isConnected}
              onChange={e => handleBaudChange(Number(e.target.value))}
              className="bg-transparent text-cyan-300 font-mono font-medium text-xs focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={isConnected ? 'Disconnect first to change baud rate' : 'Select baud rate'}
            >
              {BAUD_RATES.map(rate => (
                <option key={rate} value={rate} className="bg-slate-900 text-white">
                  {rate}
                </option>
              ))}
            </select>
          </div>

          {/* Connect / Disconnect Action Button */}
          {isConnected ? (
            <button
              onClick={() => onDisconnect(device.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-sm transition border border-rose-500 active:scale-95"
              title="Close and disconnect serial port"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {isIframe && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-sm transition border border-cyan-500"
                  title="Open in dedicated browser tab to grant physical USB serial hardware permissions"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
              )}
              <button
                onClick={() => {
                  onUpdateConfig(device.id, { portType: 'webserial' });
                  onConnect(device);
                }}
                disabled={isConnecting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition border border-emerald-500 active:scale-95 disabled:opacity-50"
                title="Select USB serial port and connect via WebSerial API"
              >
                <Cable className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:block" />

          {/* Quick Utility Icons */}
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`p-1.5 rounded-md text-xs transition border ${
              showTimestamps
                ? 'bg-slate-800 text-cyan-300 border-cyan-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              setAutoScroll(!autoScroll);
              if (!autoScroll) scrollToBottom();
            }}
            className={`p-1.5 rounded-md text-xs transition border ${
              autoScroll
                ? 'bg-slate-800 text-cyan-300 border-cyan-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={autoScroll ? 'Auto-scroll is ON (click to pause)' : 'Auto-scroll is OFF (click to enable)'}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopyAll}
            disabled={deviceLogs.length === 0}
            className="p-1.5 rounded-md text-xs bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 transition disabled:opacity-40"
            title="Copy console text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => onClearLogs(device.id)}
            disabled={deviceLogs.length === 0}
            className="p-1.5 rounded-md text-xs bg-slate-900 text-slate-400 hover:text-rose-300 border border-slate-800 transition disabled:opacity-40"
            title="Clear console (Ctrl+L)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Optional Switcher to Workbench if needed */}
          {onSwitchToWorkbench && (
            <button
              onClick={onSwitchToWorkbench}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition ml-1"
              title="Switch to full workbench mode with advanced tools"
            >
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              <span className="hidden md:inline">Workbench</span>
            </button>
          )}
        </div>
      </header>

      {/* Error Notification Bar if any */}
      {device.error && (
        <div className="bg-rose-950/95 border-b border-rose-800/80 px-4 py-2 text-xs text-rose-200 flex items-center justify-between gap-3 shadow-md shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold">{device.error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isIframe && device.error.includes('iframe') && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold transition shadow"
              >
                <span>Open in New Tab</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => onUpdateConfig(device.id, { error: undefined, status: 'disconnected' })}
              className="text-rose-300 hover:text-white p-1 rounded hover:bg-rose-900/60"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Terminal Output Area */}
      <div className="flex-1 relative flex flex-col min-h-0 bg-[#060a12]">
        <div
          ref={terminalContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs sm:text-[13px] leading-relaxed select-text"
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {deviceLogs.length === 0 ? (
            /* Clean Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
                <Terminal className="w-6 h-6 text-cyan-500/70" />
              </div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">
                WebSerial Console Ready
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                Default configured to <strong className="text-cyan-300">WebSerial API</strong> at{' '}
                <strong className="text-cyan-300">{device.config.baudRate} baud</strong> (8-N-1).
              </p>
              {!isConnected && (
                <div className="flex items-center gap-2">
                  {isIframe ? (
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition shadow"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open in New Tab to Connect USB</span>
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        onUpdateConfig(device.id, { portType: 'webserial' });
                        onConnect(device);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow"
                    >
                      <Cable className="w-4 h-4" />
                      <span>Connect Serial Device</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Stream of Serial Output */
            <div className="space-y-0.5 pb-2">
              {deviceLogs.map((entry, idx) => {
                const isTx = entry.direction === 'TX';
                const ansiSegments = parseAnsi(entry.text);
                const timeString = new Date(entry.timestamp).toLocaleTimeString([], {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <div
                    key={entry.id || idx}
                    className={`flex items-baseline gap-2 py-0.5 hover:bg-slate-900/40 rounded px-1 transition-colors ${
                      isTx ? 'text-cyan-300 bg-cyan-950/20' : 'text-slate-200'
                    }`}
                  >
                    {showTimestamps && (
                      <span className="text-[11px] text-slate-600 select-none shrink-0 font-mono">
                        {timeString}
                      </span>
                    )}

                    {isTx && (
                      <span className="text-cyan-400 font-bold select-none text-[11px] shrink-0">
                        &gt;
                      </span>
                    )}

                    <span className="flex-1 whitespace-pre-wrap break-all">
                      {ansiSegments.map((seg, sIdx) => (
                        <span
                          key={sIdx}
                          style={{
                            color: seg.color || (isTx ? '#67e8f9' : undefined),
                            backgroundColor: seg.bgColor,
                            fontWeight: seg.bold ? 700 : undefined,
                            opacity: seg.dim ? 0.7 : undefined,
                          }}
                        >
                          {seg.text}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          )}
        </div>

        {/* Floating "Scroll to Bottom" button when user scrolled up */}
        {isScrolledUp && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg backdrop-blur transition active:scale-95"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Scroll to bottom</span>
          </button>
        )}
      </div>

      {/* Bottom Command Input Bar */}
      <footer className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 shrink-0 shadow-lg">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Prompt Symbol */}
          <div className="text-slate-500 font-mono text-sm select-none pl-1">
            <CornerDownLeft className="w-4 h-4 text-cyan-500" />
          </div>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected
                ? 'Type command to send... (Press Enter, ↑/↓ for history, Ctrl+C to break)'
                : 'Connect to serial port to send commands...'
            }
            disabled={!isConnected}
            className="flex-1 bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {/* Line Ending Selector */}
          <div className="relative shrink-0">
            <select
              value={lineEnding}
              onChange={e => setLineEnding(e.target.value as LineEnding)}
              className="bg-slate-950 text-slate-300 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
              title="Line ending sent after command"
            >
              <option value="CRLF" className="bg-slate-900">CRLF (\r\n)</option>
              <option value="LF" className="bg-slate-900">LF (\n)</option>
              <option value="CR" className="bg-slate-900">CR (\r)</option>
              <option value="none" className="bg-slate-900">None</option>
            </select>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!isConnected || (!inputText.trim() && lineEnding === 'none')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition shadow-sm border border-cyan-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </footer>
    </div>
  );
};

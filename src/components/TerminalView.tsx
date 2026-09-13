import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Clock,
  Copy,
  Check,
  Filter,
  Maximize2,
  Pause,
  Play,
  Search,
  Sliders,
  Trash2,
  Binary,
  Code2,
} from 'lucide-react';
import { LogEntry, LogLevel } from '../types';
import { parseAnsi, stripAnsi } from '../utils/ansi';
import { HexDumpViewer } from './HexDumpViewer';

interface TerminalViewProps {
  logs: LogEntry[];
  activeDeviceId: string;
  onClearLogs: (deviceId: string) => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  logs,
  activeDeviceId,
  onClearLogs,
  isPaused,
  onTogglePause,
}) => {
  const [viewMode, setViewMode] = useState<'stream' | 'hex' | 'split'>('stream');
  const [searchTerm, setSearchTerm] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showDirection, setShowDirection] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter logs for this device
  const deviceLogs = useMemo(() => {
    return logs.filter(l => l.deviceId === activeDeviceId);
  }, [logs, activeDeviceId]);

  // Apply search and log level filters
  const filteredLogs = useMemo(() => {
    let result = deviceLogs;

    if (levelFilter !== 'ALL') {
      result = result.filter(l => l.level === levelFilter);
    }

    if (searchTerm.trim()) {
      if (useRegex) {
        try {
          const re = new RegExp(searchTerm, caseSensitive ? '' : 'i');
          result = result.filter(l => re.test(stripAnsi(l.text)));
        } catch {
          // If regex syntax is invalid, ignore
        }
      } else {
        const query = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        result = result.filter(l => {
          const plain = caseSensitive ? stripAnsi(l.text) : stripAnsi(l.text).toLowerCase();
          return plain.includes(query);
        });
      }
    }

    // High throughput guard: keep the most recent 1000 items in the DOM
    return result.slice(-1000);
  }, [deviceLogs, levelFilter, searchTerm, useRegex, caseSensitive]);

  // Auto-scroll handler
  useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isPaused]);

  // Track user scroll position
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const scrolledUp = distanceFromBottom > 60;
    setIsScrolledUp(scrolledUp);
    if (scrolledUp && autoScroll) {
      setAutoScroll(false);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
      setIsScrolledUp(false);
    }
  };

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map(l => {
        const time = showTimestamps ? `[${new Date(l.timestamp).toLocaleTimeString()}] ` : '';
        const dir = showDirection ? `[${l.direction}] ` : '';
        return `${time}${dir}${stripAnsi(l.text)}`;
      })
      .join('');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-terminal relative">
      {/* Terminal Toolbar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs select-none">
        {/* View Mode & Filter Switchers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Stream / Split / Hex View Mode */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 font-sans">
            <button
              onClick={() => setViewMode('stream')}
              className={`px-2 py-1 rounded text-xs transition ${
                viewMode === 'stream'
                  ? 'bg-cyan-950 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Standard Terminal Stream"
            >
              Stream
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-2 py-1 rounded text-xs transition ${
                viewMode === 'split'
                  ? 'bg-cyan-950 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split View: Stream + Hex Dump"
            >
              Split
            </button>
            <button
              onClick={() => setViewMode('hex')}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${
                viewMode === 'hex'
                  ? 'bg-cyan-950 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Raw Hex Dump View"
            >
              <Binary className="w-3 h-3" />
              <span>Hex</span>
            </button>
          </div>

          {/* Log Level Filter */}
          <div className="flex items-center gap-1 font-sans">
            <Filter className="w-3 h-3 text-slate-500 hidden sm:inline" />
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value as LogLevel | 'ALL')}
              className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO Only</option>
              <option value="WARN">WARN Only</option>
              <option value="ERROR">ERROR Only</option>
              <option value="DEBUG">DEBUG Only</option>
              <option value="COMMAND">COMMANDS Only</option>
            </select>
          </div>

          {/* Search Bar with Regex & Case options */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 absolute left-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded pl-7 pr-12 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-32 sm:w-44 font-mono"
            />
            <div className="absolute right-1 flex items-center gap-0.5">
              <button
                onClick={() => setCaseSensitive(!caseSensitive)}
                className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${
                  caseSensitive ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Match Case (Aa)"
              >
                Aa
              </button>
              <button
                onClick={() => setUseRegex(!useRegex)}
                className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${
                  useRegex ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Regular Expression (.*)"
              >
                .*
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 font-sans">
          {/* Timestamp Toggle */}
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`p-1.5 rounded transition ${
              showTimestamps
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
            title="Toggle Timestamps"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition border ${
              isPaused
                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Pause incoming log rendering (Ctrl+P)"
          >
            {isPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3 text-slate-400" />}
            <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          {/* Auto-Scroll Toggle */}
          <button
            onClick={() => {
              setAutoScroll(!autoScroll);
              if (!autoScroll) scrollToBottom();
            }}
            className={`px-2 py-1 rounded text-xs transition border ${
              autoScroll
                ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Auto-scroll to latest incoming packet"
          >
            Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>

          {/* Copy Buffer */}
          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Copy visible log buffer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Clear Buffer */}
          <button
            onClick={() => onClearLogs(activeDeviceId)}
            className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Clear terminal buffer (Ctrl+L)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Terminal Viewport */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {viewMode === 'hex' ? (
          <HexDumpViewer logs={logs} activeDeviceId={activeDeviceId} />
        ) : viewMode === 'split' ? (
          <div className="flex-1 flex flex-col lg:flex-row h-full">
            {/* Top/Left Stream */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-auto p-3 font-terminal text-[12.5px] leading-relaxed select-text space-y-0.5 border-b lg:border-b-0 lg:border-r border-slate-800"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-slate-600 italic py-6 text-center font-sans text-xs">
                  Terminal stream empty. Connect device or send a command to start.
                </div>
              ) : (
                filteredLogs.map(entry => (
                  <LogLineRenderer
                    key={entry.id}
                    entry={entry}
                    showTimestamps={showTimestamps}
                    showDirection={showDirection}
                  />
                ))
              )}
            </div>
            {/* Bottom/Right Hex */}
            <div className="flex-1 h-1/2 lg:h-full overflow-hidden">
              <HexDumpViewer logs={logs} activeDeviceId={activeDeviceId} />
            </div>
          </div>
        ) : (
          /* Stream View (Full) */
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto p-3 font-terminal text-[12.5px] leading-relaxed select-text space-y-0.5"
          >
            {filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 font-sans text-xs space-y-2">
                <Code2 className="w-8 h-8 text-slate-700" />
                <p>Console buffer ready. Open a serial port or boot simulator to stream firmware output.</p>
                <p className="text-[11px] text-slate-600">Tip: Press Alt+1 for Help menu, Alt+2 for Version info.</p>
              </div>
            ) : (
              filteredLogs.map(entry => (
                <LogLineRenderer
                  key={entry.id}
                  entry={entry}
                  showTimestamps={showTimestamps}
                  showDirection={showDirection}
                />
              ))
            )}
          </div>
        )}

        {/* Scrolled Up / New Logs Floating Button */}
        {isScrolledUp && viewMode !== 'hex' && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-full text-xs font-sans font-medium flex items-center gap-1.5 shadow-lg shadow-cyan-950/50 animate-bounce z-20"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Scroll to latest logs</span>
          </button>
        )}

        {/* Pause Banner */}
        {isPaused && (
          <div className="absolute top-2 right-4 bg-amber-950/90 border border-amber-700 text-amber-200 px-2.5 py-0.5 rounded text-[11px] font-sans font-medium z-20 shadow-md">
            Stream Paused
          </div>
        )}
      </div>
    </div>
  );
};

// Component to render individual log lines with ANSI escape sequences & colors
const LogLineRenderer: React.FC<{
  entry: LogEntry;
  showTimestamps: boolean;
  showDirection: boolean;
}> = React.memo(({ entry, showTimestamps, showDirection }) => {
  const segments = useMemo(() => parseAnsi(entry.text), [entry.text]);

  const levelColorClass =
    entry.level === 'ERROR'
      ? 'bg-rose-950/60 text-rose-400 border-rose-800/80'
      : entry.level === 'WARN'
      ? 'bg-amber-950/60 text-amber-400 border-amber-800/80'
      : entry.level === 'DEBUG'
      ? 'bg-slate-900 text-slate-400 border-slate-800'
      : entry.level === 'COMMAND'
      ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/80'
      : 'text-slate-400';

  const timeFormatted = useMemo(() => {
    const d = new Date(entry.timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  }, [entry.timestamp]);

  return (
    <div
      className={`flex items-start gap-2 hover:bg-slate-900/40 px-1 py-0.2 rounded transition-colors ${
        entry.direction === 'TX' ? 'bg-cyan-950/15' : ''
      }`}
    >
      {/* Timestamp */}
      {showTimestamps && (
        <span className="text-slate-600 text-[11px] select-none font-mono shrink-0">
          [{timeFormatted}]
        </span>
      )}

      {/* Direction & Level Tag */}
      {showDirection && (
        <span
          className={`text-[10px] font-mono px-1 py-0 rounded border select-none shrink-0 ${
            entry.direction === 'TX'
              ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
              : 'bg-slate-900 text-slate-500 border-slate-800'
          }`}
        >
          {entry.direction}
        </span>
      )}

      {/* Level Tag (if special) */}
      {(entry.level === 'ERROR' || entry.level === 'WARN' || entry.level === 'COMMAND') && (
        <span className={`text-[10px] font-mono px-1 py-0 rounded border select-none shrink-0 font-semibold ${levelColorClass}`}>
          {entry.level}
        </span>
      )}

      {/* Log text segments with ANSI styles */}
      <span className="flex-1 whitespace-pre-wrap break-all text-slate-200">
        {segments.map((seg, i) => (
          <span
            key={i}
            style={{
              color: seg.color,
              fontWeight: seg.bold ? 600 : undefined,
              opacity: seg.dim ? 0.7 : undefined,
            }}
          >
            {seg.text}
          </span>
        ))}
      </span>
    </div>
  );
});

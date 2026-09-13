import React, { useEffect, useRef, useState } from 'react';
import {
  Binary,
  CornerDownLeft,
  History,
  Plus,
  Send,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { CommandMacro, LineEnding } from '../types';
import { parseHexInput } from '../utils/hexFormatter';

interface CommandInputBarProps {
  onSendCommand: (command: string, isHex: boolean, lineEnding: LineEnding) => void;
  macros: CommandMacro[];
  onTriggerMacro: (macro: CommandMacro) => void;
  onOpenMacroManager: () => void;
  disabled?: boolean;
}

export const CommandInputBar: React.FC<CommandInputBarProps> = ({
  onSendCommand,
  macros,
  onTriggerMacro,
  onOpenMacroManager,
  disabled = false,
}) => {
  const [input, setInput] = useState('');
  const [isHexMode, setIsHexMode] = useState(false);
  const [lineEnding, setLineEnding] = useState<LineEnding>('CRLF');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut handler for Alt+1..Alt+8 macro injection and Ctrl+K focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus command bar on Ctrl+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Alt+1..9 macro triggers
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= macros.length) {
          e.preventDefault();
          const targetMacro = macros[num - 1];
          if (targetMacro) {
            onTriggerMacro(targetMacro);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [macros, onTriggerMacro]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    onSendCommand(input, isHexMode, lineEnding);

    // Update history
    setHistory(prev => [...prev.slice(-49), input]);
    setHistoryIndex(-1);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx] || '');
      }
    }
  };

  // Mobile virtual key injection
  const injectVirtualKey = (text: string, isHex = false) => {
    if (text === 'CTRL_C') {
      onSendCommand('\x03', false, 'NONE');
    } else if (text === 'ESC') {
      onSendCommand('\x1b', false, 'NONE');
    } else if (text === 'TAB') {
      onSendCommand('\t', false, 'NONE');
    } else {
      onSendCommand(text, isHex, lineEnding);
    }
  };

  return (
    <div className="bg-slate-900 border-t border-slate-800 p-2.5 space-y-2 select-none font-sans">
      {/* Quick Command Injection Macros Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono shrink-0 mr-1">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="hidden sm:inline">Macros:</span>
        </div>

        {macros.slice(0, 8).map((macro, idx) => (
          <button
            key={macro.id}
            type="button"
            onClick={() => onTriggerMacro(macro)}
            disabled={disabled}
            className="group flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 hover:border-slate-600 transition shrink-0 disabled:opacity-50"
            title={`${macro.name}: "${macro.command}" (${macro.shortcut || `Alt+${idx + 1}`})`}
          >
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-900 text-cyan-400 border border-slate-700">
              Alt+{idx + 1}
            </span>
            <span className="font-medium text-slate-200">{macro.name}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={onOpenMacroManager}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs border border-dashed border-slate-700 transition shrink-0"
          title="Configure Quick Macros"
        >
          <Plus className="w-3 h-3" />
          <span className="text-[11px]">Edit Macros</span>
        </button>
      </div>

      {/* Main Command Input Box & Protocol Controls */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Hex Mode Toggle */}
        <button
          type="button"
          onClick={() => setIsHexMode(!isHexMode)}
          className={`flex items-center gap-1 px-2.5 py-2 rounded text-xs font-mono transition border ${
            isHexMode
              ? 'bg-amber-950/70 text-amber-300 border-amber-700'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Toggle Raw Hex injection (e.g. 0xAA 0x55 or DEADBEEF)"
        >
          <Binary className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isHexMode ? 'HEX' : 'ASCII'}</span>
        </button>

        {/* Input Text Field */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isHexMode
                ? 'Enter hex bytes (e.g. "AA 55 01 FE" or "0xAA, 0x55")...'
                : 'Enter serial command (e.g. "help", "version", "wifi_scan")... [Ctrl+K]'
            }
            className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-md px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono disabled:opacity-50"
          />
        </div>

        {/* Line Ending Selector */}
        {!isHexMode && (
          <select
            value={lineEnding}
            onChange={e => setLineEnding(e.target.value as LineEnding)}
            className="bg-slate-800 text-slate-300 border border-slate-700 rounded px-2 py-2 text-xs font-mono focus:ring-1 focus:ring-cyan-500 hidden sm:block"
            title="Line Termination protocol appended to command"
          >
            <option value="CRLF">CR+LF (\r\n)</option>
            <option value="LF">LF (\n)</option>
            <option value="CR">CR (\r)</option>
            <option value="NONE">None</option>
          </select>
        )}

        {/* Send Button */}
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs sm:text-sm font-medium transition shadow disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send Command (Enter)"
        >
          <span>Send</span>
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Mobile Convenience Touch Keys */}
      <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-800/60">
        <span className="text-[10px] text-slate-500 font-mono">Mobile:</span>
        <button
          type="button"
          onClick={() => injectVirtualKey('ESC')}
          className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs font-mono"
        >
          ESC
        </button>
        <button
          type="button"
          onClick={() => injectVirtualKey('TAB')}
          className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs font-mono"
        >
          TAB
        </button>
        <button
          type="button"
          onClick={() => injectVirtualKey('CTRL_C')}
          className="px-2 py-1 rounded bg-rose-950/70 text-rose-300 text-xs font-mono border border-rose-800"
        >
          Ctrl+C
        </button>
        <button
          type="button"
          onClick={() => {
            if (history.length > 0) {
              const prev = history[history.length - 1];
              setInput(prev);
            }
          }}
          className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs font-mono"
        >
          Hist ↑
        </button>
      </div>
    </div>
  );
};

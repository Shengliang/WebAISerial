import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Trash2,
  HelpCircle,
  Cpu,
  Layers,
  Sparkles,
  ChevronRight,
  Database,
  ArrowRight
} from 'lucide-react';
import { uboot, UBootOutputLine } from '../utils/armSimulator/ubootEngine';

interface UBootConsoleProps {
  currentCSource: string;
  onCodeCompile?: () => void;
  onStateChange?: () => void;
}

export const UBootConsole: React.FC<UBootConsoleProps> = ({
  currentCSource,
  onCodeCompile,
  onStateChange,
}) => {
  const [lines, setLines] = useState<UBootOutputLine[]>(() => {
    const banner = uboot.getBootBanner();
    return banner.map((text, idx) => ({
      id: `boot-${idx}`,
      type: idx === 0 ? 'banner' : text.startsWith('Model:') || text.startsWith('Hit') ? 'info' : 'output',
      text,
    }));
  });

  const [inputVal, setInputVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState('');
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal on new lines
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // Focus input when clicking anywhere inside terminal box
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const executeCommand = (cmdStr: string) => {
    const trimmed = cmdStr.trim();
    if (!trimmed) return;

    // Special client-side command: clear / cls
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      setLines([]);
      setInputVal('');
      setHistoryIndex(-1);
      return;
    }

    // Add user input line to output
    const userLine: UBootOutputLine = {
      id: `in-${Date.now()}-${Math.random()}`,
      type: 'input',
      text: `=> ${trimmed}`,
    };

    // Execute through UBootEngine
    const rawOutputs = uboot.executeCommandLine(trimmed, currentCSource);
    const newOutputLines: UBootOutputLine[] = rawOutputs.map((item, idx) => ({
      id: `out-${Date.now()}-${idx}`,
      type: item.type,
      text: item.text,
    }));

    setLines(prev => [...prev, userLine, ...newOutputLines]);
    setInputVal('');
    setHistoryIndex(-1);

    if (trimmed.startsWith('compile') && onCodeCompile) {
      onCodeCompile();
    }
    if (onStateChange) {
      onStateChange();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const history = uboot.getHistory();

    if (e.key === 'Enter') {
      executeCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;

      if (historyIndex === -1) {
        setTempInput(inputVal);
        const newIdx = history.length - 1;
        setHistoryIndex(newIdx);
        setInputVal(history[newIdx]);
      } else if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInputVal(history[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;

      if (historyIndex < history.length - 1) {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setInputVal(history[newIdx]);
      } else {
        setHistoryIndex(-1);
        setInputVal(tempInput);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Auto-complete basic commands
      const commonCommands = ['help', 'symbols', 'compile', 'go add 15 27', 'md.l 0x20000000 4', 'mw.l 0x20000000 0x', 'bdinfo', 'version', 'reset', 'clear', 'demo'];
      const match = commonCommands.find(c => c.startsWith(inputVal.toLowerCase().trim()));
      if (match) {
        setInputVal(match);
      }
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setLines([]);
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      setLines(prev => [...prev, { id: `ctrlc-${Date.now()}`, type: 'input', text: `=> ${inputVal}^C` }]);
      setInputVal('');
      setHistoryIndex(-1);
    }
  };

  const quickChips = [
    { label: 'demo', cmd: 'demo', icon: Sparkles, color: 'text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20' },
    { label: 'compile', cmd: 'compile', icon: Cpu, color: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20' },
    { label: 'symbols', cmd: 'symbols', icon: Layers, color: 'text-indigo-300 border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20' },
    { label: 'go add 15 27', cmd: 'go add 15 27', icon: Play, color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20' },
    { label: 'call add 40 2', cmd: 'call add 40 2', icon: ArrowRight, color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20' },
    { label: 'md.l 0x20000000 4', cmd: 'md.l 0x20000000 4', icon: Database, color: 'text-sky-300 border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20' },
    { label: 'mw.l 0x20000000 0xDEADBEEF', cmd: 'mw.l 0x20000000 0xDEADBEEF', icon: Database, color: 'text-purple-300 border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20' },
    { label: 'bdinfo', cmd: 'bdinfo', icon: TerminalIcon, color: 'text-slate-300 border-slate-700 bg-slate-800/80 hover:bg-slate-800' },
    { label: 'reset', cmd: 'reset', icon: RotateCcw, color: 'text-rose-300 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-lg border border-slate-800 overflow-hidden shadow-2xl font-mono text-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800 select-none">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="h-3.5 w-px bg-slate-800 mx-1" />
          <TerminalIcon className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-slate-200 tracking-wide text-xs">
            Das U-Boot 2026.04 (ARMv7-M CLI)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
            Interactive Prompt
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowCheatSheet(!showCheatSheet)}
            className={`px-2 py-1 rounded text-[11px] font-sans flex items-center space-x-1 transition-colors ${
              showCheatSheet ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle U-Boot Command Reference"
          >
            <HelpCircle className="w-3 h-3" />
            <span>Command Guide</span>
          </button>

          <button
            onClick={() => setLines([])}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Clear Console (Ctrl+L)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 overflow-x-auto scrollbar-thin">
        <span className="text-[10px] uppercase font-sans tracking-wider text-slate-400 mr-1 flex items-center shrink-0">
          Quick:
        </span>
        {quickChips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => executeCommand(chip.cmd)}
            className={`px-2 py-0.5 rounded text-[11px] border flex items-center space-x-1 transition-all shrink-0 active:scale-95 ${chip.color}`}
          >
            <chip.icon className="w-2.5 h-2.5" />
            <span>{chip.label}</span>
          </button>
        ))}
      </div>

      {/* Collapsible Reference / Cheat Sheet */}
      {showCheatSheet && (
        <div className="bg-slate-900/95 border-b border-slate-800 p-3 text-[11px] text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-2 animate-in fade-in duration-150 font-sans">
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="font-semibold text-amber-300 block mb-1">
              🚀 Calling C Functions from U-Boot:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-300 font-mono text-[10px]">
              <li>
                <span className="text-cyan-300">compile</span> - Compiles C editor code & updates symbols
              </li>
              <li>
                <span className="text-cyan-300">symbols</span> - Shows function addresses in Flash (0x08000008...)
              </li>
              <li>
                <span className="text-cyan-300">go add 15 27</span> - Runs add(15, 27) with AAPCS (R0=15, R1=27)
              </li>
              <li>
                <span className="text-cyan-300">call add 40 2</span> - Returns 42 directly in R0
              </li>
              <li>
                <span className="text-cyan-300">go 0x08000008 100 250</span> - Jump directly to hex address
              </li>
            </ul>
          </div>
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80">
            <span className="font-semibold text-emerald-300 block mb-1">
              💾 Memory Read & Write Commands:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-300 font-mono text-[10px]">
              <li>
                <span className="text-cyan-300">md.l 0x20000000 4</span> - Display 4 32-bit words from SRAM
              </li>
              <li>
                <span className="text-cyan-300">md.b 0x20000000 16</span> - Byte dump with ASCII characters
              </li>
              <li>
                <span className="text-cyan-300">mw.l 0x20000000 0x12345678</span> - Write 32-bit word
              </li>
              <li>
                <span className="text-cyan-300">cp.l 0x20000000 0x20000010 4</span> - Copy memory block
              </li>
              <li>
                <span className="text-cyan-300">bdinfo</span> - Hardware memory map & CPU frequency
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Terminal Output Area */}
      <div
        onClick={handleTerminalClick}
        className="flex-1 p-3 overflow-y-auto space-y-1 select-text cursor-text font-mono leading-relaxed"
      >
        {lines.map(line => {
          if (line.type === 'input') {
            return (
              <div key={line.id} className="text-amber-400 font-semibold flex items-start space-x-1">
                <span>{line.text}</span>
              </div>
            );
          }
          if (line.type === 'banner') {
            return (
              <div key={line.id} className="text-cyan-300 font-bold tracking-wide">
                {line.text.replace(/\x1b\[[0-9;]*m/g, '')}
              </div>
            );
          }
          if (line.type === 'error') {
            return (
              <div key={line.id} className="text-rose-400 font-medium">
                {line.text}
              </div>
            );
          }
          if (line.type === 'success') {
            return (
              <div key={line.id} className="text-emerald-400 font-medium">
                {line.text}
              </div>
            );
          }
          if (line.type === 'info') {
            return (
              <div key={line.id} className="text-sky-300">
                {line.text.replace(/\x1b\[[0-9;]*m/g, '')}
              </div>
            );
          }
          return (
            <div key={line.id} className="text-slate-300 whitespace-pre">
              {line.text}
            </div>
          );
        })}
        <div ref={terminalEndRef} />
      </div>

      {/* Input Line (=> prompt) */}
      <div className="flex items-center px-3 py-2 bg-slate-900 border-t border-slate-800">
        <span className="text-amber-400 font-bold mr-1.5 select-none text-xs">
          =&gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type 'help', 'compile', 'symbols', 'go add 15 27', 'md 0x20000000 4'..."
          className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none placeholder-slate-600"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={() => executeCommand(inputVal)}
          disabled={!inputVal.trim()}
          className="ml-2 px-2 py-1 bg-amber-600/80 hover:bg-amber-500 disabled:opacity-30 text-white rounded text-[11px] font-sans flex items-center space-x-1 transition-all"
        >
          <span>Run</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

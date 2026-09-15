import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Binary,
  CheckCircle2,
  Code2,
  Cpu,
  Layers,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Terminal,
  X,
  Zap,
  ArrowRight,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { ArmBoardVisualizer } from './ArmBoardVisualizer';
import { ArmDatapathView } from './ArmDatapathView';
import { UBootConsole } from './UBootConsole';
import { armSimulator } from '../utils/armSimulator/armCpu';
import { uboot } from '../utils/armSimulator/ubootEngine';
import {
  CompilationResult,
  CompilerDiagnostic,
  DatapathStage,
  GpioState,
  UsartState,
} from '../utils/armSimulator/armTypes';
import { compileCSource } from '../utils/armSimulator/cCompiler';
import { SAMPLE_C_PROGRAMS } from '../utils/armSimulator/samplePrograms';

interface ArmSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForwardSerialLog?: (text: string, rawBytes?: number[]) => void;
}

export const ArmSimulatorModal: React.FC<ArmSimulatorModalProps> = ({
  isOpen,
  onClose,
  onForwardSerialLog,
}) => {
  // Selected C program & source code
  const [selectedProgramId, setSelectedProgramId] = useState<string>(SAMPLE_C_PROGRAMS[0].id);
  const [cCode, setCCode] = useState<string>(SAMPLE_C_PROGRAMS[0].code);

  // Editor view tab: 'c_code' | 'disassembly' | 'build_log'
  const [editorTab, setEditorTab] = useState<'c_code' | 'disassembly' | 'build_log'>('c_code');

  // Right pane interactive view: 'uboot' | 'datapath' | 'serial'
  const [rightPaneTab, setRightPaneTab] = useState<'uboot' | 'datapath' | 'serial'>('uboot');

  // Compilation state
  const [compilation, setCompilation] = useState<CompilationResult>(() => compileCSource(SAMPLE_C_PROGRAMS[0].code));
  const [compileError, setCompileError] = useState<string | null>(null);
  const [selectedErrorLine, setSelectedErrorLine] = useState<number | null>(null);

  // Simulator runtime state
  const [cpuStatus, setCpuStatus] = useState<string>(armSimulator.state);
  const [registers, setRegisters] = useState(armSimulator.registers);
  const [prevRegisters, setPrevRegisters] = useState(armSimulator.prevRegisters);
  const [lastStage, setLastStage] = useState<DatapathStage | null>(armSimulator.lastDatapathStage);
  const [gpio, setGpio] = useState<GpioState>(armSimulator.gpioC);
  const [usart, setUsart] = useState<UsartState>(armSimulator.usart1);
  const [busTransactions, setBusTransactions] = useState(armSimulator.busTransactions);
  const [cycleCount, setCycleCount] = useState(armSimulator.cycleCount);
  const [clockSpeedHz, setClockSpeedHz] = useState<number>(1000);

  // Simulator serial text output buffer
  const [serialOutput, setSerialOutput] = useState<string>('');
  const serialOutputRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Split code into lines for line-number gutter
  const codeLines = useMemo(() => cCode.split('\n'), [cCode]);

  // Map of line numbers that contain errors
  const lineErrorsMap = useMemo(() => {
    const map = new Map<number, CompilerDiagnostic[]>();
    for (const err of compilation.errors) {
      const existing = map.get(err.line) || [];
      existing.push(err);
      map.set(err.line, existing);
    }
    return map;
  }, [compilation.errors]);

  // Setup callbacks when modal opens
  useEffect(() => {
    if (!isOpen) {
      armSimulator.pause();
      return;
    }

    // Initial compile and flash
    const result = compileCSource(cCode);
    setCompilation(result);
    if (result.success && result.binary.length > 0) {
      armSimulator.flashBinary(result.binary);
      setRegisters({ ...armSimulator.registers });
      setPrevRegisters({ ...armSimulator.prevRegisters });
      setGpio({ ...armSimulator.gpioC });
      setUsart({ ...armSimulator.usart1 });
      setCpuStatus(armSimulator.state);
    }

    armSimulator.setCallbacks({
      onSerialTx: (char, rawByte) => {
        setSerialOutput(prev => (prev + char).slice(-4000));
        setUsart({ ...armSimulator.usart1 });
        if (onForwardSerialLog) {
          onForwardSerialLog(char, [rawByte]);
        }
      },
      onGpioChange: newGpio => {
        setGpio({ ...newGpio });
      },
      onDatapathUpdate: stage => {
        setLastStage({ ...stage });
        setRegisters({ ...armSimulator.registers });
        setPrevRegisters({ ...armSimulator.prevRegisters });
        setBusTransactions([...armSimulator.busTransactions]);
        setCycleCount(armSimulator.cycleCount);
      },
    });

    return () => {
      armSimulator.pause();
    };
  }, [isOpen]);

  // Auto-scroll serial output
  useEffect(() => {
    if (serialOutputRef.current) {
      serialOutputRef.current.scrollTop = serialOutputRef.current.scrollHeight;
    }
  }, [serialOutput]);

  // Jump to specific line in the code editor
  const handleJumpToLine = (lineNum: number) => {
    setSelectedErrorLine(lineNum);
    setEditorTab('c_code');

    setTimeout(() => {
      if (textareaRef.current) {
        const lines = cCode.split('\n');
        let charIndex = 0;
        for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
          charIndex += lines[i].length + 1;
        }
        const lineLen = lines[lineNum - 1]?.length || 0;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(charIndex, charIndex + lineLen);

        // Approximate scroll
        const lineHeight = 20;
        textareaRef.current.scrollTop = Math.max(0, (lineNum - 5) * lineHeight);
      }
    }, 50);
  };

  // Handle program template selection
  const handleSelectProgram = (progId: string) => {
    const prog = SAMPLE_C_PROGRAMS.find(p => p.id === progId);
    if (!prog) return;
    setSelectedProgramId(progId);
    setCCode(prog.code);
    setSelectedErrorLine(null);
    handleCompileAndFlash(prog.code);
    if (progId === 'uboot_c_function_add' || progId === 'uboot_c_math_suite') {
      setRightPaneTab('uboot');
    }
  };

  // Compile & Flash binary into simulated Flash memory
  const handleCompileAndFlash = (source = cCode) => {
    armSimulator.pause();
    const result = compileCSource(source);
    setCompilation(result);

    if (!result.success || result.errors.length > 0) {
      setCompileError(result.errors[0]?.message || 'Compilation error');
      // If there are errors, automatically show the build log or error banner
      setSelectedErrorLine(result.errors[0]?.line || null);
      setEditorTab('build_log');
      return;
    }

    setCompileError(null);
    setSelectedErrorLine(null);
    armSimulator.flashBinary(result.binary);
    uboot.updateSymbols(result.symbols);
    uboot.latestDisassembly = result.disassembly;
    setSerialOutput('');
    setRegisters({ ...armSimulator.registers });
    setPrevRegisters({ ...armSimulator.prevRegisters });
    setGpio({ ...armSimulator.gpioC });
    setUsart({ ...armSimulator.usart1 });
    setCycleCount(0);
    setCpuStatus('HALTED');
    setLastStage(null);
  };

  const handleSimulatorSync = () => {
    setRegisters({ ...armSimulator.registers });
    setPrevRegisters({ ...armSimulator.prevRegisters });
    setGpio({ ...armSimulator.gpioC });
    setUsart({ ...armSimulator.usart1 });
    if (armSimulator.lastDatapathStage) {
      setLastStage({ ...armSimulator.lastDatapathStage });
    }
    setBusTransactions([...armSimulator.busTransactions]);
    setCycleCount(armSimulator.cycleCount);
    setCpuStatus(armSimulator.state);
  };

  // Simulation controls
  const handleToggleRun = () => {
    if (!compilation.success) {
      setEditorTab('build_log');
      return;
    }

    if (armSimulator.isRunning()) {
      armSimulator.pause();
      setCpuStatus('HALTED');
    } else {
      armSimulator.run(clockSpeedHz);
      setCpuStatus('RUNNING');
    }
  };

  const handleStep = () => {
    if (!compilation.success) {
      setEditorTab('build_log');
      return;
    }

    armSimulator.pause();
    const stage = armSimulator.step();
    setLastStage(stage);
    setRegisters({ ...armSimulator.registers });
    setPrevRegisters({ ...armSimulator.prevRegisters });
    setGpio({ ...armSimulator.gpioC });
    setUsart({ ...armSimulator.usart1 });
    setCycleCount(armSimulator.cycleCount);
    setCpuStatus('STEPPING');
  };

  const handleReset = () => {
    armSimulator.reset();
    setSerialOutput('');
    setRegisters({ ...armSimulator.registers });
    setPrevRegisters({ ...armSimulator.prevRegisters });
    setGpio({ ...armSimulator.gpioC });
    setUsart({ ...armSimulator.usart1 });
    setCycleCount(0);
    setCpuStatus('HALTED');
    setLastStage(null);
  };

  const handleSpeedChange = (speed: number) => {
    setClockSpeedHz(speed);
    armSimulator.setClockSpeed(speed);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fadeIn font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Studio Header */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-slate-100">
                  ARM Cortex CPU Simulator & C IDE
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold">
                  No Hardware Required
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Write C, compile directly in-browser to ARM Thumb machine code, and observe live datapath & serial output
              </p>
            </div>
          </div>

          {/* Program Template Selector & Close Button */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-400 text-[11px] font-medium">Demo:</span>
              <select
                value={selectedProgramId}
                onChange={e => handleSelectProgram(e.target.value)}
                className="bg-transparent text-cyan-300 font-medium focus:outline-none cursor-pointer"
              >
                {SAMPLE_C_PROGRAMS.map(prog => (
                  <option key={prog.id} value={prog.id} className="bg-slate-900 text-slate-100">
                    {prog.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close Simulator"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Central Workspace: Left (C Editor & Disassembly) | Right (Datapath & Board) */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* ================= LEFT PANE: C Code Editor, Disassembly & Compiler Output ================= */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60">
            {/* Editor Toolbar */}
            <div className="px-4 py-2.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 bg-slate-950">
              <div className="flex items-center gap-1.5">
                {/* C Source Code Tab */}
                <button
                  onClick={() => setEditorTab('c_code')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    editorTab === 'c_code'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>C Source Code</span>
                </button>

                {/* Disassembly Tab */}
                <button
                  onClick={() => setEditorTab('disassembly')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    editorTab === 'disassembly'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Binary className="w-3.5 h-3.5" />
                  <span>Thumb Disassembly</span>
                </button>

                {/* Build Output & Diagnostics Tab */}
                <button
                  onClick={() => setEditorTab('build_log')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    editorTab === 'build_log'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Build Output</span>
                  {compilation.errors.length > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[10px] shadow-sm animate-pulse">
                      {compilation.errors.length} {compilation.errors.length === 1 ? 'error' : 'errors'}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-semibold">
                      OK
                    </span>
                  )}
                </button>
              </div>

              {/* Compile & Flash Button */}
              <button
                onClick={() => handleCompileAndFlash()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium text-xs shadow-md transition"
                title="Compile C code and flash into simulated Cortex-M core"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Compile & Flash to Core</span>
              </button>
            </div>

            {/* Editor Body */}
            <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col">
              {/* If there are compilation errors and we are on c_code tab, show banner */}
              {compilation.errors.length > 0 && editorTab === 'c_code' && (
                <div className="mb-2.5 px-3 py-2 bg-rose-500/15 border border-rose-500/40 rounded-lg flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="truncate">
                      <strong>Compilation Failed:</strong> {compilation.errors.length} error{compilation.errors.length > 1 ? 's' : ''} detected.
                      <span className="hidden sm:inline text-rose-200/90 ml-1.5 font-mono">
                        {compilation.errors[0]?.message} (line {compilation.errors[0]?.line})
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => setEditorTab('build_log')}
                    className="shrink-0 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition shadow-sm"
                  >
                    View Diagnostics ({compilation.errors.length})
                  </button>
                </div>
              )}

              {/* TAB 1: C Code Editor with Line Gutter & Error Indicators */}
              {editorTab === 'c_code' && (
                <div className="flex-1 flex min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
                  {/* Line Number Gutter */}
                  <div className="w-12 bg-slate-950/80 border-r border-slate-800 py-3 select-none flex flex-col text-right font-mono text-[11px] text-slate-500">
                    {codeLines.map((_, idx) => {
                      const lineNum = idx + 1;
                      const hasError = lineErrorsMap.has(lineNum);
                      const isHighlighted = selectedErrorLine === lineNum;
                      return (
                        <div
                          key={idx}
                          className={`h-5 pr-2.5 flex items-center justify-end gap-1 ${
                            hasError
                              ? 'bg-rose-950/60 text-rose-400 font-bold'
                              : isHighlighted
                              ? 'bg-cyan-950/60 text-cyan-300 font-bold'
                              : 'hover:text-slate-300'
                          }`}
                          title={hasError ? lineErrorsMap.get(lineNum)?.map(e => e.message).join('\n') : undefined}
                        >
                          {hasError && (
                            <span className="text-rose-500 text-[9px] font-bold">✕</span>
                          )}
                          <span>{lineNum}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Code Text Area */}
                  <textarea
                    ref={textareaRef}
                    value={cCode}
                    onChange={e => {
                      setCCode(e.target.value);
                      if (selectedErrorLine !== null) setSelectedErrorLine(null);
                    }}
                    spellCheck={false}
                    className="w-full flex-1 p-3 bg-transparent font-mono text-xs text-slate-200 leading-5 resize-none focus:outline-none selection:bg-cyan-500/30 selection:text-cyan-200 overflow-y-auto"
                    placeholder="Write C code here..."
                  />
                </div>
              )}

              {/* TAB 2: Thumb Disassembly View */}
              {editorTab === 'disassembly' && (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 rounded-lg p-2.5 overflow-y-auto font-mono text-xs">
                  {compilation.errors.length > 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
                      <h4 className="text-sm font-semibold text-slate-200">No Disassembly Generated</h4>
                      <p className="text-xs text-slate-400 max-w-sm mt-1">
                        The C compiler halted due to {compilation.errors.length} syntax error{compilation.errors.length > 1 ? 's' : ''}.
                        Resolve the errors in C Source Code and click Compile.
                      </p>
                      <button
                        onClick={() => setEditorTab('build_log')}
                        className="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow transition"
                      >
                        Inspect Compiler Errors
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-400 pb-2 mb-2 border-b border-slate-800 flex items-center justify-between">
                        <span>ADDRESS    OPCODE   MNEMONIC  OPERANDS</span>
                        <span className="text-cyan-400">Total: {compilation.disassembly.length} lines</span>
                      </div>
                      <div className="space-y-1">
                        {compilation.disassembly.map((line, idx) => {
                          const isCurrentPc = line.address === registers.pc;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center justify-between px-2 py-0.5 rounded transition ${
                                isCurrentPc
                                  ? 'bg-cyan-950 border border-cyan-400 text-cyan-200 font-bold shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <span className="whitespace-pre">{line.rawText}</span>
                              {isCurrentPc && (
                                <span className="text-[10px] text-cyan-400 font-bold animate-pulse">
                                  ◄ PC
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: Build Output & Diagnostics Terminal */}
              {editorTab === 'build_log' && (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 rounded-lg p-3 overflow-y-auto font-mono text-xs space-y-4">
                  {/* Header Status */}
                  <div className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    compilation.success
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      {compilation.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {compilation.success ? 'Build Succeeded' : 'Build Failed'}
                        </div>
                        <div className="text-[11px] opacity-80">
                          {compilation.success
                            ? `Binary image created (${compilation.flashSize} bytes flash, ${compilation.ramSize} bytes SRAM). Core is ready.`
                            : `${compilation.errors.length} syntax error(s) found during compilation.`}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCompileAndFlash()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-sans font-medium transition"
                    >
                      Recompile
                    </button>
                  </div>

                  {/* List of Detected Errors with Jump to Line buttons */}
                  {compilation.errors.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
                        Compiler Diagnostics & Diagnostics List ({compilation.errors.length})
                      </div>
                      {compilation.errors.map((err, idx) => (
                        <div
                          key={idx}
                          className="bg-rose-950/30 border border-rose-800/60 rounded-lg p-3 hover:border-rose-600 transition"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-[11px]">
                                ERROR
                              </span>
                              <span className="text-cyan-300 font-bold">
                                main.c:{err.line}:{err.column || 1}
                              </span>
                            </div>
                            <button
                              onClick={() => handleJumpToLine(err.line)}
                              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-200 font-sans font-medium hover:underline"
                            >
                              <span>Jump to Line {err.line}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-rose-200 font-semibold mb-2">
                            {err.message}
                          </div>
                          {err.sourceSnippet && (
                            <div className="bg-slate-950 p-2 rounded border border-slate-800 text-[11px] text-slate-300">
                              <div className="text-slate-500">{err.line} | {err.sourceSnippet}</div>
                              <div className="text-rose-400 font-bold">
                                {' '.repeat(Math.max(0, err.line.toString().length + 3 + (err.column || 1) - 1))}^
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Raw GCC Command Output */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                      <span>arm-none-eabi-gcc Build Output</span>
                    </div>
                    <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {compilation.buildLog || (compilation.success ? 'Compilation successful.' : 'Compilation failed.')}
                    </pre>
                  </div>
                </div>
              )}

              {/* Compilation Status & Metrics Footer */}
              <div className={`mt-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
                compilation.success
                  ? 'bg-slate-900/90 border-slate-800'
                  : 'bg-rose-950/40 border-rose-800/80'
              }`}>
                <div className="flex items-center gap-2">
                  {compilation.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                  )}
                  {compilation.success ? (
                    <>
                      <span className="text-emerald-300 font-semibold">Build OK</span>
                      <span className="text-slate-500">|</span>
                      <span className="text-slate-300">
                        Flash: <strong className="text-cyan-300">{compilation.flashSize}</strong> / 131,072 B ({((compilation.flashSize / 131072) * 100).toFixed(1)}%)
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-slate-300">
                        SRAM: <strong className="text-emerald-300">{compilation.ramSize}</strong> / 20,480 B
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-300 font-semibold">
                      Build Failed: {compilation.errors.length} error{compilation.errors.length > 1 ? 's' : ''} detected
                    </span>
                  )}
                </div>

                {compilation.errors.length > 0 ? (
                  <button
                    onClick={() => setEditorTab('build_log')}
                    className="text-rose-300 hover:text-white font-semibold underline text-xs cursor-pointer"
                  >
                    View Errors ({compilation.errors.length})
                  </button>
                ) : compileError ? (
                  <span className="text-rose-400 truncate max-w-xs">{compileError}</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* ================= RIGHT PANE: U-Boot CLI & Datapath/Board Visualizer ================= */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40 p-4 overflow-y-auto space-y-4">
            {/* View Mode Tabs: U-Boot CLI Prompt vs Hardware Datapath */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex items-center justify-between gap-2 shadow-md">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightPaneTab('uboot')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    rightPaneTab === 'uboot'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Das U-Boot CLI Console</span>
                  <span className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500/30 text-amber-200 font-mono font-bold">
                    C RUNNER & MEMORY
                  </span>
                </button>

                <button
                  onClick={() => setRightPaneTab('datapath')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    rightPaneTab === 'datapath'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Hardware & Datapath Pipeline</span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400 pr-2">
                <span className="text-amber-400 font-semibold">AAPCS:</span>
                <span>R0=Arg1, R1=Arg2, R0=Return</span>
              </div>
            </div>

            {rightPaneTab === 'uboot' ? (
              <div className="flex-1 flex flex-col min-h-[540px] space-y-3">
                <div className="flex-1 min-h-[460px]">
                  <UBootConsole
                    currentCSource={cCode}
                    onCodeCompile={() => handleCompileAndFlash()}
                    onStateChange={handleSimulatorSync}
                  />
                </div>

                {/* Compact hardware telemetry ticker */}
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">Core PC:</span>
                    <span className="text-cyan-400 font-bold">
                      0x{registers.pc.toString(16).padStart(8, '0')}
                    </span>
                    <span className="text-slate-400 ml-2">SP:</span>
                    <span className="text-purple-400 font-bold">
                      0x{registers.sp.toString(16).padStart(8, '0')}
                    </span>
                    <span className="text-slate-400 ml-2">R0 (Return):</span>
                    <span className="text-emerald-400 font-bold">
                      0x{registers.r0.toString(16).padStart(8, '0')} ({registers.r0 > 0x7fffffff ? registers.r0 - 0x100000000 : registers.r0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">PC13 LED:</span>
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        gpio.pins[13] ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-700'
                      }`}
                    />
                    <span className="text-slate-300 font-sans text-[11px]">
                      {gpio.pins[13] ? 'HIGH (OFF)' : 'LOW (ON)'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Simulation Execution Controls */}
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2">
                    {/* Run / Pause Button */}
                    <button
                      onClick={handleToggleRun}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition shadow ${
                        !compilation.success
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-75'
                          : armSimulator.isRunning()
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                      title={!compilation.success ? 'Fix compile errors before running' : undefined}
                    >
                      {armSimulator.isRunning() ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pause CPU</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run CPU</span>
                        </>
                      )}
                    </button>

                    {/* Single Step Button (F10) */}
                    <button
                      onClick={handleStep}
                      disabled={!compilation.success}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
                        !compilation.success
                          ? 'bg-slate-800 text-slate-500 border-slate-800 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      }`}
                      title={!compilation.success ? 'Fix compile errors before stepping' : 'Execute Single Instruction'}
                    >
                      <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Step (1 Inst)</span>
                    </button>

                    {/* Reset Button */}
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-xs font-mono transition"
                      title="Reset CPU Registers & Memory"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Speed Preset Selector */}
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400">Clock Rate:</span>
                    <select
                      value={clockSpeedHz}
                      onChange={e => handleSpeedChange(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-cyan-300 font-bold focus:outline-none"
                    >
                      <option value={1}>1 Hz (Step by Step)</option>
                      <option value={10}>10 Hz (Slow)</option>
                      <option value={100}>100 Hz</option>
                      <option value={1000}>1 kHz (Standard)</option>
                      <option value={10000}>10 kHz (Fast)</option>
                      <option value={50000}>50 kHz (Turbo)</option>
                    </select>
                  </div>
                </div>

                {/* Physical Board Component with Glowing PC13 LED */}
                <ArmBoardVisualizer
                  gpio={gpio}
                  usart={usart}
                  onResetCpu={handleReset}
                  cpuStatus={cpuStatus}
                  cycleCount={cycleCount}
                />

                {/* Complete Datapath Demo Visualizer */}
                <ArmDatapathView
                  stage={lastStage}
                  registers={registers}
                  prevRegisters={prevRegisters}
                  busTransactions={busTransactions}
                />

                {/* Live Serial Output Log (Console RX) */}
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 shadow-lg flex flex-col">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                        USART1 Serial Console Stream (115200 Baud)
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-slate-400">TX Bytes: {usart.txCharCount}</span>
                      <button
                        onClick={() => setSerialOutput('')}
                        className="text-slate-400 hover:text-white underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <pre
                    ref={serialOutputRef}
                    className="font-mono text-xs bg-black/90 text-emerald-400 p-3 rounded-lg h-32 overflow-y-auto border border-slate-800 whitespace-pre-wrap selection:bg-emerald-500/30 selection:text-emerald-200"
                  >
                    {serialOutput || (
                      <span className="text-slate-600 italic">
                        // Serial USART1 terminal ready. When CPU executes STR to 0x40013804 (USART1_DR), data appears here...
                      </span>
                    )}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

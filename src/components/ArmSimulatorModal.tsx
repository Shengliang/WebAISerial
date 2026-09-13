import React, { useEffect, useRef, useState } from 'react';
import {
  Binary,
  CheckCircle2,
  Code2,
  Cpu,
  FileCode2,
  Layers,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { ArmBoardVisualizer } from './ArmBoardVisualizer';
import { ArmDatapathView } from './ArmDatapathView';
import { armSimulator } from '../utils/armSimulator/armCpu';
import {
  CompilationResult,
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
  if (!isOpen) return null;

  // Selected C program & source code
  const [selectedProgramId, setSelectedProgramId] = useState<string>(SAMPLE_C_PROGRAMS[0].id);
  const [cCode, setCCode] = useState<string>(SAMPLE_C_PROGRAMS[0].code);

  // Editor view tab: 'c_code' | 'disassembly'
  const [editorTab, setEditorTab] = useState<'c_code' | 'disassembly'>('c_code');

  // Compilation state
  const [compilation, setCompilation] = useState<CompilationResult>(() => compileCSource(SAMPLE_C_PROGRAMS[0].code));
  const [compileError, setCompileError] = useState<string | null>(null);

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

  // Setup callbacks when modal opens
  useEffect(() => {
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

    // Cleanup when unmounting or modal closes
    return () => {
      armSimulator.pause();
    };
  }, []);

  // Auto-scroll serial output
  useEffect(() => {
    if (serialOutputRef.current) {
      serialOutputRef.current.scrollTop = serialOutputRef.current.scrollHeight;
    }
  }, [serialOutput]);

  // Handle program template selection
  const handleSelectProgram = (progId: string) => {
    const prog = SAMPLE_C_PROGRAMS.find(p => p.id === progId);
    if (!prog) return;
    setSelectedProgramId(progId);
    setCCode(prog.code);
    handleCompileAndFlash(prog.code);
  };

  // Compile & Flash binary into simulated Flash memory
  const handleCompileAndFlash = (source = cCode) => {
    armSimulator.pause();
    const result = compileCSource(source);
    setCompilation(result);

    if (!result.success || result.errors.length > 0) {
      setCompileError(result.errors[0]?.message || 'Compilation error');
      return;
    }

    setCompileError(null);
    armSimulator.flashBinary(result.binary);
    setSerialOutput('');
    setRegisters({ ...armSimulator.registers });
    setPrevRegisters({ ...armSimulator.prevRegisters });
    setGpio({ ...armSimulator.gpioC });
    setUsart({ ...armSimulator.usart1 });
    setCycleCount(0);
    setCpuStatus('HALTED');
    setLastStage(null);
  };

  // Simulation controls
  const handleToggleRun = () => {
    if (armSimulator.isRunning()) {
      armSimulator.pause();
      setCpuStatus('HALTED');
    } else {
      armSimulator.run(clockSpeedHz);
      setCpuStatus('RUNNING');
    }
  };

  const handleStep = () => {
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
                Write C, compile directly in-browser to ARM Thumb machine code, and observe the live datapath & serial output
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
          {/* ================= LEFT PANE: C Code Editor & Assembly ================= */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60">
            {/* Editor Toolbar */}
            <div className="px-4 py-2.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 bg-slate-950">
              <div className="flex items-center gap-1.5">
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
              </div>

              {/* Compile & Flash Button */}
              <button
                onClick={() => handleCompileAndFlash()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Compile & Flash to Core</span>
              </button>
            </div>

            {/* Editor Body */}
            <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col">
              {editorTab === 'c_code' ? (
                /* C Code Text Area */
                <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                  <textarea
                    value={cCode}
                    onChange={e => setCCode(e.target.value)}
                    spellCheck={false}
                    className="w-full flex-1 p-3 bg-transparent font-mono text-xs text-slate-200 leading-relaxed resize-none focus:outline-none selection:bg-cyan-500/30 selection:text-cyan-200"
                    placeholder="Write C code here..."
                  />
                </div>
              ) : (
                /* Disassembly View */
                <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 rounded-lg p-2.5 overflow-y-auto font-mono text-xs">
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
                </div>
              )}

              {/* Compilation Status & Metrics Footer */}
              <div className="mt-2.5 flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-300">
                    Flash: <strong className="text-cyan-300">{compilation.flashSize}</strong> / 131,072 B ({((compilation.flashSize / 131072) * 100).toFixed(1)}%)
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-300">
                    SRAM: <strong className="text-emerald-300">{compilation.ramSize}</strong> / 20,480 B
                  </span>
                </div>

                {compileError && (
                  <span className="text-rose-400 truncate max-w-xs">{compileError}</span>
                )}
              </div>
            </div>
          </div>

          {/* ================= RIGHT PANE: Datapath & Board Visualizer ================= */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40 p-4 overflow-y-auto space-y-4">
            {/* Simulation Execution Controls */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2">
                {/* Run / Pause Button */}
                <button
                  onClick={handleToggleRun}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition shadow ${
                    armSimulator.isRunning()
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition"
                  title="Execute Single Instruction"
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
                className="w-full h-32 p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-emerald-400 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner"
              >
                {serialOutput || (
                  <span className="text-slate-600 italic">
                    Press "Run CPU" or "Step" above to execute C code and stream serial log output...
                  </span>
                )}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Cpu, RotateCcw, Zap } from 'lucide-react';
import { GpioState, UsartState } from '../utils/armSimulator/armTypes';

interface ArmBoardVisualizerProps {
  gpio: GpioState;
  usart: UsartState;
  onResetCpu: () => void;
  cpuStatus: string;
  cycleCount: number;
}

export const ArmBoardVisualizer: React.FC<ArmBoardVisualizerProps> = ({
  gpio,
  usart,
  onResetCpu,
  cpuStatus,
  cycleCount,
}) => {
  const isLedOn = gpio.ledPc13;

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-xl flex flex-col font-sans select-none relative overflow-hidden">
      {/* Background Circuit Grid Accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800/90 pb-2.5 mb-3 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-100 tracking-wide">
              Simulated Target PCB: STM32-Core M3
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">
              Pure In-Browser Silicon (Zero Physical HW Required)
            </p>
          </div>
        </div>

        <button
          onClick={onResetCpu}
          title="Hardware NRST Reset"
          className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
        >
          <RotateCcw className="w-3 h-3 text-cyan-400" />
          <span>NRST</span>
        </button>
      </div>

      {/* Microcontroller PCB Visual Canvas */}
      <div className="bg-slate-950/90 border-2 border-slate-800 rounded-lg p-3.5 relative z-10">
        {/* PCB Silkscreen Labels */}
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 tracking-wider mb-2">
          <span>REV 2.4-SIM</span>
          <span className="text-cyan-500/80 font-bold">ARM CORTEX-M3 @ 72MHz</span>
          <span>MMIO BENCH</span>
        </div>

        {/* Central Layout: MCU Chip & Peripherals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          {/* Left: Power & Reset Pushbutton */}
          <div className="flex flex-col gap-2.5 bg-slate-900/80 border border-slate-800 rounded p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">3V3 POWER</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">CPU STATE</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  cpuStatus === 'RUNNING'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {cpuStatus}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">CYCLES</span>
              <span className="text-[11px] font-mono text-cyan-300">
                {cycleCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Center: Silicon QFP-48 IC Chip Graphic */}
          <div className="flex flex-col items-center justify-center p-3 bg-slate-900 border border-slate-700/80 rounded-md relative shadow-inner">
            {/* Chip Notch */}
            <div className="w-2 h-2 rounded-full bg-slate-950 border border-slate-700 absolute top-1 left-1" />
            <span className="text-[11px] font-mono font-bold text-slate-200 tracking-wider text-center">
              STM32F103C8T6
            </span>
            <span className="text-[9px] font-mono text-cyan-400 text-center">
              ARM Cortex-M3
            </span>
            <span className="text-[8px] font-mono text-slate-500 text-center mt-1">
              Flash: 128KB | SRAM: 20KB
            </span>
          </div>

          {/* Right: User PC13 LED Component */}
          <div
            className={`flex flex-col gap-2 rounded-lg p-3 border transition-all duration-200 ${
              isLedOn
                ? 'bg-emerald-950/40 border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap
                  className={`w-3.5 h-3.5 ${
                    isLedOn ? 'text-emerald-400 animate-bounce' : 'text-slate-600'
                  }`}
                />
                <span className="text-[10px] font-mono font-semibold text-slate-200">
                  PC13 USER LED
                </span>
              </div>
              {/* Glowing Diode Visual */}
              <div
                className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                  isLedOn
                    ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_14px_rgba(52,211,153,1)] scale-110'
                    : 'bg-emerald-950/40 border-emerald-900/60'
                }`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400">STATE:</span>
              <span
                className={`font-bold ${
                  isLedOn ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {isLedOn ? '● ON (Active Low)' : '○ OFF'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>TOGGLES:</span>
              <span className="text-cyan-300 font-bold">{gpio.toggleCount}</span>
            </div>
          </div>
        </div>

        {/* Bottom USART & Bus Activity Indicators */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  usart.txCharCount > 0 ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'bg-slate-700'
                }`}
              />
              <span>USART1 TX (PA9)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span>USART1 RX (PA10)</span>
            </div>
          </div>

          <div className="text-slate-500">
            GPIOC_ODR: <span className="text-slate-300">0x{gpio.odr.toString(16).padStart(8, '0')}</span> | TX Bytes:{' '}
            <span className="text-cyan-300">{usart.txCharCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

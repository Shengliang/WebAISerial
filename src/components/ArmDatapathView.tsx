import React from 'react';
import { ArrowRight, Binary, Cpu, Database, Eye, Layers, Radio } from 'lucide-react';
import { BusTransaction, CpuRegisters, DatapathStage } from '../utils/armSimulator/armTypes';

interface ArmDatapathViewProps {
  stage: DatapathStage | null;
  registers: CpuRegisters;
  prevRegisters?: CpuRegisters;
  busTransactions: BusTransaction[];
}

export const ArmDatapathView: React.FC<ArmDatapathViewProps> = ({
  stage,
  registers,
  prevRegisters,
  busTransactions,
}) => {
  const regList: Array<{ name: string; val: number; key: keyof Omit<CpuRegisters, 'psr'> }> = [
    { name: 'R0', val: registers.r0, key: 'r0' },
    { name: 'R1', val: registers.r1, key: 'r1' },
    { name: 'R2', val: registers.r2, key: 'r2' },
    { name: 'R3', val: registers.r3, key: 'r3' },
    { name: 'R4', val: registers.r4, key: 'r4' },
    { name: 'R5', val: registers.r5, key: 'r5' },
    { name: 'R6', val: registers.r6, key: 'r6' },
    { name: 'R7', val: registers.r7, key: 'r7' },
    { name: 'R8', val: registers.r8, key: 'r8' },
    { name: 'R9', val: registers.r9, key: 'r9' },
    { name: 'R10', val: registers.r10, key: 'r10' },
    { name: 'R11', val: registers.r11, key: 'r11' },
    { name: 'R12', val: registers.r12, key: 'r12' },
    { name: 'SP (R13)', val: registers.sp, key: 'sp' },
    { name: 'LR (R14)', val: registers.lr, key: 'lr' },
    { name: 'PC (R15)', val: registers.pc, key: 'pc' },
  ];

  return (
    <div className="flex flex-col gap-3 font-sans text-slate-100">
      {/* 5-Stage Datapath Pipeline Visual Flow */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 shadow-lg">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
              Cortex-M Execution Datapath Pipeline
            </h4>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded">
            Live Microarchitecture Telemetry
          </span>
        </div>

        {/* Pipeline Stage Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          {/* 1. FETCH */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 mb-1">
              <span className="font-bold">1. FETCH</span>
              <Binary className="w-3 h-3" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-400">
                PC:{' '}
                <span className="text-cyan-300 font-bold">
                  0x{stage ? stage.fetch.pc.toString(16).padStart(8, '0') : '00000000'}
                </span>
              </div>
              <div className="text-slate-400">
                IR:{' '}
                <span className="text-amber-300">
                  {stage ? stage.fetch.rawHex : '0x0000'}
                </span>
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono truncate text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded">
              {stage ? stage.fetch.mnemonic : 'NOP'}
            </div>
          </div>

          {/* 2. DECODE */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 mb-1">
              <span className="font-bold">2. DECODE</span>
              <Eye className="w-3 h-3" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-400 truncate">
                OPCODE:{' '}
                <span className="text-emerald-400 font-bold">
                  {stage ? stage.decode.opcode : 'IDLE'}
                </span>
              </div>
              <div className="text-slate-400">
                DEST:{' '}
                <span className="text-slate-200">
                  {stage?.decode.destReg || 'None'}
                </span>
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-slate-400 truncate">
              {stage?.decode.immediate !== undefined
                ? `Imm: 0x${stage.decode.immediate.toString(16)}`
                : stage?.decode.sourceRegs.length
                ? `Src: ${stage.decode.sourceRegs.join(', ')}`
                : 'Direct'}
            </div>
          </div>

          {/* 3. EXECUTE / ALU */}
          <div className="bg-slate-950/80 border border-cyan-800/60 rounded-lg p-2.5 flex flex-col justify-between shadow-[0_0_12px_rgba(6,182,212,0.1)]">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 mb-1">
              <span className="font-bold">3. ALU EXEC</span>
              <Cpu className="w-3 h-3" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-400">
                OP:{' '}
                <span className="text-cyan-300 font-bold">
                  {stage ? stage.execute.operation : 'PASS'}
                </span>
              </div>
              <div className="text-slate-400 truncate">
                RES:{' '}
                <span className="text-amber-300">
                  0x{stage ? (stage.execute.result >>> 0).toString(16).padStart(8, '0') : '00000000'}
                </span>
              </div>
            </div>
            {/* ALU Flags */}
            <div className="mt-2 flex items-center gap-1 font-mono text-[9px]">
              <span
                className={`px-1 py-0.2 rounded ${
                  registers.psr.n ? 'bg-rose-900 text-rose-200' : 'bg-slate-900 text-slate-600'
                }`}
              >
                N
              </span>
              <span
                className={`px-1 py-0.2 rounded ${
                  registers.psr.z ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-900 text-slate-600'
                }`}
              >
                Z
              </span>
              <span
                className={`px-1 py-0.2 rounded ${
                  registers.psr.c ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-900 text-slate-600'
                }`}
              >
                C
              </span>
              <span
                className={`px-1 py-0.2 rounded ${
                  registers.psr.v ? 'bg-amber-900 text-amber-200' : 'bg-slate-900 text-slate-600'
                }`}
              >
                V
              </span>
            </div>
          </div>

          {/* 4. MEMORY / BUS */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 mb-1">
              <span className="font-bold">4. MEM BUS</span>
              <Database className="w-3 h-3" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              {stage?.memory ? (
                <>
                  <div className="text-slate-400">
                    TYPE:{' '}
                    <span
                      className={`font-bold ${
                        stage.memory.type === 'WRITE' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {stage.memory.type}
                    </span>
                  </div>
                  <div className="text-slate-400 truncate">
                    ADDR: <span className="text-slate-200">0x{stage.memory.address.toString(16)}</span>
                  </div>
                </>
              ) : (
                <div className="text-slate-500 italic py-1">Bus Idle</div>
              )}
            </div>
            <div className="mt-2 text-[10px] font-mono truncate text-cyan-400/90">
              {stage?.memory ? `Target: ${stage.memory.target}` : 'No Access'}
            </div>
          </div>

          {/* 5. WRITEBACK */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 mb-1">
              <span className="font-bold">5. WRITEBACK</span>
              <ArrowRight className="w-3 h-3" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              {stage?.writeback?.reg ? (
                <>
                  <div className="text-slate-400">
                    REG: <span className="text-cyan-300 font-bold">{stage.writeback.reg}</span>
                  </div>
                  <div className="text-slate-400 truncate">
                    VAL: <span className="text-amber-300">0x{stage.writeback.value?.toString(16)}</span>
                  </div>
                </>
              ) : (
                <div className="text-slate-500 italic py-1">No Writeback</div>
              )}
            </div>
            <div className="mt-2 text-[10px] font-mono text-slate-500">Regfile Updated</div>
          </div>
        </div>
      </div>

      {/* Register File Bank & Live Flags */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 shadow-lg">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
              32-Bit Register File (R0 - R15 / APSR)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-slate-400">APSR Flags:</span>
            <span className={`px-1.5 py-0.5 rounded font-bold ${registers.psr.n ? 'bg-rose-900 text-rose-200' : 'bg-slate-800 text-slate-500'}`}>N={registers.psr.n ? '1' : '0'}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold ${registers.psr.z ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-800 text-slate-500'}`}>Z={registers.psr.z ? '1' : '0'}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold ${registers.psr.c ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-slate-500'}`}>C={registers.psr.c ? '1' : '0'}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold ${registers.psr.v ? 'bg-amber-900 text-amber-200' : 'bg-slate-800 text-slate-500'}`}>V={registers.psr.v ? '1' : '0'}</span>
          </div>
        </div>

        {/* 16 Register Cells Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
          {regList.map(r => {
            const hasChanged = prevRegisters && prevRegisters[r.key] !== r.val;
            return (
              <div
                key={r.name}
                className={`p-2 rounded border font-mono text-[11px] transition-all duration-300 ${
                  hasChanged
                    ? 'bg-cyan-950/80 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-950/70 border-slate-800/90'
                }`}
              >
                <div className="text-[10px] text-slate-400 font-semibold">{r.name}</div>
                <div className={`font-bold truncate mt-0.5 ${hasChanged ? 'text-cyan-300' : 'text-slate-200'}`}>
                  0x{r.val.toString(16).padStart(8, '0').toUpperCase()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Memory Bus Transaction Telemetry */}
      {busTransactions.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              AHB / APB Bus Matrix Transactions (MMIO Log)
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Showing Last {busTransactions.slice(-4).length} cycles
            </span>
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            {busTransactions.slice(-4).reverse().map((tx, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-2 py-1 rounded bg-slate-950 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      tx.type === 'WRITE' ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                    }`}
                  >
                    {tx.type}
                  </span>
                  <span className="text-slate-300">Addr: 0x{tx.address.toString(16).padStart(8, '0')}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-cyan-300">Data: 0x{tx.data.toString(16).padStart(8, '0')}</span>
                </div>
                <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50">
                  {tx.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

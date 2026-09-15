/**
 * Types and interfaces for the ARM Cortex-M CPU Simulator and Datapath Visualizer.
 */

export interface CpuRegisters {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  r8: number;
  r9: number;
  r10: number;
  r11: number;
  r12: number;
  sp: number; // R13 - Stack Pointer
  lr: number; // R14 - Link Register
  pc: number; // R15 - Program Counter
  psr: {
    n: boolean; // Negative
    z: boolean; // Zero
    c: boolean; // Carry
    v: boolean; // Overflow
  };
}

export type CpuState = 'HALTED' | 'RUNNING' | 'STEPPING' | 'BREAKPOINT' | 'FAULT';

export interface BusTransaction {
  type: 'READ' | 'WRITE';
  address: number;
  data: number;
  size: 1 | 2 | 4; // byte, halfword, word
  target: 'FLASH_ROM' | 'SRAM' | 'GPIOC' | 'GPIOA' | 'USART1' | 'RCC' | 'SYSTICK' | 'UNKNOWN';
  timestamp: number;
}

export interface AluState {
  operandA: number;
  operandB: number;
  operation: string;
  result: number;
  flagsChanged: {
    n: boolean;
    z: boolean;
    c: boolean;
    v: boolean;
  };
}

export interface DatapathStage {
  fetch: {
    pc: number;
    instructionWord: number;
    rawHex: string;
    mnemonic: string;
  };
  decode: {
    opcode: string;
    destReg?: string;
    sourceRegs: string[];
    immediate?: number;
  };
  execute: AluState;
  memory: BusTransaction | null;
  writeback: {
    reg?: string;
    value?: number;
  } | null;
}

export interface GpioState {
  moder: number;
  odr: number;
  idr: number;
  pins: boolean[]; // 16 pins
  ledPc13: boolean; // true = glowing (active low or active high configurable)
  toggleCount: number;
  lastToggleTime: number;
}

export interface UsartState {
  sr: number; // Status register (TXE, RXNE, TC)
  dr: number; // Data register
  brr: number; // Baud rate
  cr1: number; // Control register
  txBuffer: number[];
  rxBuffer: number[];
  txCharCount: number;
}

export interface ArmDisassemblyLine {
  address: number;
  opcode: number;
  hex: string;
  mnemonic: string;
  operands: string;
  cLineNumber?: number;
  rawText: string;
}

export interface CompilerDiagnostic {
  line: number;
  column?: number;
  message: string;
  sourceSnippet?: string;
  severity: 'error' | 'warning';
}

export interface CompilationResult {
  success: boolean;
  errors: CompilerDiagnostic[];
  warnings: CompilerDiagnostic[];
  binary: Uint8Array;
  disassembly: ArmDisassemblyLine[];
  symbols: Record<string, number>;
  flashSize: number;
  ramSize: number;
  buildLog?: string;
}

/**
 * U-Boot Interactive Command Line Interface Engine for ARM Cortex-M3 Simulator
 * Provides authentic Das U-Boot commands (md, mw, cp, cmp, bdinfo, printenv, setenv, go, call, symbols, reset)
 */

import {
  armSimulator,
  ADDR_GPIOC_ODR,
  ADDR_GPIOC_MODER,
  FLASH_BASE,
  FLASH_SIZE,
  SRAM_BASE,
  SRAM_SIZE,
  STACK_TOP,
} from './armCpu';
import { ArmDisassemblyLine } from './armTypes';
import { compileCSource } from './cCompiler';

export interface UBootOutputLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info' | 'banner';
  text: string;
}

export interface UBootState {
  env: Record<string, string>;
  symbols: Record<string, number>;
  lastAddress: number;
  baseAddress: number;
  history: string[];
}

// Calculate standard IEEE 802.3 CRC32
function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class UBootEngine {
  private env: Record<string, string> = {
    baudrate: '115200',
    bootcmd: 'echo [BOOT] Starting self-test...; symbols; go add 15 27; md.l 0x20000000 4',
    bootdelay: '3',
    board: 'stm32f103c8t6-sim',
    soc: 'stm32f1xx',
    cpu: 'ARM Cortex-M3 (ARMv7-M) @ 72.0 MHz',
    arch: 'arm',
    stdin: 'serial',
    stdout: 'serial',
    stderr: 'serial',
    loadaddr: '0x20000000',
    app_entry: '0x08000008',
    selftest: 'mtest 0x20000000 0x20000400; go add 40 2',
  };

  private symbols: Record<string, number> = {};
  private lastAddress: number = 0x20000000;
  private baseAddress: number = 0;
  private history: string[] = [];
  private historyIndex: number = -1;
  public latestDisassembly: ArmDisassemblyLine[] = [];

  constructor() {
    this.resetSymbols();
  }

  public resetSymbols() {
    this.symbols = {
      Reset_Handler: 0x08000008,
      main: 0x08000008,
      add: 0x08000008,
    };
  }

  public updateSymbols(newSymbols: Record<string, number>) {
    this.symbols = { ...this.symbols, ...newSymbols };
  }

  public setDisassembly(disassembly: ArmDisassemblyLine[]) {
    this.latestDisassembly = disassembly;
  }

  public getSymbols(): Record<string, number> {
    return { ...this.symbols };
  }

  public getHistory(): string[] {
    return [...this.history];
  }

  public getBootBanner(): string[] {
    return [
      `\x1b[1;36mU-Boot 2026.04-arm-sim (Sep 13 2026 - 16:45:00 -0700)\x1b[0m`,
      ``,
      `Model: ARM Cortex-M3 Virtual Target (STM32F103)`,
      `DRAM:  20 KiB @ 0x20000000`,
      `Flash: 128 KiB @ 0x08000000`,
      `In:    serial (USART1 @ 115200 8N1)`,
      `Out:   serial (USART1 @ 115200 8N1)`,
      `Err:   serial (USART1 @ 115200 8N1)`,
      `Hit any key to stop autoboot:  0`,
      `Type '\x1b[1;33mhelp\x1b[0m' for command list, '\x1b[1;33msymbols\x1b[0m' to inspect C functions, or '\x1b[1;33mdemo\x1b[0m' for quick test.`,
    ];
  }

  /**
   * Parse a string token into an address or integer, supporting:
   * - Hex: '0x20000000' or '20000000'
   * - Decimal: '42' or '-5'
   * - Symbol name: 'add' -> symbols['add']
   */
  private parseAddressOrNumber(token: string): number | null {
    if (!token) return null;
    const clean = token.trim();

    // Check if it's a known symbol
    if (this.symbols[clean] !== undefined) {
      return this.symbols[clean];
    }

    // Check hexadecimal with 0x prefix
    if (clean.toLowerCase().startsWith('0x')) {
      const val = parseInt(clean, 16);
      return isNaN(val) ? null : val;
    }

    // Check if it has hex letters (A-F) without 0x
    if (/^[0-9a-fA-F]{8}$/.test(clean) || (clean.length > 2 && /[a-fA-F]/.test(clean))) {
      const val = parseInt(clean, 16);
      return isNaN(val) ? null : val;
    }

    // Decimal or negative
    const decVal = parseInt(clean, 10);
    return isNaN(decVal) ? null : decVal;
  }

  /**
   * Execute a single command line (may contain semicolon-separated commands)
   */
  public executeCommandLine(
    cmdLine: string,
    currentCSource?: string
  ): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const trimmed = cmdLine.trim();
    if (!trimmed) {
      return [];
    }

    // Add to history
    this.history.push(trimmed);
    this.historyIndex = this.history.length;

    // Support chained commands with ';'
    const subCommands = trimmed.split(';').map(c => c.trim()).filter(Boolean);
    const results: Array<{ text: string; type: UBootOutputLine['type'] }> = [];

    for (const subCmd of subCommands) {
      const out = this.dispatchSingleCommand(subCmd, currentCSource);
      results.push(...out);
    }

    return results;
  }

  private dispatchSingleCommand(
    cmdStr: string,
    currentCSource?: string
  ): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const tokens = cmdStr.trim().split(/\s+/);
    const rawCmd = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    // Parse dot-suffix for memory commands: e.g. md.b, md.w, md.l
    const cmdParts = rawCmd.split('.');
    const baseCmd = cmdParts[0];
    const sizeSuffix = cmdParts[1] || 'l'; // default to 32-bit word (.l)

    let size = 4;
    if (sizeSuffix === 'b') size = 1;
    else if (sizeSuffix === 'w') size = 2;
    else if (sizeSuffix === 'l') size = 4;

    switch (baseCmd) {
      case 'help':
      case '?':
        return this.cmdHelp(args[0]);

      case 'version':
        return [
          { text: `U-Boot 2026.04-arm-sim (Sep 13 2026 - 16:45:00 -0700)`, type: 'output' },
          { text: `arm-none-eabi-gcc (GCC) 13.2.0`, type: 'output' },
          { text: `GNU ld (GNU Binutils) 2.41`, type: 'output' },
          { text: `Target Architecture: ARMv7-M (Cortex-M3) Thumb-2`, type: 'info' },
        ];

      case 'bdinfo':
        return this.cmdBdinfo();

      case 'md':
        return this.cmdMemoryDisplay(args, size);

      case 'mw':
        return this.cmdMemoryWrite(args, size);

      case 'cp':
        return this.cmdMemoryCopy(args, size);

      case 'cmp':
        return this.cmdMemoryCompare(args, size);

      case 'crc32':
        return this.cmdCrc32(args);

      case 'base':
        if (args.length === 0) {
          return [{ text: `Base address is 0x${this.baseAddress.toString(16).padStart(8, '0')}`, type: 'output' }];
        }
        const newBase = this.parseAddressOrNumber(args[0]);
        if (newBase === null) return [{ text: `Invalid base address: ${args[0]}`, type: 'error' }];
        this.baseAddress = newBase >>> 0;
        return [{ text: `Base address set to 0x${this.baseAddress.toString(16).padStart(8, '0')}`, type: 'success' }];

      case 'printenv':
        return this.cmdPrintenv(args[0]);

      case 'setenv':
        return this.cmdSetenv(args);

      case 'echo':
        return this.cmdEcho(args);

      case 'symbols':
        return this.cmdSymbols();

      case 'compile':
        return this.cmdCompile(currentCSource);

      case 'go':
      case 'call':
        return this.cmdGo(args);

      case 'run':
        return this.cmdRun(args, currentCSource);

      case 'mtest':
        return this.cmdMemoryTest(args);

      case 'gpio':
        return this.cmdGpio(args);

      case 'led':
        return this.cmdLed(args);

      case 'disasm':
      case 'dis':
        return this.cmdDisassemble(args);

      case 'reg':
      case 'regs':
        return this.cmdRegisters(args);

      case 'sleep':
        return this.cmdSleep(args);

      case 'reset':
        armSimulator.reset();
        return [
          { text: `Resetting CPU...`, type: 'info' },
          { text: `ARM Cortex-M3 core and peripheral registers reset to initial state.`, type: 'success' },
          { text: `PC: 0x${armSimulator.registers.pc.toString(16).padStart(8, '0')} | SP: 0x${armSimulator.registers.sp.toString(16).padStart(8, '0')}`, type: 'output' },
        ];

      case 'demo':
        return this.cmdDemo(currentCSource);

      default:
        return [
          { text: `Unknown command '${rawCmd}' - try 'help'`, type: 'error' },
        ];
    }
  }

  /**
   * Help Command
   */
  private cmdHelp(specificCmd?: string): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (specificCmd) {
      const sc = specificCmd.toLowerCase();
      if (sc === 'md') {
        return [
          { text: `md - memory display`, type: 'info' },
          { text: `Usage: md[.b, .w, .l] address [count]`, type: 'output' },
          { text: `  .b = 8-bit byte display`, type: 'output' },
          { text: `  .w = 16-bit halfword display`, type: 'output' },
          { text: `  .l = 32-bit word display (default)`, type: 'output' },
          { text: `Example: md.l 0x20000000 4`, type: 'output' },
        ];
      }
      if (sc === 'mw') {
        return [
          { text: `mw - memory write (fill)`, type: 'info' },
          { text: `Usage: mw[.b, .w, .l] address value [count]`, type: 'output' },
          { text: `Example: mw.l 0x20000000 0x12345678 1`, type: 'output' },
        ];
      }
      if (sc === 'run') {
        return [
          { text: `run - run commands in an environment variable`, type: 'info' },
          { text: `Usage: run varname [varname2...]`, type: 'output' },
          { text: `Example: run bootcmd`, type: 'output' },
          { text: `Example: run selftest`, type: 'output' },
        ];
      }
      if (sc === 'mtest') {
        return [
          { text: `mtest - simple RAM memory test`, type: 'info' },
          { text: `Usage: mtest [start [end [pattern]]]`, type: 'output' },
          { text: `Example: mtest 0x20000000 0x20000400`, type: 'output' },
        ];
      }
      if (sc === 'disasm' || sc === 'dis') {
        return [
          { text: `disasm - disassemble Thumb-2 instructions`, type: 'info' },
          { text: `Usage: disasm [symbol|address] [count]`, type: 'output' },
          { text: `Example: disasm add 8`, type: 'output' },
          { text: `Example: disasm 0x08000008 12`, type: 'output' },
        ];
      }
      if (sc === 'gpio' || sc === 'led') {
        return [
          { text: `gpio / led - hardware GPIO and user LED control`, type: 'info' },
          { text: `Usage: gpio <status | set 13 <0|1> | clear 13 | toggle 13>`, type: 'output' },
          { text: `Usage: led <on | off | toggle | status>`, type: 'output' },
        ];
      }
      if (sc === 'reg' || sc === 'regs') {
        return [
          { text: `reg - inspect or modify CPU core registers`, type: 'info' },
          { text: `Usage: reg [regname] [value]`, type: 'output' },
          { text: `Example: reg        => dumps all R0-R12, SP, LR, PC, xPSR`, type: 'output' },
          { text: `Example: reg r0 42  => sets R0 to 42`, type: 'output' },
        ];
      }
      if (sc === 'go' || sc === 'call') {
        return [
          { text: `go / call - start application or invoke C function`, type: 'info' },
          { text: `Usage: go <address|symbol> [arg1] [arg2] ...`, type: 'output' },
          { text: `  Passes arguments according to ARM AAPCS calling convention:`, type: 'output' },
          { text: `  arg1 -> R0, arg2 -> R1, arg3 -> R2, arg4 -> R3`, type: 'output' },
          { text: `  Function return value is read from R0 upon completion.`, type: 'output' },
          { text: `Example: go add 15 27  => outputs result 42`, type: 'output' },
        ];
      }
    }

    return [
      { text: `Available U-Boot Commands:`, type: 'info' },
      { text: `  md [.b, .w, .l] addr [cnt]   - Memory display (hex dump with ASCII)`, type: 'output' },
      { text: `  mw [.b, .w, .l] addr val [cnt] - Memory write (store value to address)`, type: 'output' },
      { text: `  cp [.b, .w, .l] src dst cnt  - Memory copy`, type: 'output' },
      { text: `  cmp [.b, .w, .l] a1 a2 cnt   - Memory compare`, type: 'output' },
      { text: `  crc32 addr cnt              - Calculate IEEE 802.3 CRC32 checksum`, type: 'output' },
      { text: `  base [addr]                 - Print or set address offset`, type: 'output' },
      { text: `  mtest [start [end]]         - Test RAM memory patterns (walking 1s, checkerboard, address)`, type: 'output' },
      { text: `  bdinfo                      - Print board hardware information`, type: 'output' },
      { text: `  version                     - Print U-Boot and toolchain version`, type: 'output' },
      { text: `  printenv [name]             - Print environment variables`, type: 'output' },
      { text: `  setenv name [value]         - Set or delete environment variable`, type: 'output' },
      { text: `  run varname...              - Run command script stored in environment variable`, type: 'output' },
      { text: `  echo [args...]              - Echo arguments to console ($var supported)`, type: 'output' },
      { text: `  symbols                     - List compiled C function symbols and entry points`, type: 'output' },
      { text: `  compile                     - Compile C source code and flash to simulator`, type: 'output' },
      { text: `  disasm [sym|addr] [cnt]     - Disassemble Thumb-2 instructions at function or address`, type: 'output' },
      { text: `  go <addr|symbol> [args...]  - Execute C function at address (AAPCS convention)`, type: 'output' },
      { text: `  call <symbol> [args...]     - Alias for 'go' to invoke function by name`, type: 'output' },
      { text: `  reg [name] [val]            - Dump or modify ARM Cortex-M core registers`, type: 'output' },
      { text: `  gpio [status|set|clear|toggle] - Inspect or manipulate GPIOC hardware pins`, type: 'output' },
      { text: `  led [on|off|toggle|status]  - Control physical board LED (PC13)`, type: 'output' },
      { text: `  sleep <ms>                  - Delay execution for given milliseconds`, type: 'output' },
      { text: `  reset                       - Perform CPU core and peripheral hardware reset`, type: 'output' },
      { text: `  demo                        - Run full automated C function & memory CLI demo`, type: 'output' },
    ];
  }

  /**
   * Board Info Command
   */
  private cmdBdinfo(): Array<{ text: string; type: UBootOutputLine['type'] }> {
    return [
      { text: `arch_number = 0x00000000`, type: 'output' },
      { text: `boot_params = 0x20000100`, type: 'output' },
      { text: `DRAM bank   = 0x00000000`, type: 'output' },
      { text: `-> start    = 0x${SRAM_BASE.toString(16).padStart(8, '0')}`, type: 'output' },
      { text: `-> size     = 0x${SRAM_SIZE.toString(16).padStart(8, '0')} (20 KiB)`, type: 'output' },
      { text: `flashstart  = 0x${FLASH_BASE.toString(16).padStart(8, '0')}`, type: 'output' },
      { text: `flashsize   = 0x${FLASH_SIZE.toString(16).padStart(8, '0')} (128 KiB)`, type: 'output' },
      { text: `flashoffset = 0x00000000`, type: 'output' },
      { text: `baudrate    = ${this.env.baudrate || '115200'} bps`, type: 'output' },
      { text: `relocaddr   = 0x20004000`, type: 'output' },
      { text: `sp start    = 0x${STACK_TOP.toString(16).padStart(8, '0')}`, type: 'output' },
      { text: `current CPU = ${this.env.cpu}`, type: 'output' },
    ];
  }

  /**
   * Memory Display Command: md[.b, .w, .l] address [count]
   */
  private cmdMemoryDisplay(args: string[], size: number): Array<{ text: string; type: UBootOutputLine['type'] }> {
    let addr = this.lastAddress;
    if (args.length > 0) {
      const parsed = this.parseAddressOrNumber(args[0]);
      if (parsed === null) {
        return [{ text: `Invalid address: ${args[0]}`, type: 'error' }];
      }
      addr = parsed + this.baseAddress;
    }

    let count = size === 1 ? 16 : size === 2 ? 8 : 4;
    if (args.length > 1) {
      const parsedCount = parseInt(args[1], 10);
      if (!isNaN(parsedCount) && parsedCount > 0) {
        count = Math.min(parsedCount, 64);
      }
    }

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [];
    const bytesPerUnit = size;
    const totalBytes = count * bytesPerUnit;
    const bytesPerLine = 16;
    const lineCount = Math.ceil(totalBytes / bytesPerLine);

    let curAddr = addr;
    for (let l = 0; l < lineCount; l++) {
      const lineStartAddr = curAddr;
      const unitsInThisLine = Math.min(count - l * (bytesPerLine / bytesPerUnit), bytesPerLine / bytesPerUnit);
      let hexParts: string[] = [];
      let asciiStr = '';

      for (let u = 0; u < unitsInThisLine; u++) {
        const unitAddr = lineStartAddr + u * bytesPerUnit;
        const val = armSimulator.readMemory(unitAddr, bytesPerUnit as 1 | 2 | 4);

        if (bytesPerUnit === 4) {
          hexParts.push(val.toString(16).padStart(8, '0'));
        } else if (bytesPerUnit === 2) {
          hexParts.push(val.toString(16).padStart(4, '0'));
        } else {
          hexParts.push(val.toString(16).padStart(2, '0'));
        }

        // Collect ascii for this unit (little endian)
        for (let b = 0; b < bytesPerUnit; b++) {
          const byteVal = armSimulator.readMemory(unitAddr + b, 1);
          asciiStr += byteVal >= 32 && byteVal <= 126 ? String.fromCharCode(byteVal) : '.';
        }
      }

      curAddr += unitsInThisLine * bytesPerUnit;

      const addrHeader = lineStartAddr.toString(16).padStart(8, '0');
      const hexColumn = hexParts.join(' ').padEnd(bytesPerUnit === 4 ? 36 : 40, ' ');
      lines.push({
        text: `${addrHeader}: ${hexColumn}  ${asciiStr}`,
        type: 'output',
      });
    }

    this.lastAddress = curAddr;
    return lines;
  }

  /**
   * Memory Write Command: mw[.b, .w, .l] address value [count]
   */
  private cmdMemoryWrite(args: string[], size: number): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length < 2) {
      return [{ text: `Usage: mw[.b, .w, .l] address value [count]`, type: 'error' }];
    }

    const addrParsed = this.parseAddressOrNumber(args[0]);
    if (addrParsed === null) {
      return [{ text: `Invalid address '${args[0]}'`, type: 'error' }];
    }
    const targetAddr = (addrParsed + this.baseAddress) >>> 0;

    const valParsed = this.parseAddressOrNumber(args[1]);
    if (valParsed === null) {
      return [{ text: `Invalid value '${args[1]}'`, type: 'error' }];
    }
    const val = valParsed >>> 0;

    let count = 1;
    if (args.length > 2) {
      const parsedCount = parseInt(args[2], 10);
      if (!isNaN(parsedCount) && parsedCount > 0) count = Math.min(parsedCount, 256);
    }

    for (let i = 0; i < count; i++) {
      armSimulator.writeMemory(targetAddr + i * size, val, size as 1 | 2 | 4);
    }

    const hexVal = '0x' + val.toString(16).padStart(size * 2, '0').toUpperCase();
    const hexAddr = '0x' + targetAddr.toString(16).padStart(8, '0');
    return [
      {
        text: `Written ${hexVal} to ${hexAddr}${count > 1 ? ` (${count} times, size: ${size} byte(s))` : ` (size: ${size} byte(s))`}`,
        type: 'success',
      },
    ];
  }

  /**
   * Memory Copy Command: cp[.b, .w, .l] source target count
   */
  private cmdMemoryCopy(args: string[], size: number): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length < 3) {
      return [{ text: `Usage: cp[.b, .w, .l] source target count`, type: 'error' }];
    }

    const src = this.parseAddressOrNumber(args[0]);
    const dst = this.parseAddressOrNumber(args[1]);
    const cnt = parseInt(args[2], 10);

    if (src === null || dst === null || isNaN(cnt) || cnt <= 0) {
      return [{ text: `Invalid arguments for cp`, type: 'error' }];
    }

    const count = Math.min(cnt, 1024);
    for (let i = 0; i < count; i++) {
      const val = armSimulator.readMemory(src + i * size, size as 1 | 2 | 4);
      armSimulator.writeMemory(dst + i * size, val, size as 1 | 2 | 4);
    }

    return [
      {
        text: `Copied ${count} unit(s) (${count * size} bytes) from 0x${src.toString(16).padStart(8, '0')} to 0x${dst.toString(16).padStart(8, '0')}`,
        type: 'success',
      },
    ];
  }

  /**
   * Memory Compare Command: cmp[.b, .w, .l] addr1 addr2 count
   */
  private cmdMemoryCompare(args: string[], size: number): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length < 3) {
      return [{ text: `Usage: cmp[.b, .w, .l] addr1 addr2 count`, type: 'error' }];
    }

    const a1 = this.parseAddressOrNumber(args[0]);
    const a2 = this.parseAddressOrNumber(args[1]);
    const cnt = parseInt(args[2], 10);

    if (a1 === null || a2 === null || isNaN(cnt) || cnt <= 0) {
      return [{ text: `Invalid arguments for cmp`, type: 'error' }];
    }

    const count = Math.min(cnt, 1024);
    for (let i = 0; i < count; i++) {
      const v1 = armSimulator.readMemory(a1 + i * size, size as 1 | 2 | 4);
      const v2 = armSimulator.readMemory(a2 + i * size, size as 1 | 2 | 4);
      if (v1 !== v2) {
        return [
          {
            text: `Mismatch at offset ${i}: word at 0x${(a1 + i * size).toString(16)} (0x${v1.toString(16)}) != 0x${(a2 + i * size).toString(16)} (0x${v2.toString(16)})`,
            type: 'error',
          },
          { text: `Total of ${i} unit(s) were the same before mismatch.`, type: 'output' },
        ];
      }
    }

    return [{ text: `Total of ${count} unit(s) were identical.`, type: 'success' }];
  }

  /**
   * CRC32 Command
   */
  private cmdCrc32(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length < 2) {
      return [{ text: `Usage: crc32 address count`, type: 'error' }];
    }

    const addr = this.parseAddressOrNumber(args[0]);
    const cnt = parseInt(args[1], 10);
    if (addr === null || isNaN(cnt) || cnt <= 0) {
      return [{ text: `Invalid address or count for crc32`, type: 'error' }];
    }

    const buf = new Uint8Array(cnt);
    for (let i = 0; i < cnt; i++) {
      buf[i] = armSimulator.readMemory(addr + i, 1);
    }
    const crc = calculateCrc32(buf);
    return [
      {
        text: `CRC32 for 0x${addr.toString(16).padStart(8, '0')} ... 0x${(addr + cnt - 1).toString(16).padStart(8, '0')} ==> ${crc.toString(16).padStart(8, '0')}`,
        type: 'success',
      },
    ];
  }

  /**
   * Print Environment Variables
   */
  private cmdPrintenv(name?: string): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (name) {
      if (this.env[name] !== undefined) {
        return [{ text: `${name}=${this.env[name]}`, type: 'output' }];
      }
      return [{ text: `## Error: "${name}" not defined`, type: 'error' }];
    }

    const entries = Object.entries(this.env).sort((a, b) => a[0].localeCompare(b[0]));
    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = entries.map(([k, v]) => ({
      text: `${k}=${v}`,
      type: 'output',
    }));
    lines.push({ text: `\nEnvironment size: ${lines.length} variable(s)`, type: 'info' });
    return lines;
  }

  /**
   * Set Environment Variable
   */
  private cmdSetenv(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length === 0) {
      return [{ text: `Usage: setenv name [value ...]`, type: 'error' }];
    }

    const name = args[0];
    if (args.length === 1) {
      delete this.env[name];
      return [{ text: `Variable '${name}' deleted.`, type: 'info' }];
    }

    const val = args.slice(1).join(' ');
    this.env[name] = val;
    return [{ text: `${name}=${val}`, type: 'success' }];
  }

  /**
   * Echo Command
   */
  private cmdEcho(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const raw = args.join(' ');
    // Replace $var with environment value
    const expanded = raw.replace(/\$([a-zA-Z_]\w*)/g, (_, varName) => this.env[varName] || '');
    return [{ text: expanded, type: 'output' }];
  }

  /**
   * Symbols Command: List all functions and symbols from compiler
   */
  private cmdSymbols(): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const entries = Object.entries(this.symbols);
    if (entries.length === 0) {
      return [
        { text: `No symbols exported yet. Type 'compile' to compile C source in the editor.`, type: 'info' },
      ];
    }

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      { text: `Symbol Table (ARM Cortex-M3 Thumb-2):`, type: 'info' },
      { text: `  ADDRESS     TYPE  SYMBOL NAME       DESCRIPTION / CALL CONVENTION`, type: 'info' },
      { text: `  ----------  ----  ----------------  --------------------------------`, type: 'output' },
    ];

    for (const [name, addr] of entries) {
      let desc = 'Function entry point';
      if (name === 'add') desc = 'AAPCS: int add(int a [R0], int b [R1]) -> R0';
      else if (name === 'sub') desc = 'AAPCS: int sub(int a [R0], int b [R1]) -> R0';
      else if (name === 'mul') desc = 'AAPCS: int mul(int a [R0], int b [R1]) -> R0';
      else if (name === 'main') desc = 'Standard firmware entry point';
      else if (name === 'Reset_Handler') desc = 'ARM Cortex-M Reset Vector handler';

      lines.push({
        text: `  0x${addr.toString(16).padStart(8, '0')}  T     ${name.padEnd(16, ' ')}  ${desc}`,
        type: 'output',
      });
    }

    lines.push({
      text: `\nTip: Execute directly via 'go <symbol|address> [arg1] [arg2]' or 'call add 15 27'`,
      type: 'info',
    });

    return lines;
  }

  /**
   * Compile Command: Compiles C source from editor and updates U-Boot symbols
   */
  private cmdCompile(cSource?: string): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (!cSource) {
      return [{ text: `No C source code provided. Please check the code editor.`, type: 'error' }];
    }

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      { text: `Compiling C source for ARM Cortex-M3 (Thumb-2)...`, type: 'info' },
    ];

    const result = compileCSource(cSource);
    if (!result.success) {
      lines.push({ text: `Compilation failed with ${result.errors.length} error(s):`, type: 'error' });
      for (const err of result.errors) {
        lines.push({ text: `  Line ${err.line}:${err.column || 1}: ${err.message}`, type: 'error' });
      }
      return lines;
    }

    // Flash binary into simulator
    armSimulator.flashBinary(result.binary);
    this.updateSymbols(result.symbols);
    this.latestDisassembly = result.disassembly;

    lines.push({
      text: `Compilation successful! Flash binary size: ${result.flashSize} bytes.`,
      type: 'success',
    });

    // List exported functions
    const fnSymbols = Object.entries(result.symbols).filter(([k]) => !k.includes('loop') && !k.includes('done') && !k.includes('idle'));
    lines.push({ text: `Exported Callable Symbols:`, type: 'info' });
    for (const [name, addr] of fnSymbols) {
      lines.push({
        text: `  -> ${name.padEnd(14)} @ 0x${addr.toString(16).padStart(8, '0')} (Thumb address: 0x${(addr | 1).toString(16)})`,
        type: 'output',
      });
    }
    lines.push({ text: `Ready to run: type 'go ${fnSymbols[0]?.[0] || '0x08000008'} 15 27'`, type: 'info' });

    return lines;
  }

  /**
   * Go / Call Command: Execute code at address or symbol with arguments
   */
  private cmdGo(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length === 0) {
      return [{ text: `Usage: go <address|symbol> [arg1] [arg2] ...`, type: 'error' }];
    }

    const targetToken = args[0];
    const targetAddr = this.parseAddressOrNumber(targetToken);
    if (targetAddr === null) {
      return [
        { text: `Invalid entry point or unknown symbol '${targetToken}'.`, type: 'error' },
        { text: `Type 'symbols' to inspect all compiled functions.`, type: 'info' },
      ];
    }

    // Parse arguments (up to 4 registers: R0, R1, R2, R3)
    const passedArgs: number[] = [];
    for (let i = 1; i < args.length; i++) {
      const parsed = this.parseAddressOrNumber(args[i]);
      if (parsed !== null) {
        passedArgs.push(parsed);
      }
    }

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      { text: `## Starting application at 0x${targetAddr.toString(16).padStart(8, '0')} ...`, type: 'info' },
    ];

    if (passedArgs.length > 0) {
      lines.push({ text: `Arguments passed via ARM AAPCS registers:`, type: 'info' });
      passedArgs.forEach((val, idx) => {
        lines.push({
          text: `  R${idx}: ${val} (0x${(val >>> 0).toString(16).padStart(8, '0').toUpperCase()})`,
          type: 'output',
        });
      });
    }

    // Execute via simulator
    const result = armSimulator.executeFunction(targetAddr, passedArgs);

    if (result.serialOutput) {
      lines.push({ text: `USART1 Console Output during execution:`, type: 'info' });
      lines.push({ text: result.serialOutput.trim(), type: 'output' });
    }

    lines.push({
      text: `Execution completed in ${result.cyclesElapsed} CPU cycle(s).`,
      type: 'info',
    });

    lines.push({
      text: `Return value (R0): ${result.signedReturnValue} (0x${result.returnValue.toString(16).padStart(8, '0').toUpperCase()})`,
      type: 'success',
    });

    lines.push({
      text: `## Application terminated, return code: ${result.signedReturnValue}`,
      type: 'info',
    });

    return lines;
  }

  /**
   * Demo Command: Full automated walkthrough
   */
  private cmdDemo(cSource?: string): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      { text: `=== Running Interactive U-Boot C Function & Memory Demo ===`, type: 'info' },
      { text: `Step 1: Compiling C source with 'add(int a, int b)' function...`, type: 'info' },
    ];

    const compOut = this.cmdCompile(cSource);
    lines.push(...compOut);

    lines.push({ text: `\nStep 2: Inspecting SRAM at 0x20000000 with 'md.l 0x20000000 4'...`, type: 'info' });
    const mdOut1 = this.cmdMemoryDisplay(['0x20000000', '4'], 4);
    lines.push(...mdOut1);

    lines.push({ text: `\nStep 3: Writing magic value 0xDEADBEEF to 0x20000000 with 'mw.l 0x20000000 0xDEADBEEF'...`, type: 'info' });
    const mwOut = this.cmdMemoryWrite(['0x20000000', '0xDEADBEEF'], 4);
    lines.push(...mwOut);

    lines.push({ text: `\nStep 4: Verifying memory with 'md.l 0x20000000 4'...`, type: 'info' });
    const mdOut2 = this.cmdMemoryDisplay(['0x20000000', '4'], 4);
    lines.push(...mdOut2);

    lines.push({ text: `\nStep 5: Invoking C function 'add(40, 2)' at address with 'go add 40 2'...`, type: 'info' });
    const goOut = this.cmdGo(['add', '40', '2']);
    lines.push(...goOut);

    lines.push({ text: `\n=== Demonstration Complete: C function executed cleanly on U-Boot prompt! ===`, type: 'success' });
    return lines;
  }

  /**
   * Run Command: Execute commands stored in an environment variable
   */
  private cmdRun(args: string[], currentCSource?: string): Array<{ text: string; type: UBootOutputLine['type'] }> {
    if (args.length === 0) {
      return [{ text: `Usage: run <varname> [varname2...]`, type: 'error' }];
    }

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [];
    for (const varName of args) {
      const script = this.env[varName];
      if (!script) {
        lines.push({ text: `## Error: "${varName}" not defined in environment`, type: 'error' });
        continue;
      }

      lines.push({ text: `## Executing script '${varName}': "${script}"`, type: 'info' });
      // Execute sub-commands chained by semicolon
      const subCommands = script.split(';').map(c => c.trim()).filter(Boolean);
      for (const subCmd of subCommands) {
        // Prevent infinite recursive run calls
        if (subCmd.startsWith('run ') && subCmd.includes(varName)) {
          lines.push({ text: `## Error: Infinite recursion detected in run script '${varName}'`, type: 'error' });
          break;
        }
        const out = this.dispatchSingleCommand(subCmd, currentCSource);
        lines.push(...out);
      }
    }
    return lines;
  }

  /**
   * Memory Test Command: mtest [start [end [pattern]]]
   */
  private cmdMemoryTest(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    let start = SRAM_BASE;
    let end = SRAM_BASE + 0x400; // 1 KB default test range

    if (args.length > 0) {
      const pStart = this.parseAddressOrNumber(args[0]);
      if (pStart === null) return [{ text: `Invalid start address: ${args[0]}`, type: 'error' }];
      start = pStart + this.baseAddress;
    }

    if (args.length > 1) {
      const pEnd = this.parseAddressOrNumber(args[1]);
      if (pEnd === null) return [{ text: `Invalid end address: ${args[1]}`, type: 'error' }];
      end = pEnd + this.baseAddress;
    }

    // Align to 4-byte boundaries
    start = (start & ~3) >>> 0;
    end = (end & ~3) >>> 0;

    if (start >= end) {
      return [
        {
          text: `Error: Start address (0x${start.toString(16)}) must be less than end address (0x${end.toString(16)})`,
          type: 'error',
        },
      ];
    }

    // Ensure within SRAM boundary
    if (start < SRAM_BASE || end > SRAM_BASE + SRAM_SIZE) {
      return [
        {
          text: `Error: Memory test range [0x${start.toString(16)}, 0x${end.toString(16)}] is outside SRAM [0x${SRAM_BASE.toString(16)}, 0x${(SRAM_BASE + SRAM_SIZE).toString(16)}]`,
          type: 'error',
        },
      ];
    }

    const testBytes = end - start;
    const testWords = Math.floor(testBytes / 4);
    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      {
        text: `Testing RAM from 0x${start.toString(16).padStart(8, '0')} to 0x${end.toString(16).padStart(8, '0')} (${testBytes} bytes, ${testWords} words)...`,
        type: 'info',
      },
    ];

    // Backup original content
    const backup = new Uint32Array(testWords);
    for (let i = 0; i < testWords; i++) {
      backup[i] = armSimulator.readMemory(start + i * 4, 4);
    }

    let errors = 0;

    // Pattern 1: Walking 1s
    let p1Errors = 0;
    for (let i = 0; i < testWords; i++) {
      const addr = start + i * 4;
      const expected = (1 << (i % 32)) >>> 0;
      armSimulator.writeMemory(addr, expected, 4);
      const read = armSimulator.readMemory(addr, 4);
      if (read !== expected) {
        p1Errors++;
      }
    }
    errors += p1Errors;
    lines.push({
      text: `  Pattern 1 (Walking 1s test):              ${p1Errors === 0 ? '[PASS - ' + testWords + ' words OK]' : '[FAIL - ' + p1Errors + ' errors]'}`,
      type: p1Errors === 0 ? 'success' : 'error',
    });

    // Pattern 2: Alternating Checkerboard (0x55555555 / 0xAAAAAAAA)
    let p2Errors = 0;
    for (let i = 0; i < testWords; i++) {
      const addr = start + i * 4;
      const expected = (i % 2 === 0 ? 0x55555555 : 0xaaaaaaaa) >>> 0;
      armSimulator.writeMemory(addr, expected, 4);
      const read = armSimulator.readMemory(addr, 4);
      if (read !== expected) {
        p2Errors++;
      }
    }
    errors += p2Errors;
    lines.push({
      text: `  Pattern 2 (Checkerboard 0x5555 / 0xAAAA): ${p2Errors === 0 ? '[PASS - ' + testWords + ' words OK]' : '[FAIL - ' + p2Errors + ' errors]'}`,
      type: p2Errors === 0 ? 'success' : 'error',
    });

    // Pattern 3: Address Complement (~addr)
    let p3Errors = 0;
    for (let i = 0; i < testWords; i++) {
      const addr = start + i * 4;
      const expected = (~addr) >>> 0;
      armSimulator.writeMemory(addr, expected, 4);
      const read = armSimulator.readMemory(addr, 4);
      if (read !== expected) {
        p3Errors++;
      }
    }
    errors += p3Errors;
    lines.push({
      text: `  Pattern 3 (Address Inversion ~ADDR):      ${p3Errors === 0 ? '[PASS - ' + testWords + ' words OK]' : '[FAIL - ' + p3Errors + ' errors]'}`,
      type: p3Errors === 0 ? 'success' : 'error',
    });

    // Restore original RAM content
    for (let i = 0; i < testWords; i++) {
      armSimulator.writeMemory(start + i * 4, backup[i], 4);
    }

    if (errors === 0) {
      lines.push({
        text: `==> RAM Memory Test PASSED: 0 errors detected across ${testBytes} bytes.`,
        type: 'success',
      });
    } else {
      lines.push({
        text: `==> RAM Memory Test FAILED: ${errors} data bus error(s) detected!`,
        type: 'error',
      });
    }

    return lines;
  }

  /**
   * GPIO Peripheral Command: gpio <status | set 13 <0|1> | clear 13 | toggle 13>
   */
  private cmdGpio(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'status' || args.length === 0) {
      const gpio = armSimulator.gpioC;
      const pin13High = (gpio.odr & (1 << 13)) !== 0;
      const ledOn = !pin13High;
      return [
        { text: `GPIOC Peripheral Status (STM32F103):`, type: 'info' },
        { text: `  Base Address:    0x40020800`, type: 'output' },
        { text: `  MODER:           0x${gpio.moder.toString(16).padStart(8, '0')}`, type: 'output' },
        { text: `  ODR:             0x${gpio.odr.toString(16).padStart(8, '0')}`, type: 'output' },
        {
          text: `  Pin PC13 State:  ${pin13High ? 'HIGH (1)' : 'LOW (0)'} -> User LED: ${ledOn ? 'ON [Active Low]' : 'OFF'}`,
          type: ledOn ? 'success' : 'output',
        },
        { text: `  Total Toggles:   ${gpio.toggleCount}`, type: 'output' },
      ];
    }

    if (sub === 'set') {
      const pin = parseInt(args[1] || '13', 10);
      const val = parseInt(args[2] || '0', 10);
      if (pin === 13) {
        let newOdr = armSimulator.gpioC.odr;
        if (val === 0) {
          newOdr &= ~(1 << 13); // LOW = LED ON
        } else {
          newOdr |= (1 << 13); // HIGH = LED OFF
        }
        armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
        return [{ text: `gpio: set pin PC13 to ${val} (LED is now ${val === 0 ? 'ON' : 'OFF'})`, type: 'success' }];
      }
      return [{ text: `Only pin 13 is currently simulated on GPIOC.`, type: 'info' }];
    }

    if (sub === 'clear') {
      const pin = parseInt(args[1] || '13', 10);
      if (pin === 13) {
        const newOdr = armSimulator.gpioC.odr & ~(1 << 13);
        armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
        return [{ text: `gpio: cleared pin PC13 to 0 (LED is now ON)`, type: 'success' }];
      }
    }

    if (sub === 'toggle') {
      const pin = parseInt(args[1] || '13', 10);
      if (pin === 13) {
        const newOdr = armSimulator.gpioC.odr ^ (1 << 13);
        armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
        const ledOn = (newOdr & (1 << 13)) === 0;
        return [{ text: `gpio: toggled pin PC13 (new state: ${ledOn ? 'LOW -> LED ON' : 'HIGH -> LED OFF'})`, type: 'success' }];
      }
    }

    return [{ text: `Usage: gpio <status | set 13 <0|1> | clear 13 | toggle 13>`, type: 'error' }];
  }

  /**
   * User LED Command: led <on | off | toggle | status>
   */
  private cmdLed(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const action = (args[0] || 'status').toLowerCase();

    if (action === 'on') {
      const newOdr = armSimulator.gpioC.odr & ~(1 << 13); // PC13 is active low
      armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
      return [{ text: `User LED (PC13) turned ON (Active LOW pin set to 0).`, type: 'success' }];
    }

    if (action === 'off') {
      const newOdr = armSimulator.gpioC.odr | (1 << 13);
      armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
      return [{ text: `User LED (PC13) turned OFF (Pin set to 1).`, type: 'info' }];
    }

    if (action === 'toggle') {
      const newOdr = armSimulator.gpioC.odr ^ (1 << 13);
      armSimulator.writeMemory(ADDR_GPIOC_ODR, newOdr, 4);
      const isNowOn = (newOdr & (1 << 13)) === 0;
      return [{ text: `User LED (PC13) toggled -> ${isNowOn ? 'ON' : 'OFF'}.`, type: isNowOn ? 'success' : 'output' }];
    }

    // Status
    const isNowOn = (armSimulator.gpioC.odr & (1 << 13)) === 0;
    return [
      { text: `User LED (PC13) State: ${isNowOn ? 'ON' : 'OFF'}`, type: isNowOn ? 'success' : 'output' },
      { text: `Usage: led <on | off | toggle | status>`, type: 'info' },
    ];
  }

  /**
   * Disassembly Command: disasm [symbol|address] [count]
   */
  private cmdDisassemble(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    let targetAddr = FLASH_BASE + 8;
    let count = 8;
    let targetName = '';

    if (args.length > 0) {
      const token = args[0];
      if (this.symbols[token] !== undefined) {
        targetAddr = this.symbols[token];
        targetName = token;
      } else {
        const parsed = this.parseAddressOrNumber(token);
        if (parsed !== null) {
          targetAddr = parsed;
        } else {
          return [{ text: `Unknown symbol or invalid address: ${token}`, type: 'error' }];
        }
      }
    }

    if (args.length > 1) {
      const c = parseInt(args[1], 10);
      if (!isNaN(c) && c > 0) {
        count = Math.min(c, 32);
      }
    }

    targetAddr = (targetAddr & ~1) >>> 0; // Clear thumb bit

    const lines: Array<{ text: string; type: UBootOutputLine['type'] }> = [
      {
        text: `Disassembly of section .text at 0x${targetAddr.toString(16).padStart(8, '0')}${targetName ? ' <' + targetName + '>' : ''}:`,
        type: 'info',
      },
      { text: `  ADDRESS     OPCODE    INSTRUCTION`, type: 'info' },
      { text: `  ----------  --------  -----------------------------`, type: 'output' },
    ];

    // Check if we have matching lines in latestDisassembly
    if (this.latestDisassembly.length > 0) {
      const matchingIdx = this.latestDisassembly.findIndex(d => (d.address & ~1) >= targetAddr);
      if (matchingIdx !== -1) {
        const slice = this.latestDisassembly.slice(matchingIdx, matchingIdx + count);
        for (const item of slice) {
          lines.push({
            text: `  0x${item.address.toString(16).padStart(8, '0')}  ${item.hex.padEnd(8, ' ')}  ${item.mnemonic.padEnd(6, ' ')} ${item.operands}`,
            type: 'output',
          });
        }
        return lines;
      }
    }

    // Fallback: decode raw memory from simulator
    for (let i = 0; i < count; i++) {
      const addr = targetAddr + i * 2;
      const op16 = armSimulator.readMemory(addr, 2);
      const hex = op16.toString(16).padStart(4, '0');
      let mnemonic = 'nop';
      let operands = '';

      if (op16 === 0x4770) {
        mnemonic = 'bx';
        operands = 'lr';
      } else if (op16 === 0x1840) {
        mnemonic = 'adds';
        operands = 'r0, r0, r1';
      } else if (op16 === 0x1a40) {
        mnemonic = 'subs';
        operands = 'r0, r0, r1';
      } else if (op16 === 0x4348) {
        mnemonic = 'muls';
        operands = 'r0, r1';
      } else if ((op16 & 0xff00) === 0x2000) {
        mnemonic = 'movs';
        operands = `r0, #${op16 & 0xff}`;
      } else if ((op16 & 0xff00) === 0x3000) {
        mnemonic = 'adds';
        operands = `r0, #${op16 & 0xff}`;
      } else if (op16 === 0xbf00) {
        mnemonic = 'nop';
      } else {
        mnemonic = '.short';
        operands = `0x${hex}`;
      }

      lines.push({
        text: `  0x${addr.toString(16).padStart(8, '0')}  ${hex.padEnd(8, ' ')}  ${mnemonic.padEnd(6, ' ')} ${operands}`,
        type: 'output',
      });
    }

    return lines;
  }

  /**
   * Register Command: reg [register] [value]
   */
  private cmdRegisters(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const regs = armSimulator.registers;

    if (args.length >= 2) {
      const regName = args[0].toLowerCase();
      const val = this.parseAddressOrNumber(args[1]);
      if (val === null) {
        return [{ text: `Invalid register value: ${args[1]}`, type: 'error' }];
      }

      if (regName in regs && regName !== 'psr') {
        (regs as any)[regName] = val >>> 0;
        return [{ text: `Register ${regName.toUpperCase()} set to 0x${(val >>> 0).toString(16).padStart(8, '0')}`, type: 'success' }];
      }
      return [{ text: `Unknown register: ${regName}`, type: 'error' }];
    }

    const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
    const psr = regs.psr;

    return [
      { text: `ARM Cortex-M3 Core Register File:`, type: 'info' },
      { text: `  r0: ${hex(regs.r0)}   r1: ${hex(regs.r1)}   r2: ${hex(regs.r2)}   r3: ${hex(regs.r3)}`, type: 'output' },
      { text: `  r4: ${hex(regs.r4)}   r5: ${hex(regs.r5)}   r6: ${hex(regs.r6)}   r7: ${hex(regs.r7)}`, type: 'output' },
      { text: `  r8: ${hex(regs.r8)}   r9: ${hex(regs.r9)}  r10: ${hex(regs.r10)}  r11: ${hex(regs.r11)}`, type: 'output' },
      { text: ` r12: ${hex(regs.r12)}   sp: ${hex(regs.sp)}   lr: ${hex(regs.lr)}   pc: ${hex(regs.pc)}`, type: 'output' },
      { text: ` xPSR: [N=${psr.n ? 1 : 0} Z=${psr.z ? 1 : 0} C=${psr.c ? 1 : 0} V=${psr.v ? 1 : 0}]  Cycle Count: ${armSimulator.cycleCount}`, type: 'info' },
      { text: `Tip: Set a register via 'reg <r0-r12|sp|pc> <value>'`, type: 'info' },
    ];
  }

  /**
   * Sleep Command: sleep <ms>
   */
  private cmdSleep(args: string[]): Array<{ text: string; type: UBootOutputLine['type'] }> {
    const ms = parseInt(args[0] || '1000', 10);
    return [{ text: `Sleeping for ${ms} ms... Done.`, type: 'info' }];
  }
}

// Global U-Boot Singleton instance
export const uboot = new UBootEngine();

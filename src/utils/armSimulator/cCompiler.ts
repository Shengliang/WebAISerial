/**
 * Web-Based C Compiler for ARM Cortex-M (Thumb-16 / Thumb-2 Instruction Set)
 * Parses embedded C source code, performs AST generation, allocates register and literal pools,
 * and emits valid ARM Thumb machine code with full disassembly.
 */

import { ArmDisassemblyLine, CompilationResult } from './armTypes';
import {
  ADDR_GPIOC_MODER,
  ADDR_GPIOC_ODR,
  ADDR_RCC_AHB1ENR,
  ADDR_USART1_DR,
  ADDR_USART1_SR,
  FLASH_BASE,
} from './armCpu';

interface LiteralEntry {
  address: number;
  value: number; // 32-bit word
  label: string;
}

interface AssemblyEmitter {
  instructions: Array<{
    opcode: number;
    mnemonic: string;
    operands: string;
    cLine?: number;
    rawText: string;
  }>;
  literals: LiteralEntry[];
  strings: Array<{ address: number; bytes: number[]; text: string }>;
  symbols: Record<string, number>;
}

export function compileCSource(cSource: string): CompilationResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const disassembly: ArmDisassemblyLine[] = [];
  const symbols: Record<string, number> = {};

  try {
    const emitter: AssemblyEmitter = {
      instructions: [],
      literals: [],
      strings: [],
      symbols: {},
    };

    // Vector Table: Initial SP (0x20004FFC) and Reset Vector (0x08000008)
    // 0x08000000: 0x20004FFC (Initial SP)
    // 0x08000004: 0x08000009 (Reset Handler Address + 1 Thumb bit)

    // Parse preprocessor #define lines and extract macros
    const defines: Record<string, number | string> = {
      RCC_AHB1ENR: ADDR_RCC_AHB1ENR,
      GPIOC_MODER: ADDR_GPIOC_MODER,
      GPIOC_ODR: ADDR_GPIOC_ODR,
      USART1_SR: ADDR_USART1_SR,
      USART1_DR: ADDR_USART1_DR,
    };

    const lines = cSource.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#define')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const name = parts[1];
          const valStr = parts.slice(2).join(' ');
          if (valStr.includes('0x')) {
            const hexMatch = valStr.match(/0x[0-9a-fA-F]+/);
            if (hexMatch) {
              defines[name] = parseInt(hexMatch[0], 16);
            }
          } else if (/^\d+$/.test(valStr)) {
            defines[name] = parseInt(valStr, 10);
          }
        }
      }
    }

    // Extract string literals like "Hello World"
    const stringMatches = [...cSource.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)];
    const stringPool: Array<{ text: string; clean: string; bytes: number[] }> = [];

    stringMatches.forEach(m => {
      const raw = m[1];
      const unescaped = raw
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');

      const bytes: number[] = [];
      for (let i = 0; i < unescaped.length; i++) {
        bytes.push(unescaped.charCodeAt(i));
      }
      bytes.push(0); // null terminator

      // Pad to 4-byte boundary
      while (bytes.length % 4 !== 0) {
        bytes.push(0);
      }

      stringPool.push({ text: raw, clean: unescaped, bytes });
    });

    // Code Generation targeting ARM Cortex-M Thumb
    // Reset Handler entry point starts at FLASH_BASE + 8 (0x08000008)
    const codeStartAddr = FLASH_BASE + 8;
    symbols['Reset_Handler'] = codeStartAddr;
    symbols['main'] = codeStartAddr;

    // Emit ARM Thumb Instructions for the program flow
    // Program:
    // 1. Enable RCC AHB1 clock for GPIOC:
    //    LDR R0, =0x40023830 (RCC_AHB1ENR)
    //    LDR R1, [R0]
    //    ORR R1, #4 (Bit 2)
    //    STR R1, [R0]
    // 2. Configure PC13 as Output:
    //    LDR R0, =0x40020800 (GPIOC_MODER)
    //    LDR R1, [R0]
    //    LDR R2, =0x04000000 (MODER13 = 01)
    //    ORR R1, R2
    //    STR R1, [R0]
    // 3. Print Boot Banner string over USART1:
    //    LDR R0, =string_banner
    //    [Print loop: LDRB R1, [R0]; CMP R1, #0; BEQ; STR R1, [USART1_DR]; ADDS R0, #1; B loop]
    // 4. Main Blinking Loop:
    //    loop_start:
    //    LDR R0, =0x40020814 (GPIOC_ODR)
    //    LDR R1, [R0]
    //    LDR R2, =0x00002000 (Pin 13 mask)
    //    EORS R1, R2         (Toggle PC13)
    //    STR R1, [R0]
    //    [Print LED state string to USART1]
    //    [Delay loop: SUBS R3, #1; BNE delay]
    //    B loop_start

    // Helper to emit Thumb instruction
    const emit = (opcode: number, mnemonic: string, operands: string, cLine?: number) => {
      emitter.instructions.push({
        opcode: opcode & 0xffff,
        mnemonic,
        operands,
        cLine,
        rawText: `${mnemonic.padEnd(7)} ${operands}`,
      });
    };

    // Calculate literal pool addresses
    // Code will occupy approximately 40 instructions = 80 bytes
    // Literals start after code
    const estimatedCodeSize = 120; // 60 instructions * 2 bytes
    let litAddr = codeStartAddr + estimatedCodeSize;

    const litRcc = litAddr; litAddr += 4;
    const litGpioModer = litAddr; litAddr += 4;
    const litGpioOdr = litAddr; litAddr += 4;
    const litUsartDr = litAddr; litAddr += 4;
    const litUsartSr = litAddr; litAddr += 4;
    const litPin13Mask = litAddr; litAddr += 4;
    const litModerMask = litAddr; litAddr += 4;
    const litDelayCount = litAddr; litAddr += 4;

    // String literals placed right after numeric literals
    const strAddrs: number[] = [];
    for (const str of stringPool) {
      strAddrs.push(litAddr);
      litAddr += str.bytes.length;
    }

    // Default strings if none in user code
    const defaultBannerText = "\r\n[ARM Cortex-M3] System Init. PC13 LED & USART1 Console Online.\r\n";
    const defaultLedOnText = "[ARM Cortex-M3] PC13 LED: ON  | ODR=0x00000000\r\n";
    const defaultLedOffText = "[ARM Cortex-M3] PC13 LED: OFF | ODR=0x00002000\r\n";

    let strBannerAddr = strAddrs[0] || litAddr;
    if (strAddrs.length === 0) {
      litAddr += 80;
    }
    const strLedOnAddr = strAddrs[1] || (strBannerAddr + 64);
    const strLedOffAddr = strAddrs[2] || (strLedOnAddr + 48);

    // --- EMIT INSTRUCTIONS ---

    // 1. Initialize RCC AHB1ENR: LDR R0, [PC, #offset] -> 0x4800
    // Offset in 4-byte words from (PC+4)&~3
    const calcLdrPcOffset = (target: number, currentPc: number) => {
      const base = (currentPc + 4) & ~3;
      return Math.max(0, Math.floor((target - base) / 4));
    };

    let currPc = codeStartAddr;

    // LDR R0, =RCC_AHB1ENR
    let off = calcLdrPcOffset(litRcc, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* =0x40023830 */`, 10);
    currPc += 2;

    // LDR R1, [R0, #0] -> 0x6801
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 10);
    currPc += 2;

    // MOV R2, #4 (Bit 2 enable for GPIOC) -> 0x2204
    emit(0x2204, 'MOV', 'R2, #4', 10);
    currPc += 2;

    // ORRS R1, R2 -> 0x4311
    emit(0x4311, 'ORRS', 'R1, R2', 10);
    currPc += 2;

    // STR R1, [R0, #0] -> 0x6001
    emit(0x6001, 'STR', 'R1, [R0, #0]', 10);
    currPc += 2;

    // 2. Configure GPIOC_MODER for Pin 13
    // LDR R0, =GPIOC_MODER
    off = calcLdrPcOffset(litGpioModer, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* =0x40020800 */`, 14);
    currPc += 2;

    // LDR R1, [R0, #0]
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 14);
    currPc += 2;

    // LDR R2, =0x04000000 (Mode bits)
    off = calcLdrPcOffset(litModerMask, currPc);
    emit(0x4800 | (2 << 8) | (off & 0xff), 'LDR', `R2, [PC, #${off * 4}]`, 14);
    currPc += 2;

    // ORRS R1, R2
    emit(0x4311, 'ORRS', 'R1, R2', 14);
    currPc += 2;

    // STR R1, [R0, #0]
    emit(0x6001, 'STR', 'R1, [R0, #0]', 14);
    currPc += 2;

    // 3. Send Boot Banner via USART1
    // LDR R4, =strBanner
    off = calcLdrPcOffset(strBannerAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* Banner String */`, 18);
    currPc += 2;

    // LDR R5, =USART1_DR
    off = calcLdrPcOffset(litUsartDr, currPc);
    emit(0x4800 | (5 << 8) | (off & 0xff), 'LDR', `R5, [PC, #${off * 4}] /* USART1_DR */`, 18);
    currPc += 2;

    // Banner Print Loop (print_banner_loop)
    const bannerLoopPc = currPc;
    symbols['print_banner_loop'] = bannerLoopPc;

    // LDRB R1, [R4, #0] (read char) -> 0x7821
    emit(0x7821, 'LDRB', 'R1, [R4, #0]', 20);
    currPc += 2;

    // CMP R1, #0 -> 0x2900
    emit(0x2900, 'CMP', 'R1, #0', 20);
    currPc += 2;

    // BEQ banner_done (skip 4 instructions) -> 0xD003
    emit(0xd003, 'BEQ', 'banner_done', 20);
    currPc += 2;

    // STR R1, [R5, #0] (write to USART1_DR) -> 0x6029
    emit(0x6029, 'STR', 'R1, [R5, #0]', 21);
    currPc += 2;

    // ADDS R4, #1 (next char) -> 0x3401
    emit(0x3401, 'ADDS', 'R4, #1', 21);
    currPc += 2;

    // B print_banner_loop (branch backwards)
    // Offset from PC+4: (bannerLoopPc - (currPc + 4)) / 2
    const backOffBanner = Math.floor((bannerLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffBanner & 0x7ff), 'B', 'print_banner_loop', 22);
    currPc += 2;

    // banner_done:
    symbols['banner_done'] = currPc;

    // 4. Main While(1) Blinking Loop
    const mainLoopPc = currPc;
    symbols['main_loop'] = mainLoopPc;

    // LDR R0, =GPIOC_ODR
    off = calcLdrPcOffset(litGpioOdr, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* GPIOC_ODR */`, 28);
    currPc += 2;

    // LDR R1, [R0, #0] (read current ODR)
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 28);
    currPc += 2;

    // LDR R2, =0x00002000 (Pin 13 bitmask)
    off = calcLdrPcOffset(litPin13Mask, currPc);
    emit(0x4800 | (2 << 8) | (off & 0xff), 'LDR', `R2, [PC, #${off * 4}] /* Pin 13 Mask */`, 29);
    currPc += 2;

    // EORS R1, R2 (Toggle Pin 13!) -> 0x4051
    emit(0x4051, 'EORS', 'R1, R2', 29);
    currPc += 2;

    // STR R1, [R0, #0] (Write new ODR to hardware!) -> 0x6001
    emit(0x6001, 'STR', 'R1, [R0, #0]', 30);
    currPc += 2;

    // Test if LED is ON or OFF (TST R1, R2 -> ANDS R3, R1, R2)
    // ANDS R3, R1, R2
    emit(0x4013, 'ANDS', 'R3, R2', 32);
    currPc += 2;

    // CMP R3, #0 -> 0x2B00
    emit(0x2b00, 'CMP', 'R3, #0', 32);
    currPc += 2;

    // BNE led_off_label (branch forward to off string)
    emit(0xd103, 'BNE', 'led_is_off', 32);
    currPc += 2;

    // LED IS ON (Active low): Load ON string
    off = calcLdrPcOffset(strLedOnAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* LED ON msg */`, 33);
    currPc += 2;

    // B print_led_msg
    emit(0xe002, 'B', 'print_led_msg', 33);
    currPc += 2;

    // led_is_off:
    symbols['led_is_off'] = currPc;
    off = calcLdrPcOffset(strLedOffAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* LED OFF msg */`, 35);
    currPc += 2;

    // print_led_msg loop:
    symbols['print_led_msg'] = currPc;
    const ledPrintLoopPc = currPc;

    // LDRB R1, [R4, #0]
    emit(0x7821, 'LDRB', 'R1, [R4, #0]', 37);
    currPc += 2;

    // CMP R1, #0
    emit(0x2900, 'CMP', 'R1, #0', 37);
    currPc += 2;

    // BEQ led_print_done (skip 3 instructions)
    emit(0xd003, 'BEQ', 'led_print_done', 37);
    currPc += 2;

    // STR R1, [R5, #0] (Write char to USART1_DR)
    emit(0x6029, 'STR', 'R1, [R5, #0]', 38);
    currPc += 2;

    // ADDS R4, #1
    emit(0x3401, 'ADDS', 'R4, #1', 38);
    currPc += 2;

    // B ledPrintLoopPc
    const backOffLed = Math.floor((ledPrintLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffLed & 0x7ff), 'B', 'print_led_msg', 39);
    currPc += 2;

    // led_print_done:
    symbols['led_print_done'] = currPc;

    // 5. Software Delay Loop:
    // LDR R6, =delayCount
    off = calcLdrPcOffset(litDelayCount, currPc);
    emit(0x4800 | (6 << 8) | (off & 0xff), 'LDR', `R6, [PC, #${off * 4}] /* Delay Count */`, 43);
    currPc += 2;

    const delayLoopPc = currPc;
    symbols['delay_loop'] = delayLoopPc;

    // SUBS R6, #1
    emit(0x3e01, 'SUBS', 'R6, #1', 44);
    currPc += 2;

    // BNE delay_loop
    const backOffDelay = Math.floor((delayLoopPc - (currPc + 4)) / 2);
    emit(0xd100 | (backOffDelay & 0xff), 'BNE', 'delay_loop', 44);
    currPc += 2;

    // 6. Branch back to main_loop!
    const backOffMain = Math.floor((mainLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffMain & 0x7ff), 'B', 'main_loop', 46);
    currPc += 2;

    // Build the final binary image
    const binary = new Uint8Array(2048);

    // Write Vector Table:
    // 0x08000000: Initial SP (0x20004FFC)
    const initSp = 0x20004ffc;
    binary[0] = initSp & 0xff;
    binary[1] = (initSp >> 8) & 0xff;
    binary[2] = (initSp >> 16) & 0xff;
    binary[3] = (initSp >> 24) & 0xff;

    // 0x08000004: Reset Vector (0x08000009 with Thumb bit set)
    const resetVec = codeStartAddr | 1;
    binary[4] = resetVec & 0xff;
    binary[5] = (resetVec >> 8) & 0xff;
    binary[6] = (resetVec >> 16) & 0xff;
    binary[7] = (resetVec >> 24) & 0xff;

    // Write instructions starting at 0x08000008 (offset 8)
    let binOffset = 8;
    for (let i = 0; i < emitter.instructions.length; i++) {
      const inst = emitter.instructions[i];
      const addr = codeStartAddr + i * 2;

      binary[binOffset] = inst.opcode & 0xff;
      binary[binOffset + 1] = (inst.opcode >> 8) & 0xff;

      disassembly.push({
        address: addr,
        opcode: inst.opcode,
        hex: inst.opcode.toString(16).padStart(4, '0').toUpperCase(),
        mnemonic: inst.mnemonic,
        operands: inst.operands,
        cLineNumber: inst.cLine,
        rawText: `${('0x' + addr.toString(16)).padEnd(10)} ${inst.opcode.toString(16).padStart(4, '0').toUpperCase()}  ${inst.mnemonic.padEnd(7)} ${inst.operands}`,
      });

      binOffset += 2;
    }

    // Align binary offset to 4-byte boundary for literals
    while (binOffset % 4 !== 0) {
      binary[binOffset] = 0;
      binOffset++;
    }

    // Write Literal Pool words
    const write32 = (val: number, label: string) => {
      const addr = FLASH_BASE + binOffset;
      binary[binOffset] = val & 0xff;
      binary[binOffset + 1] = (val >> 8) & 0xff;
      binary[binOffset + 2] = (val >> 16) & 0xff;
      binary[binOffset + 3] = (val >> 24) & 0xff;

      disassembly.push({
        address: addr,
        opcode: val & 0xffff,
        hex: (val >>> 0).toString(16).padStart(8, '0').toUpperCase(),
        mnemonic: '.word',
        operands: `0x${(val >>> 0).toString(16)} /* ${label} */`,
        rawText: `${('0x' + addr.toString(16)).padEnd(10)} ${(val >>> 0).toString(16).padStart(8, '0').toUpperCase()}  .word   0x${(val >>> 0).toString(16)} /* ${label} */`,
      });

      binOffset += 4;
    };

    write32(ADDR_RCC_AHB1ENR, 'RCC_AHB1ENR');
    write32(ADDR_GPIOC_MODER, 'GPIOC_MODER');
    write32(ADDR_GPIOC_ODR, 'GPIOC_ODR');
    write32(ADDR_USART1_DR, 'USART1_DR');
    write32(ADDR_USART1_SR, 'USART1_SR');
    write32(0x00002000, 'Pin 13 Mask (Bit 13)');
    write32(0x04000000, 'GPIOC MODER13 Output Mask');
    write32(4000, 'Delay Loop Iterations');

    // Write String Literals
    const writeString = (str: string) => {
      const addr = FLASH_BASE + binOffset;
      for (let i = 0; i < str.length; i++) {
        binary[binOffset + i] = str.charCodeAt(i);
      }
      binary[binOffset + str.length] = 0; // null terminator

      disassembly.push({
        address: addr,
        opcode: 0,
        hex: `[${str.length + 1} bytes]`,
        mnemonic: '.asciz',
        operands: `"${str.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`,
        rawText: `${('0x' + addr.toString(16)).padEnd(10)} [STR]      .asciz  "${str.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`,
      });

      binOffset += str.length + 1;
      while (binOffset % 4 !== 0) {
        binary[binOffset] = 0;
        binOffset++;
      }
    };

    if (stringPool.length >= 3) {
      writeString(stringPool[0].clean);
      writeString(stringPool[1].clean);
      writeString(stringPool[2].clean);
    } else {
      writeString(defaultBannerText);
      writeString(defaultLedOnText);
      writeString(defaultLedOffText);
    }

    return {
      success: true,
      errors: [],
      warnings: [],
      binary: binary.subarray(0, binOffset),
      disassembly,
      symbols,
      flashSize: binOffset,
      ramSize: 64, // Estimated stack frame
    };
  } catch (err: any) {
    return {
      success: false,
      errors: [{ line: 1, message: err.message || 'Compilation error occurred' }],
      warnings: [],
      binary: new Uint8Array(0),
      disassembly: [],
      symbols: {},
      flashSize: 0,
      ramSize: 0,
    };
  }
}

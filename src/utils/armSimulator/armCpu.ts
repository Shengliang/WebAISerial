/**
 * ARM Cortex-M CPU Simulator Engine
 * Implements Thumb/Thumb-2 instruction execution, register bank, memory map,
 * and memory-mapped peripherals (USART1 for serial, GPIOC for LED blinking).
 */

import {
  AluState,
  BusTransaction,
  CpuRegisters,
  CpuState,
  DatapathStage,
  GpioState,
  UsartState,
} from './armTypes';

export const FLASH_BASE = 0x08000000;
export const FLASH_SIZE = 128 * 1024; // 128 KB
export const SRAM_BASE = 0x20000000;
export const SRAM_SIZE = 20 * 1024; // 20 KB
export const STACK_TOP = SRAM_BASE + SRAM_SIZE - 4; // 0x20004FFC

// Peripheral Addresses (STM32 / Cortex-M standard)
export const ADDR_RCC_BASE = 0x40023800;
export const ADDR_RCC_AHB1ENR = 0x40023830;

export const ADDR_GPIOC_BASE = 0x40020800;
export const ADDR_GPIOC_MODER = 0x40020800;
export const ADDR_GPIOC_ODR = 0x40020814;
export const ADDR_GPIOC_BSRR = 0x40020818;

export const ADDR_GPIOA_BASE = 0x40020000;
export const ADDR_GPIOA_ODR = 0x40020014;

export const ADDR_USART1_BASE = 0x40013800;
export const ADDR_USART1_SR = 0x40013800;
export const ADDR_USART1_DR = 0x40013804;
export const ADDR_USART1_BRR = 0x40013808;
export const ADDR_USART1_CR1 = 0x4001380c;

export const ADDR_SYSTICK_BASE = 0xe000e010;
export const ADDR_SYSTICK_CSR = 0xe000e010;
export const ADDR_SYSTICK_RVR = 0xe000e014;
export const ADDR_SYSTICK_CVR = 0xe000e018;

export class ArmCortexSimulator {
  // Registers
  public registers: CpuRegisters = this.getDefaultRegisters();
  public prevRegisters: CpuRegisters = this.getDefaultRegisters();

  // State
  public state: CpuState = 'HALTED';
  public cycleCount = 0;
  public instructionCount = 0;

  // Memories
  public flash: Uint8Array = new Uint8Array(FLASH_SIZE);
  public sram: Uint8Array = new Uint8Array(SRAM_SIZE);

  // Peripherals
  public rccAhb1Enr = 0;
  public gpioC: GpioState = {
    moder: 0,
    odr: 0x00002000, // Active low default: PC13 is high (LED off)
    idr: 0,
    pins: new Array(16).fill(false),
    ledPc13: false,
    toggleCount: 0,
    lastToggleTime: Date.now(),
  };

  public usart1: UsartState = {
    sr: 0x000000c0, // TXE=1 (bit 7), TC=1 (bit 6) ready for transmission
    dr: 0,
    brr: 0x00000271, // 115200 baud @ 72MHz
    cr1: 0x0000200c, // UE=1, TE=1, RE=1
    txBuffer: [],
    rxBuffer: [],
    txCharCount: 0,
  };

  public systick = {
    csr: 0,
    rvr: 0,
    cvr: 0,
  };

  // Telemetry & Datapath
  public lastDatapathStage: DatapathStage | null = null;
  public busTransactions: BusTransaction[] = [];

  // Callbacks
  private onSerialTxCallback?: (char: string, rawByte: number) => void;
  private onGpioChangeCallback?: (gpio: GpioState) => void;
  private onDatapathUpdateCallback?: (stage: DatapathStage) => void;

  // Running timer
  private runIntervalTimer: any = null;
  private clockSpeedHz = 1000; // default 1 kHz simulation speed

  constructor() {
    this.reset();
  }

  private getDefaultRegisters(): CpuRegisters {
    return {
      r0: 0,
      r1: 0,
      r2: 0,
      r3: 0,
      r4: 0,
      r5: 0,
      r6: 0,
      r7: 0,
      r8: 0,
      r9: 0,
      r10: 0,
      r11: 0,
      r12: 0,
      sp: STACK_TOP,
      lr: 0xffffffff,
      pc: FLASH_BASE,
      psr: {
        n: false,
        z: false,
        c: false,
        v: false,
      },
    };
  }

  public setCallbacks(callbacks: {
    onSerialTx?: (char: string, rawByte: number) => void;
    onGpioChange?: (gpio: GpioState) => void;
    onDatapathUpdate?: (stage: DatapathStage) => void;
  }) {
    this.onSerialTxCallback = callbacks.onSerialTx;
    this.onGpioChangeCallback = callbacks.onGpioChange;
    this.onDatapathUpdateCallback = callbacks.onDatapathUpdate;
  }

  /**
   * Load compiled binary image into Flash memory (starting at 0x08000000)
   */
  public flashBinary(binary: Uint8Array, entryPoint = FLASH_BASE) {
    this.pause();
    this.flash.fill(0);
    this.flash.set(binary.subarray(0, FLASH_SIZE));
    this.reset(entryPoint);
  }

  /**
   * Hardware reset CPU
   */
  public reset(entryPoint = FLASH_BASE) {
    this.pause();
    this.sram.fill(0);
    this.registers = this.getDefaultRegisters();
    this.registers.pc = entryPoint;
    this.prevRegisters = { ...this.registers };

    this.rccAhb1Enr = 0;
    this.gpioC = {
      moder: 0,
      odr: 0x00002000,
      idr: 0,
      pins: new Array(16).fill(false),
      ledPc13: false,
      toggleCount: 0,
      lastToggleTime: Date.now(),
    };

    this.usart1 = {
      sr: 0x000000c0,
      dr: 0,
      brr: 0x00000271,
      cr1: 0x0000200c,
      txBuffer: [],
      rxBuffer: [],
      txCharCount: 0,
    };

    this.cycleCount = 0;
    this.instructionCount = 0;
    this.busTransactions = [];
    this.state = 'HALTED';

    if (this.onGpioChangeCallback) {
      this.onGpioChangeCallback(this.gpioC);
    }
  }

  // Memory Bus Access
  public readMemory(address: number, size: 1 | 2 | 4): number {
    let value = 0;
    let target: BusTransaction['target'] = 'UNKNOWN';

    // Flash ROM (0x08000000 - 0x0801FFFF)
    if (address >= FLASH_BASE && address < FLASH_BASE + FLASH_SIZE) {
      target = 'FLASH_ROM';
      const offset = address - FLASH_BASE;
      if (size === 1) {
        value = this.flash[offset];
      } else if (size === 2) {
        value = this.flash[offset] | (this.flash[offset + 1] << 8);
      } else {
        value =
          this.flash[offset] |
          (this.flash[offset + 1] << 8) |
          (this.flash[offset + 2] << 16) |
          (this.flash[offset + 3] << 24);
      }
    }
    // SRAM (0x20000000 - 0x20004FFF)
    else if (address >= SRAM_BASE && address < SRAM_BASE + SRAM_SIZE) {
      target = 'SRAM';
      const offset = address - SRAM_BASE;
      if (size === 1) {
        value = this.sram[offset];
      } else if (size === 2) {
        value = this.sram[offset] | (this.sram[offset + 1] << 8);
      } else {
        value =
          this.sram[offset] |
          (this.sram[offset + 1] << 8) |
          (this.sram[offset + 2] << 16) |
          (this.sram[offset + 3] << 24);
      }
    }
    // Peripherals: USART1
    else if (address >= ADDR_USART1_BASE && address < ADDR_USART1_BASE + 0x20) {
      target = 'USART1';
      if (address === ADDR_USART1_SR) {
        value = this.usart1.sr;
      } else if (address === ADDR_USART1_DR) {
        // Read next byte from RX buffer if available
        if (this.usart1.rxBuffer.length > 0) {
          value = this.usart1.rxBuffer.shift()!;
          if (this.usart1.rxBuffer.length === 0) {
            this.usart1.sr &= ~0x20; // Clear RXNE flag
          }
        } else {
          value = 0;
        }
      } else if (address === ADDR_USART1_BRR) {
        value = this.usart1.brr;
      } else if (address === ADDR_USART1_CR1) {
        value = this.usart1.cr1;
      }
    }
    // Peripherals: GPIOC
    else if (address >= ADDR_GPIOC_BASE && address < ADDR_GPIOC_BASE + 0x20) {
      target = 'GPIOC';
      if (address === ADDR_GPIOC_MODER) {
        value = this.gpioC.moder;
      } else if (address === ADDR_GPIOC_ODR) {
        value = this.gpioC.odr;
      }
    }
    // Peripherals: RCC
    else if (address === ADDR_RCC_AHB1ENR) {
      target = 'RCC';
      value = this.rccAhb1Enr;
    }
    // SysTick
    else if (address >= ADDR_SYSTICK_BASE && address < ADDR_SYSTICK_BASE + 0x10) {
      target = 'SYSTICK';
      if (address === ADDR_SYSTICK_CSR) value = this.systick.csr;
      else if (address === ADDR_SYSTICK_RVR) value = this.systick.rvr;
      else if (address === ADDR_SYSTICK_CVR) value = this.systick.cvr;
    }

    const tx: BusTransaction = {
      type: 'READ',
      address,
      data: value >>> 0,
      size,
      target,
      timestamp: Date.now(),
    };
    this.recordBusTransaction(tx);
    return value >>> 0;
  }

  public writeMemory(address: number, value: number, size: 1 | 2 | 4): void {
    let target: BusTransaction['target'] = 'UNKNOWN';
    const val = value >>> 0;

    // SRAM
    if (address >= SRAM_BASE && address < SRAM_BASE + SRAM_SIZE) {
      target = 'SRAM';
      const offset = address - SRAM_BASE;
      if (size === 1) {
        this.sram[offset] = val & 0xff;
      } else if (size === 2) {
        this.sram[offset] = val & 0xff;
        this.sram[offset + 1] = (val >> 8) & 0xff;
      } else {
        this.sram[offset] = val & 0xff;
        this.sram[offset + 1] = (val >> 8) & 0xff;
        this.sram[offset + 2] = (val >> 16) & 0xff;
        this.sram[offset + 3] = (val >> 24) & 0xff;
      }
    }
    // Peripherals: USART1 Data Register (Transmission)
    else if (address === ADDR_USART1_DR) {
      target = 'USART1';
      const charByte = val & 0xff;
      this.usart1.dr = charByte;
      this.usart1.txCharCount++;
      const char = String.fromCharCode(charByte);

      // Trigger real-time serial output callback immediately!
      if (this.onSerialTxCallback) {
        this.onSerialTxCallback(char, charByte);
      }
    } else if (address === ADDR_USART1_SR) {
      target = 'USART1';
      this.usart1.sr = val;
    } else if (address === ADDR_USART1_BRR) {
      target = 'USART1';
      this.usart1.brr = val;
    } else if (address === ADDR_USART1_CR1) {
      target = 'USART1';
      this.usart1.cr1 = val;
    }
    // Peripherals: GPIOC (LED Pin 13)
    else if (address === ADDR_GPIOC_MODER) {
      target = 'GPIOC';
      this.gpioC.moder = val;
    } else if (address === ADDR_GPIOC_ODR) {
      target = 'GPIOC';
      const prevOdr = this.gpioC.odr;
      this.gpioC.odr = val;

      // Check PC13 (Bit 13)
      const prevBit13 = (prevOdr & (1 << 13)) !== 0;
      const newBit13 = (val & (1 << 13)) !== 0;

      // STM32 BluePill PC13 is active LOW (0 = ON, 1 = OFF)
      this.gpioC.ledPc13 = !newBit13;

      if (prevBit13 !== newBit13) {
        this.gpioC.toggleCount++;
        this.gpioC.lastToggleTime = Date.now();
        if (this.onGpioChangeCallback) {
          this.onGpioChangeCallback({ ...this.gpioC });
        }
      }
    } else if (address === ADDR_GPIOC_BSRR) {
      target = 'GPIOC';
      // Bit 0..15 set, Bit 16..31 reset
      let odr = this.gpioC.odr;
      const setBits = val & 0xffff;
      const resetBits = (val >> 16) & 0xffff;
      odr |= setBits;
      odr &= ~resetBits;
      this.writeMemory(ADDR_GPIOC_ODR, odr, 4);
      return;
    }
    // Peripherals: RCC
    else if (address === ADDR_RCC_AHB1ENR) {
      target = 'RCC';
      this.rccAhb1Enr = val;
    }
    // SysTick
    else if (address === ADDR_SYSTICK_CSR) {
      target = 'SYSTICK';
      this.systick.csr = val;
    } else if (address === ADDR_SYSTICK_RVR) {
      target = 'SYSTICK';
      this.systick.rvr = val;
    } else if (address === ADDR_SYSTICK_CVR) {
      target = 'SYSTICK';
      this.systick.cvr = 0; // write to CVR clears it
    }

    const tx: BusTransaction = {
      type: 'WRITE',
      address,
      data: val,
      size,
      target,
      timestamp: Date.now(),
    };
    this.recordBusTransaction(tx);
  }

  private recordBusTransaction(tx: BusTransaction) {
    this.busTransactions.push(tx);
    if (this.busTransactions.length > 50) {
      this.busTransactions.shift();
    }
  }

  /**
   * Inject input byte into USART1 RX from terminal user
   */
  public injectSerialRx(byte: number) {
    this.usart1.rxBuffer.push(byte & 0xff);
    this.usart1.sr |= 0x20; // Set RXNE (RX not empty)
  }

  // Register access helpers
  public getRegister(index: number): number {
    switch (index) {
      case 0: return this.registers.r0;
      case 1: return this.registers.r1;
      case 2: return this.registers.r2;
      case 3: return this.registers.r3;
      case 4: return this.registers.r4;
      case 5: return this.registers.r5;
      case 6: return this.registers.r6;
      case 7: return this.registers.r7;
      case 8: return this.registers.r8;
      case 9: return this.registers.r9;
      case 10: return this.registers.r10;
      case 11: return this.registers.r11;
      case 12: return this.registers.r12;
      case 13: return this.registers.sp;
      case 14: return this.registers.lr;
      case 15: return this.registers.pc;
      default: return 0;
    }
  }

  public setRegister(index: number, value: number) {
    const val = value >>> 0;
    switch (index) {
      case 0: this.registers.r0 = val; break;
      case 1: this.registers.r1 = val; break;
      case 2: this.registers.r2 = val; break;
      case 3: this.registers.r3 = val; break;
      case 4: this.registers.r4 = val; break;
      case 5: this.registers.r5 = val; break;
      case 6: this.registers.r6 = val; break;
      case 7: this.registers.r7 = val; break;
      case 8: this.registers.r8 = val; break;
      case 9: this.registers.r9 = val; break;
      case 10: this.registers.r10 = val; break;
      case 11: this.registers.r11 = val; break;
      case 12: this.registers.r12 = val; break;
      case 13: this.registers.sp = val; break;
      case 14: this.registers.lr = val; break;
      case 15: this.registers.pc = val; break;
    }
  }

  /**
   * Single-Step Instruction Execution:
   * Performs complete Fetch -> Decode -> Execute -> Memory -> Writeback pipeline
   * and yields full datapath stage telemetry.
   */
  public step(): DatapathStage {
    this.prevRegisters = { ...this.registers };
    const pc = this.registers.pc;

    // 1. FETCH
    const instWord = this.readMemory(pc, 2);
    const rawHex = '0x' + instWord.toString(16).padStart(4, '0');

    // Default datapath stage values
    let mnemonic = 'NOP';
    let opcodeStr = 'NOP';
    let destRegStr: string | undefined = undefined;
    let sourceRegs: string[] = [];
    let immediateVal: number | undefined = undefined;

    let aluA = 0;
    let aluB = 0;
    let aluOp = 'NOP';
    let aluResult = 0;
    let memTx: BusTransaction | null = null;
    let writebackInfo: { reg?: string; value?: number } | null = null;

    let nextPc = pc + 2;

    // 2. DECODE & EXECUTE
    // Instruction Decoders for Cortex-M Thumb subset

    // NOP (0xBF00)
    if (instWord === 0xbf00) {
      mnemonic = 'NOP';
      opcodeStr = 'NOP';
      aluOp = 'IDLE';
    }
    // MOV Rd, #imm8 (0010 0ddd iiiiiiii) -> 0x2000 | (Rd << 8) | imm8
    else if ((instWord & 0xf800) === 0x2000) {
      const rd = (instWord >> 8) & 0x7;
      const imm8 = instWord & 0xff;
      mnemonic = `MOV R${rd}, #${imm8}`;
      opcodeStr = 'MOV_IMM';
      destRegStr = `R${rd}`;
      immediateVal = imm8;

      aluA = 0;
      aluB = imm8;
      aluOp = 'PASS_B';
      aluResult = imm8;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // LDR Rd, [PC, #imm8*4] (0100 1ddd iiiiiiii) -> 0x4800 | (Rd << 8) | imm8
    else if ((instWord & 0xf800) === 0x4800) {
      const rd = (instWord >> 8) & 0x7;
      const imm8 = instWord & 0xff;
      // Align PC to 4 bytes: (PC + 4) & ~3
      const baseAddr = (pc + 4) & ~3;
      const targetAddr = baseAddr + imm8 * 4;

      mnemonic = `LDR R${rd}, [PC, #${imm8 * 4}]`;
      opcodeStr = 'LDR_PC';
      destRegStr = `R${rd}`;
      sourceRegs = ['PC'];
      immediateVal = imm8 * 4;

      aluA = baseAddr;
      aluB = imm8 * 4;
      aluOp = 'ADD_ADDR';
      aluResult = targetAddr;

      const loadedVal = this.readMemory(targetAddr, 4);
      memTx = {
        type: 'READ',
        address: targetAddr,
        data: loadedVal,
        size: 4,
        target: 'FLASH_ROM',
        timestamp: Date.now(),
      };

      this.setRegister(rd, loadedVal);
      writebackInfo = { reg: `R${rd}`, value: loadedVal };
    }
    // LDR Rd, [Rn, #imm5*4] (0110 1iii iinnnddd) -> 0x6800
    else if ((instWord & 0xf800) === 0x6800) {
      const rd = instWord & 0x7;
      const rn = (instWord >> 3) & 0x7;
      const imm5 = (instWord >> 6) & 0x1f;
      const offset = imm5 * 4;
      const baseVal = this.getRegister(rn);
      const targetAddr = (baseVal + offset) >>> 0;

      mnemonic = `LDR R${rd}, [R${rn}, #${offset}]`;
      opcodeStr = 'LDR_IMM';
      destRegStr = `R${rd}`;
      sourceRegs = [`R${rn}`];
      immediateVal = offset;

      aluA = baseVal;
      aluB = offset;
      aluOp = 'ADD_ADDR';
      aluResult = targetAddr;

      const loadedVal = this.readMemory(targetAddr, 4);
      memTx = {
        type: 'READ',
        address: targetAddr,
        data: loadedVal,
        size: 4,
        target: this.getTargetForAddr(targetAddr),
        timestamp: Date.now(),
      };

      this.setRegister(rd, loadedVal);
      writebackInfo = { reg: `R${rd}`, value: loadedVal };
    }
    // STR Rd, [Rn, #imm5*4] (0110 0iii iinnnddd) -> 0x6000
    else if ((instWord & 0xf800) === 0x6000) {
      const rd = instWord & 0x7;
      const rn = (instWord >> 3) & 0x7;
      const imm5 = (instWord >> 6) & 0x1f;
      const offset = imm5 * 4;
      const baseVal = this.getRegister(rn);
      const targetAddr = (baseVal + offset) >>> 0;
      const dataVal = this.getRegister(rd);

      mnemonic = `STR R${rd}, [R${rn}, #${offset}]`;
      opcodeStr = 'STR_IMM';
      sourceRegs = [`R${rd}`, `R${rn}`];
      immediateVal = offset;

      aluA = baseVal;
      aluB = offset;
      aluOp = 'ADD_ADDR';
      aluResult = targetAddr;

      this.writeMemory(targetAddr, dataVal, 4);
      memTx = {
        type: 'WRITE',
        address: targetAddr,
        data: dataVal,
        size: 4,
        target: this.getTargetForAddr(targetAddr),
        timestamp: Date.now(),
      };
    }
    // EOR Rd, Rm (0100 0000 01mm mddd) -> 0x4040
    else if ((instWord & 0xffc0) === 0x4040) {
      const rd = instWord & 0x7;
      const rm = (instWord >> 3) & 0x7;
      const a = this.getRegister(rd);
      const b = this.getRegister(rm);

      mnemonic = `EORS R${rd}, R${rm}`;
      opcodeStr = 'EORS';
      destRegStr = `R${rd}`;
      sourceRegs = [`R${rd}`, `R${rm}`];

      aluA = a;
      aluB = b;
      aluOp = 'XOR';
      aluResult = (a ^ b) >>> 0;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // ORR Rd, Rm (0100 0000 11mm mddd) -> 0x40c0
    else if ((instWord & 0xffc0) === 0x40c0) {
      const rd = instWord & 0x7;
      const rm = (instWord >> 3) & 0x7;
      const a = this.getRegister(rd);
      const b = this.getRegister(rm);

      mnemonic = `ORRS R${rd}, R${rm}`;
      opcodeStr = 'ORRS';
      destRegStr = `R${rd}`;
      sourceRegs = [`R${rd}`, `R${rm}`];

      aluA = a;
      aluB = b;
      aluOp = 'OR';
      aluResult = (a | b) >>> 0;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // AND Rd, Rm (0100 0000 00mm mddd) -> 0x4000
    else if ((instWord & 0xffc0) === 0x4000) {
      const rd = instWord & 0x7;
      const rm = (instWord >> 3) & 0x7;
      const a = this.getRegister(rd);
      const b = this.getRegister(rm);

      mnemonic = `ANDS R${rd}, R${rm}`;
      opcodeStr = 'ANDS';
      destRegStr = `R${rd}`;
      sourceRegs = [`R${rd}`, `R${rm}`];

      aluA = a;
      aluB = b;
      aluOp = 'AND';
      aluResult = (a & b) >>> 0;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // ADD Rd, #imm8 (0011 0ddd iiiiiiii) -> 0x3000
    else if ((instWord & 0xf800) === 0x3000) {
      const rd = (instWord >> 8) & 0x7;
      const imm8 = instWord & 0xff;
      const a = this.getRegister(rd);

      mnemonic = `ADDS R${rd}, #${imm8}`;
      opcodeStr = 'ADDS_IMM';
      destRegStr = `R${rd}`;
      immediateVal = imm8;

      aluA = a;
      aluB = imm8;
      aluOp = 'ADD';
      aluResult = (a + imm8) >>> 0;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // SUB Rd, #imm8 (0011 1ddd iiiiiiii) -> 0x3800
    else if ((instWord & 0xf800) === 0x3800) {
      const rd = (instWord >> 8) & 0x7;
      const imm8 = instWord & 0xff;
      const a = this.getRegister(rd);

      mnemonic = `SUBS R${rd}, #${imm8}`;
      opcodeStr = 'SUBS_IMM';
      destRegStr = `R${rd}`;
      immediateVal = imm8;

      aluA = a;
      aluB = imm8;
      aluOp = 'SUB';
      aluResult = (a - imm8) >>> 0;

      this.setRegister(rd, aluResult);
      this.updateZandN(aluResult);
      writebackInfo = { reg: `R${rd}`, value: aluResult };
    }
    // CMP Rn, #imm8 (0010 1nnn iiiiiiii) -> 0x2800
    else if ((instWord & 0xf800) === 0x2800) {
      const rn = (instWord >> 8) & 0x7;
      const imm8 = instWord & 0xff;
      const a = this.getRegister(rn);

      mnemonic = `CMP R${rn}, #${imm8}`;
      opcodeStr = 'CMP_IMM';
      sourceRegs = [`R${rn}`];
      immediateVal = imm8;

      aluA = a;
      aluB = imm8;
      aluOp = 'CMP';
      aluResult = (a - imm8) >>> 0;

      this.registers.psr.z = aluResult === 0;
      this.registers.psr.n = (aluResult & 0x80000000) !== 0;
      this.registers.psr.c = a >= imm8;
    }
    // B<cond> label (1101 cccc ssssssss) -> 0xD000
    else if ((instWord & 0xf000) === 0xd000) {
      const cond = (instWord >> 8) & 0x0f;
      // 8-bit signed offset
      let imm8 = instWord & 0xff;
      if (imm8 & 0x80) imm8 -= 256;
      const offset = imm8 * 2;
      const targetPc = pc + 4 + offset;

      let condMet = false;
      let condName = 'AL';
      switch (cond) {
        case 0x0: condName = 'BEQ'; condMet = this.registers.psr.z; break;
        case 0x1: condName = 'BNE'; condMet = !this.registers.psr.z; break;
        case 0x2: condName = 'BCS'; condMet = this.registers.psr.c; break;
        case 0x3: condName = 'BCC'; condMet = !this.registers.psr.c; break;
        case 0x4: condName = 'BMI'; condMet = this.registers.psr.n; break;
        case 0x5: condName = 'BPL'; condMet = !this.registers.psr.n; break;
        case 0xa: condName = 'BGE'; condMet = this.registers.psr.n === this.registers.psr.v; break;
        case 0xb: condName = 'BLT'; condMet = this.registers.psr.n !== this.registers.psr.v; break;
        case 0xc: condName = 'BGT'; condMet = !this.registers.psr.z && this.registers.psr.n === this.registers.psr.v; break;
        case 0xd: condName = 'BLE'; condMet = this.registers.psr.z || this.registers.psr.n !== this.registers.psr.v; break;
        default: condName = `B_COND_${cond}`; condMet = false;
      }

      mnemonic = `${condName} 0x${targetPc.toString(16)}`;
      opcodeStr = condName;
      immediateVal = offset;

      aluA = pc + 4;
      aluB = offset;
      aluOp = condMet ? 'BRANCH_TAKEN' : 'BRANCH_NOT_TAKEN';
      aluResult = targetPc;

      if (condMet) {
        nextPc = targetPc;
      }
    }
    // B unconditional label (1110 0sss ssssssss) -> 0xE000
    else if ((instWord & 0xf800) === 0xe000) {
      let imm11 = instWord & 0x7ff;
      if (imm11 & 0x400) imm11 -= 2048;
      const offset = imm11 * 2;
      const targetPc = pc + 4 + offset;

      mnemonic = `B 0x${targetPc.toString(16)}`;
      opcodeStr = 'B_UNCOND';
      immediateVal = offset;

      aluA = pc + 4;
      aluB = offset;
      aluOp = 'BRANCH';
      aluResult = targetPc;

      nextPc = targetPc;
    }
    // BX Rm (0100 0111 0mmm m000) -> 0x4700
    else if ((instWord & 0xff87) === 0x4700) {
      const rm = (instWord >> 3) & 0x0f;
      const target = this.getRegister(rm);
      mnemonic = `BX R${rm}`;
      opcodeStr = 'BX';
      sourceRegs = [`R${rm}`];

      aluA = target;
      aluB = 0;
      aluOp = 'BRANCH_REG';
      aluResult = target & ~1; // Clear Thumb bit

      nextPc = aluResult;
    }
    // Fallback: 32-bit Thumb or unhandled 16-bit
    else {
      mnemonic = `RAW 0x${instWord.toString(16).padStart(4, '0')}`;
      opcodeStr = 'RAW';
      aluOp = 'UNKNOWN';
    }

    // Update PC to next instruction
    this.registers.pc = nextPc >>> 0;
    this.cycleCount++;
    this.instructionCount++;

    const stage: DatapathStage = {
      fetch: {
        pc,
        instructionWord: instWord,
        rawHex,
        mnemonic,
      },
      decode: {
        opcode: opcodeStr,
        destReg: destRegStr,
        sourceRegs,
        immediate: immediateVal,
      },
      execute: {
        operandA: aluA,
        operandB: aluB,
        operation: aluOp,
        result: aluResult,
        flagsChanged: { ...this.registers.psr },
      },
      memory: memTx,
      writeback: writebackInfo,
    };

    this.lastDatapathStage = stage;
    if (this.onDatapathUpdateCallback) {
      this.onDatapathUpdateCallback(stage);
    }

    return stage;
  }

  private updateZandN(val: number) {
    this.registers.psr.z = (val >>> 0) === 0;
    this.registers.psr.n = (val & 0x80000000) !== 0;
  }

  private getTargetForAddr(addr: number): BusTransaction['target'] {
    if (addr >= FLASH_BASE && addr < FLASH_BASE + FLASH_SIZE) return 'FLASH_ROM';
    if (addr >= SRAM_BASE && addr < SRAM_BASE + SRAM_SIZE) return 'SRAM';
    if (addr >= ADDR_GPIOC_BASE && addr < ADDR_GPIOC_BASE + 0x20) return 'GPIOC';
    if (addr >= ADDR_USART1_BASE && addr < ADDR_USART1_BASE + 0x20) return 'USART1';
    if (addr >= ADDR_RCC_BASE && addr < ADDR_RCC_BASE + 0x40) return 'RCC';
    return 'UNKNOWN';
  }

  /**
   * Run simulator continuously at specified clock speed
   */
  public run(speedHz = this.clockSpeedHz) {
    this.pause();
    this.clockSpeedHz = speedHz;
    this.state = 'RUNNING';

    // Calculate step batching for performance:
    // If speedHz > 100, we run multiple steps per 25ms timer interval
    const intervalMs = speedHz < 100 ? Math.max(20, Math.floor(1000 / speedHz)) : 25;
    const stepsPerTick = speedHz < 100 ? 1 : Math.max(1, Math.floor((speedHz * intervalMs) / 1000));

    this.runIntervalTimer = setInterval(() => {
      if (this.state !== 'RUNNING') return;

      for (let i = 0; i < stepsPerTick; i++) {
        this.step();
        // Check if PC went out of bounds or halted
        if (this.registers.pc >= FLASH_BASE + FLASH_SIZE || this.registers.pc === 0) {
          this.pause();
          this.state = 'HALTED';
          break;
        }
      }
    }, intervalMs);
  }

  public pause() {
    if (this.runIntervalTimer) {
      clearInterval(this.runIntervalTimer);
      this.runIntervalTimer = null;
    }
    this.state = 'HALTED';
  }

  public setClockSpeed(hz: number) {
    this.clockSpeedHz = hz;
    if (this.state === 'RUNNING') {
      this.run(hz);
    }
  }

  public isRunning(): boolean {
    return this.state === 'RUNNING';
  }
}

// Global Singleton Simulator instance for seamless connectivity across components
export const armSimulator = new ArmCortexSimulator();

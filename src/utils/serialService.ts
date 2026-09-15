/**
 * Serial Service: WebSerial API client and Virtual Embedded Device Simulators.
 * Supports multiple concurrent physical and simulated serial device connections.
 */

import { SerialConfig, SerialDevice, VirtualProfile } from '../types';
import { armSimulator } from './armSimulator/armCpu';
import { compileCSource } from './armSimulator/cCompiler';
import { SAMPLE_C_PROGRAMS } from './armSimulator/samplePrograms';

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export type LogCallback = (deviceId: string, text: string, rawBytes?: number[], direction?: 'RX' | 'TX') => void;
export type StatusCallback = (device: SerialDevice) => void;

interface ActiveConnection {
  device: SerialDevice;
  port?: any; // WebSerial SerialPort
  reader?: any;
  writer?: any;
  virtualTimer?: any;
  virtualSubTimer?: any;
  rxWindowBytes: number;
  txWindowBytes: number;
  rxThroughputTimer?: any;
}

class SerialManager {
  private connections: Map<string, ActiveConnection> = new Map();
  private onLog: LogCallback = () => {};
  private onStatusChange: StatusCallback = () => {};

  public setCallbacks(onLog: LogCallback, onStatusChange: StatusCallback) {
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;
  }

  public getConnection(deviceId: string): ActiveConnection | undefined {
    return this.connections.get(deviceId);
  }

  public async connect(device: SerialDevice): Promise<void> {
    const updatedDevice = { ...device, status: 'connecting' as const, error: undefined };
    this.onStatusChange(updatedDevice);

    try {
      if (device.portType === 'webserial') {
        await this.connectWebSerial(updatedDevice);
      } else {
        await this.connectVirtual(updatedDevice);
      }
    } catch (err: any) {
      console.error(`Error connecting to device ${device.name}:`, err);
      const errDevice = {
        ...device,
        status: 'error' as const,
        error: err.message || 'Connection failed',
      };
      this.onStatusChange(errDevice);
      throw err;
    }
  }

  public async disconnect(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;

    if (conn.virtualTimer) clearInterval(conn.virtualTimer);
    if (conn.virtualSubTimer) clearInterval(conn.virtualSubTimer);
    if (conn.rxThroughputTimer) clearInterval(conn.rxThroughputTimer);

    if (conn.device.virtualProfile === 'arm_cortex') {
      armSimulator.pause();
    }

    if (conn.reader) {
      try {
        await conn.reader.cancel();
      } catch (e) {
        // ignore
      }
    }

    if (conn.port) {
      try {
        await conn.port.close();
      } catch (e) {
        // ignore
      }
    }

    const disconnectedDevice: SerialDevice = {
      ...conn.device,
      status: 'disconnected',
      rxBytesSec: 0,
      txBytesSec: 0,
    };

    this.connections.delete(deviceId);
    this.onStatusChange(disconnectedDevice);
    this.onLog(deviceId, `[SYSTEM] Port closed. Device disconnected.\r\n`, undefined, 'RX');
  }

  public async setSignals(deviceId: string, signals: { dtr?: boolean; rts?: boolean }): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;

    const newDtr = signals.dtr !== undefined ? signals.dtr : conn.device.dtr;
    const newRts = signals.rts !== undefined ? signals.rts : conn.device.rts;

    conn.device.dtr = newDtr;
    conn.device.rts = newRts;

    if (conn.port && conn.port.setSignals) {
      try {
        await conn.port.setSignals({
          dataTerminalReady: newDtr,
          requestToSend: newRts,
        });
      } catch (err) {
        console.warn('Could not set control signals on physical serial port:', err);
      }
    }

    this.onStatusChange({ ...conn.device });
    this.onLog(deviceId, `\x1b[36m[SYSTEM] Hardware lines updated: DTR=${newDtr ? 'HIGH' : 'LOW'}, RTS=${newRts ? 'HIGH' : 'LOW'}\x1b[0m\r\n`, undefined, 'RX');
  }

  public async send(deviceId: string, data: string | Uint8Array): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn || conn.device.status !== 'connected') {
      throw new Error('Device is not connected');
    }

    let bytes: Uint8Array;
    let textRepresentation: string;

    if (typeof data === 'string') {
      textRepresentation = data;
      bytes = new TextEncoder().encode(data);
    } else {
      bytes = data;
      textRepresentation = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    }

    conn.device.txBytesTotal += bytes.length;
    conn.txWindowBytes += bytes.length;
    conn.device.lastActive = Date.now();

    this.onLog(deviceId, textRepresentation, Array.from(bytes), 'TX');
    this.onStatusChange({ ...conn.device });

    if (conn.device.portType === 'webserial' && conn.writer) {
      await conn.writer.write(bytes);
    } else if (conn.device.portType === 'virtual') {
      this.handleVirtualDeviceInput(conn, typeof data === 'string' ? data : new TextDecoder().decode(bytes));
    }
  }

  // --- WebSerial Implementation ---
  private async connectWebSerial(device: SerialDevice): Promise<void> {
    if (!isWebSerialSupported()) {
      throw new Error(
        'WebSerial API is not supported in this browser. Please use Chrome, Edge, or Opera on desktop.'
      );
    }

    const serial = (navigator as any).serial;
    let port: any;
    try {
      port = await serial.requestPort();
    } catch (reqErr: any) {
      if (reqErr.name === 'NotFoundError') {
        throw new Error('Port selection cancelled. Please pick your USB serial device to connect.');
      }
      if (
        reqErr.name === 'SecurityError' ||
        (reqErr.message && reqErr.message.includes('disallowed by permissions policy'))
      ) {
        throw new Error(
          'WebSerial USB access is restricted inside iframe. Please click "Open in New Tab" in the top bar to connect to your USB device directly.'
        );
      }
      throw reqErr;
    }

    // Identify USB chip from Vendor ID if available
    const info = port.getInfo ? port.getInfo() : {};
    let hardwareName = device.name;
    if (info.usbVendorId === 0x0403) {
      hardwareName = 'FTDI USB-UART (FT5QW55Z2)';
    } else if (info.usbVendorId === 0x10c4) {
      hardwareName = 'Silicon Labs CP210x UART';
    } else if (info.usbVendorId === 0x1a86) {
      hardwareName = 'WCH CH340 USB-Serial';
    } else if (info.usbVendorId === 0x303a) {
      hardwareName = 'Espressif USB Serial/JTAG';
    } else if (info.usbVendorId === 0x2e8a) {
      hardwareName = 'Raspberry Pi RP2040 UART';
    } else if (info.usbVendorId === 0x0483) {
      hardwareName = 'STM32 ST-Link VCP';
    } else if (info.usbVendorId) {
      hardwareName = `USB Serial (VID:0x${info.usbVendorId.toString(16).padStart(4, '0')})`;
    }

    try {
      await port.open({
        baudRate: device.config.baudRate,
        dataBits: device.config.dataBits,
        stopBits: device.config.stopBits,
        parity: device.config.parity,
        flowControl: device.config.flowControl,
      });
    } catch (openErr: any) {
      const msg = openErr.message || '';
      if (
        msg.includes('already open') ||
        msg.includes('busy') ||
        msg.includes('Access denied') ||
        msg.includes('Failed to open')
      ) {
        throw new Error(
          `Port is locked: please exit 'screen' in macOS Terminal (press Ctrl-A then Ctrl-\\ or run 'killall screen') before opening in the web app.`
        );
      }
      throw openErr;
    }

    const activeConn: ActiveConnection = {
      device: { ...device, name: hardwareName, status: 'connected', error: undefined },
      port,
      rxWindowBytes: 0,
      txWindowBytes: 0,
    };

    activeConn.writer = port.writable.getWriter();
    this.connections.set(device.id, activeConn);
    this.startThroughputMonitor(activeConn);
    this.onStatusChange(activeConn.device);

    this.onLog(
      device.id,
      `\x1b[32m[SYSTEM] WebSerial connected to ${hardwareName} @ ${device.config.baudRate} 8-N-1\x1b[0m\r\n`,
      undefined,
      'RX'
    );

    // Read loop
    this.startWebSerialReadLoop(activeConn);
  }

  private async startWebSerialReadLoop(conn: ActiveConnection): Promise<void> {
    const port = conn.port;
    const textDecoder = new TextDecoderStream();
    
    try {
      while (port.readable && conn.device.status === 'connected') {
        const readableClosed = port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        conn.reader = reader;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const rawBytes = Array.from(new TextEncoder().encode(value));
              conn.device.rxBytesTotal += rawBytes.length;
              conn.rxWindowBytes += rawBytes.length;
              conn.device.lastActive = Date.now();
              this.onLog(conn.device.id, value, rawBytes, 'RX');
            }
          }
        } catch (error) {
          console.warn('Serial reader error:', error);
        } finally {
          reader.releaseLock();
          await readableClosed.catch(() => {});
        }
      }
    } catch (err: any) {
      console.error('Fatal serial read error:', err);
      if (conn.device.status === 'connected') {
        this.disconnect(conn.device.id);
      }
    }
  }

  // --- Virtual Device Simulation ---
  private async connectVirtual(device: SerialDevice): Promise<void> {
    const profile = device.virtualProfile || 'esp32';
    const activeConn: ActiveConnection = {
      device: { ...device, status: 'connected' },
      rxWindowBytes: 0,
      txWindowBytes: 0,
    };

    this.connections.set(device.id, activeConn);
    this.startThroughputMonitor(activeConn);
    this.onStatusChange(activeConn.device);

    this.onLog(device.id, `\x1b[35m[SIMULATOR] Virtual ${profile.toUpperCase()} Engine booted at ${device.config.baudRate} baud\x1b[0m\r\n`, undefined, 'RX');

    // Initial boot logs based on profile
    this.initVirtualProfileBoot(activeConn, profile);
  }

  private initVirtualProfileBoot(conn: ActiveConnection, profile: VirtualProfile) {
    const deviceId = conn.device.id;

    if (profile === 'esp32') {
      const bootLines = [
        'rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n',
        'configsip: 0, SPIWP:0xee\r\n',
        'clk_drv:0x00,q_drv:0x00,d_drv:0x00,cs0_drv:0x00,hd_drv:0x00,wp_drv:0x00\r\n',
        'mode:DIO, clock div:2\r\n',
        'load:0x3fff0030,len:1184\r\n',
        'load:0x40078000,len:13104\r\n',
        'ho 0 tail 12 room 4\r\n',
        '\x1b[32mI (42) boot: ESP-IDF v5.2.1-dirty 2nd stage bootloader\x1b[0m\r\n',
        '\x1b[32mI (58) boot: compile time 08:45:12, chip: ESP32-S3 (revision v0.2)\x1b[0m\r\n',
        '\x1b[32mI (69) boot: SPI Speed      : 80MHz\x1b[0m\r\n',
        '\x1b[32mI (74) boot: SPI Mode       : QIO\x1b[0m\r\n',
        '\x1b[32mI (78) boot: SPI Flash Size : 16MB\x1b[0m\r\n',
        '\x1b[32mI (82) cpu_start: Pro cpu up.\x1b[0m\r\n',
        '\x1b[32mI (86) cpu_start: Starting scheduler on PRO CPU.\x1b[0m\r\n',
        '\x1b[32mI (112) cpu_start: Starting scheduler on APP CPU.\x1b[0m\r\n',
        '\x1b[36mI (135) wifi: wifi driver task: 3ffbf9bc, prio:23, stack:6656, core=0\x1b[0m\r\n',
        '\x1b[36mI (150) wifi: Init NVS flash sector 0x9000 OK\x1b[0m\r\n',
        '\x1b[32mI (180) app_main: FreeRTOS Firmware Console ready. Type "help" for commands.\x1b[0m\r\n',
        'esp32-s3> ',
      ];

      bootLines.forEach((line, idx) => {
        setTimeout(() => {
          if (conn.device.status === 'connected') {
            const bytes = new TextEncoder().encode(line);
            conn.device.rxBytesTotal += bytes.length;
            conn.rxWindowBytes += bytes.length;
            this.onLog(deviceId, line, Array.from(bytes), 'RX');
          }
        }, idx * 60);
      });

      // Background periodic heartbeat
      conn.virtualTimer = setInterval(() => {
        if (conn.device.status === 'connected') {
          const heap = 274000 + Math.floor(Math.random() * 8000);
          const upSec = Math.floor(performance.now() / 1000);
          const line = `\x1b[90m[${upSec}s] Free heap: ${heap} bytes | Core0: 14% | Core1: 31%\x1b[0m\r\n`;
          const bytes = new TextEncoder().encode(line);
          conn.device.rxBytesTotal += bytes.length;
          conn.rxWindowBytes += bytes.length;
          this.onLog(deviceId, line, Array.from(bytes), 'RX');
        }
      }, 5000);

    } else if (profile === 'stm32') {
      const boot = [
        '\x1b[32m[STM32H743ZI] System Initialized (Core Clock 480MHz)\x1b[0m\r\n',
        '[SYS] MPU Configured. D-Cache ENABLED, I-Cache ENABLED.\r\n',
        '[CAN1] Baudrate set to 500 kbps. Filters applied.\r\n',
        '\x1b[33m[SENSORS] IMU LSM6DSO calibrated. Offsets: X=-0.01 Y=+0.02 Z=+0.98\x1b[0m\r\n',
        '[TELEMETRY] Starting High-Speed Data Stream (10 Hz)...\r\n',
      ];

      boot.forEach((line, idx) => {
        setTimeout(() => {
          if (conn.device.status === 'connected') {
            const bytes = new TextEncoder().encode(line);
            conn.device.rxBytesTotal += bytes.length;
            conn.rxWindowBytes += bytes.length;
            this.onLog(deviceId, line, Array.from(bytes), 'RX');
          }
        }, idx * 80);
      });

      let seq = 0;
      conn.virtualTimer = setInterval(() => {
        if (conn.device.status === 'connected') {
          seq++;
          const ax = (Math.sin(seq * 0.1) * 0.15).toFixed(3);
          const ay = (Math.cos(seq * 0.1) * 0.12).toFixed(3);
          const az = (0.98 + Math.random() * 0.04).toFixed(3);
          const temp = (38.4 + Math.sin(seq * 0.05) * 2.1).toFixed(1);
          const vcc = (3.302 + (Math.random() - 0.5) * 0.01).toFixed(3);
          const canId = (0x18F00000 + (seq % 16)).toString(16).toUpperCase();

          const line = `CAN[0x${canId}]: AX=${ax}g AY=${ay}g AZ=${az}g TEMP=${temp}C VCC=${vcc}V CRC=0x${(seq * 31 & 0xFFFF).toString(16).toUpperCase()}\r\n`;
          const bytes = new TextEncoder().encode(line);
          conn.device.rxBytesTotal += bytes.length;
          conn.rxWindowBytes += bytes.length;
          this.onLog(deviceId, line, Array.from(bytes), 'RX');
        }
      }, 800);

    } else if (profile === 'nrf52') {
      this.onLog(deviceId, '\x1b[34m[nRF52840] BLE Controller 5.3 Active | MAC: F4:CE:36:A1:7B:92\x1b[0m\r\n', undefined, 'RX');
      this.onLog(deviceId, '[BLE] Adv Interval: 100ms | Channel Map: 37, 38, 39\r\n', undefined, 'RX');

      conn.virtualTimer = setInterval(() => {
        if (conn.device.status === 'connected') {
          const rssi = -45 - Math.floor(Math.random() * 30);
          const rawHex = `02 01 06 11 07 1B C5 D5 A5 02 00 37 AA E1 11 20 40 80 00 00 00 05 FF ${Math.floor(Math.random()*255).toString(16).padStart(2,'0')}`;
          const line = `[ADV_IND] Peer: 58:24:29:EE:1A:0B | RSSI: ${rssi} dBm | Payload: [${rawHex}]\r\n`;
          const bytes = new TextEncoder().encode(line);
          conn.device.rxBytesTotal += bytes.length;
          conn.rxWindowBytes += bytes.length;
          this.onLog(deviceId, line, Array.from(bytes), 'RX');
        }
      }, 1200);

    } else if (profile === 'arm_cortex') {
      this.onLog(deviceId, '\x1b[36m[ARM-SIM] Initializing Simulated ARM Cortex-M3 Core (Zero Physical Hardware Required)...\x1b[0m\r\n', undefined, 'RX');
      this.onLog(deviceId, '\x1b[32m[ARM-SIM] Flash Base: 0x08000000 | SRAM: 0x20000000 | USART1: 115200bps\x1b[0m\r\n', undefined, 'RX');
      this.onLog(deviceId, '\x1b[33m[ARM-SIM] PC13 User LED: Ready (Active Low) | Launching execution datapath\x1b[0m\r\n', undefined, 'RX');

      if (armSimulator.instructionCount === 0) {
        const compileRes = compileCSource(SAMPLE_C_PROGRAMS[0].code);
        if (compileRes.success) {
          armSimulator.flashBinary(compileRes.binary);
        }
      }

      armSimulator.setCallbacks({
        onSerialTx: (char, rawByte) => {
          if (conn.device.status === 'connected') {
            conn.device.rxBytesTotal += 1;
            conn.rxWindowBytes += 1;
            this.onLog(deviceId, char, [rawByte], 'RX');
          }
        },
      });

      armSimulator.run(1000);
    } else {
      // Custom Echo / Test profile
      this.onLog(deviceId, `[ECHO-ENGINE] Ready. Send any text or hex payload to test roundtrip.\r\n`, undefined, 'RX');
    }
  }

  private handleVirtualDeviceInput(conn: ActiveConnection, input: string) {
    const trimmed = input.trim();
    const deviceId = conn.device.id;
    const profile = conn.device.virtualProfile || 'esp32';

    setTimeout(() => {
      if (profile === 'esp32') {
        const cmd = trimmed.toLowerCase();
        if (cmd === 'help') {
          const help = [
            '\r\nAvailable commands:\r\n',
            '  help        - Show this reference menu\r\n',
            '  version     - Display ESP-IDF and silicon revision\r\n',
            '  heap        - Query DRAM and PSRAM memory metrics\r\n',
            '  wifi_scan   - Scan 2.4GHz IEEE 802.11b/g/n channels\r\n',
            '  read_adc    - Read ADC1 / ADC2 calibrated voltage\r\n',
            '  gpio <pin>  - Query GPIO logical level\r\n',
            '  crash_test  - Trigger test kernel panic with backtrace\r\n',
            '  reboot      - Soft reset CPU and restart bootloader\r\n',
            'esp32-s3> ',
          ].join('');
          this.pushVirtualOutput(conn, help);
        } else if (cmd === 'version') {
          this.pushVirtualOutput(conn, '\r\nESP-IDF v5.2.1-gcc12.2.0 | Chip: ESP32-S3 (Dual Core 240MHz, 512KB SRAM, 16MB Flash)\r\nesp32-s3> ');
        } else if (cmd === 'heap') {
          this.pushVirtualOutput(conn, '\r\nHeap Summary:\r\n  Total free: 279,840 bytes\r\n  Lowest watermark: 254,112 bytes\r\n  Largest free block: 196,608 bytes\r\n  SPIRAM total: 8,388,608 bytes (free: 7,921,440 bytes)\r\nesp32-s3> ');
        } else if (cmd === 'wifi_scan') {
          this.pushVirtualOutput(conn, '\r\nScanning Wi-Fi channels...\r\n  [CH 01] SSID: "Lab_IoT_5G"          RSSI: -48 dBm  AUTH: WPA2_PSK\r\n  [CH 06] SSID: "Embedded_Bench_4"    RSSI: -52 dBm  AUTH: WPA3_SAE\r\n  [CH 11] SSID: "Factory_Gateway_AP"  RSSI: -71 dBm  AUTH: WPA2_ENTERPRISE\r\nDone. 3 access points found.\r\nesp32-s3> ');
        } else if (cmd === 'read_adc') {
          const mv = 1845 + Math.floor(Math.random() * 40);
          this.pushVirtualOutput(conn, `\r\nADC1_CH3 (GPIO 4): ${mv} mV (calibrated eFuse Vref 1100mV)\r\nesp32-s3> `);
        } else if (cmd.startsWith('gpio')) {
          this.pushVirtualOutput(conn, `\r\nGPIO 12 State: HIGH (Input pulled-up, Interrupt: DISABLED)\r\nesp32-s3> `);
        } else if (cmd === 'crash_test') {
          const crash = [
            '\r\n\x1b[31mGuru Meditation Error: Core 0 panic\'ed (LoadProhibited). Exception was unhandled.\x1b[0m\r\n',
            'Core 0 register dump:\r\n',
            'PC      : 0x400812f4  PS      : 0x00060033  A0      : 0x80082410  A1      : 0x3ffb5dc0\r\n',
            'A2      : 0x00000000  A3      : 0x3ffb7834  A4      : 0x00000001  A5      : 0x00000000\r\n',
            'Backtrace: 0x400812f4:0x3ffb5dc0 0x4008240d:0x3ffb5de0 0x400d5a1b:0x3ffb5e00\r\n',
            '\x1b[33mRebooting in 3 seconds...\x1b[0m\r\n',
          ].join('');
          this.pushVirtualOutput(conn, crash);
          setTimeout(() => {
            if (conn.device.status === 'connected') {
              this.initVirtualProfileBoot(conn, 'esp32');
            }
          }, 3000);
        } else if (cmd === 'reboot') {
          this.pushVirtualOutput(conn, '\r\n\x1b[33mRestarting system...\x1b[0m\r\n');
          setTimeout(() => {
            if (conn.device.status === 'connected') {
              this.initVirtualProfileBoot(conn, 'esp32');
            }
          }, 500);
        } else {
          this.pushVirtualOutput(conn, `\r\nUnknown command: "${trimmed}". Type "help" for a list of commands.\r\nesp32-s3> `);
        }
      } else if (profile === 'stm32') {
        if (trimmed.toLowerCase() === 'status') {
          this.pushVirtualOutput(conn, `\r\n[STATUS] SysTick: ${Math.floor(performance.now())}ms | ErrorCode: 0x00000000 | Core Temp: 39.2C | Faults: 0\r\nstm32> `);
        } else if (trimmed.toLowerCase() === 'calib') {
          this.pushVirtualOutput(conn, `\r\n[CALIB] Starting Gyro zero-rate integration... [OK] Offsets applied to Flash Sector 7.\r\nstm32> `);
        } else {
          this.pushVirtualOutput(conn, `\r\n[ACK] Command received: "${trimmed}" -> Executed in 1.4ms\r\nstm32> `);
        }
      } else if (profile === 'arm_cortex') {
        // Feed input bytes directly into USART1 RX buffer of ARM simulator
        for (let i = 0; i < input.length; i++) {
          armSimulator.injectSerialRx(input.charCodeAt(i));
        }
      } else {
        // Echo
        this.pushVirtualOutput(conn, `[ECHO-ACK] "${trimmed}" (len: ${trimmed.length} bytes)\r\n`);
      }
    }, 40);
  }

  private pushVirtualOutput(conn: ActiveConnection, text: string) {
    const bytes = new TextEncoder().encode(text);
    conn.device.rxBytesTotal += bytes.length;
    conn.rxWindowBytes += bytes.length;
    conn.device.lastActive = Date.now();
    this.onLog(conn.device.id, text, Array.from(bytes), 'RX');
  }

  private startThroughputMonitor(conn: ActiveConnection) {
    conn.rxThroughputTimer = setInterval(() => {
      conn.device.rxBytesSec = conn.rxWindowBytes;
      conn.device.txBytesSec = conn.txWindowBytes;
      conn.rxWindowBytes = 0;
      conn.txWindowBytes = 0;
      this.onStatusChange({ ...conn.device });
    }, 1000);
  }
}

export const serialService = new SerialManager();

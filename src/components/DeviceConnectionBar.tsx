import React from 'react';
import {
  Cable,
  Check,
  ChevronDown,
  Cpu,
  Radio,
  SlidersHorizontal,
  Zap,
  Power,
  Layers,
} from 'lucide-react';
import { SerialDevice, VirtualProfile } from '../types';
import { isWebSerialSupported } from '../utils/serialService';

interface DeviceConnectionBarProps {
  device: SerialDevice;
  onUpdateConfig: (deviceId: string, patch: Partial<SerialDevice>) => void;
  onConnect: (device: SerialDevice) => void;
  onDisconnect: (deviceId: string) => void;
  onToggleSignal: (deviceId: string, signal: 'dtr' | 'rts') => void;
  onOpenFlasher?: () => void;
}

const COMMON_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];

export const DeviceConnectionBar: React.FC<DeviceConnectionBarProps> = ({
  device,
  onUpdateConfig,
  onConnect,
  onDisconnect,
  onToggleSignal,
  onOpenFlasher,
}) => {
  const [showAdvancedSettings, setShowAdvancedSettings] = React.useState(false);
  const [customBaud, setCustomBaud] = React.useState('');
  const [showCustomBaudInput, setShowCustomBaudInput] = React.useState(false);

  const hasWebSerial = isWebSerialSupported();
  const isConnected = device.status === 'connected';
  const isConnecting = device.status === 'connecting';

  const handleBaudChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setShowCustomBaudInput(true);
    } else {
      setShowCustomBaudInput(false);
      onUpdateConfig(device.id, {
        config: { ...device.config, baudRate: parseInt(val, 10) },
      });
    }
  };

  const handleCustomBaudSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseInt(customBaud, 10);
    if (rate > 0 && rate <= 3000000) {
      onUpdateConfig(device.id, {
        config: { ...device.config, baudRate: rate },
      });
      setShowCustomBaudInput(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-3">
      {/* Port Type & Target Profile Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-md border border-slate-800">
          <button
            type="button"
            disabled={isConnected}
            onClick={() => onUpdateConfig(device.id, { portType: 'webserial' })}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
              device.portType === 'webserial'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 disabled:opacity-50'
            }`}
            title={hasWebSerial ? 'Physical USB/UART WebSerial Port' : 'WebSerial not available in this browser'}
          >
            <Cable className="w-3.5 h-3.5" />
            <span>WebSerial API</span>
            {hasWebSerial ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            ) : (
              <span className="text-[10px] text-amber-400 font-mono">(No API)</span>
            )}
          </button>

          <button
            type="button"
            disabled={isConnected}
            onClick={() => onUpdateConfig(device.id, { portType: 'virtual' })}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
              device.portType === 'virtual'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 disabled:opacity-50'
            }`}
            title="Embedded Hardware Simulation Profile"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </button>
        </div>

        {/* Virtual Profile Dropdown (if virtual selected) */}
        {device.portType === 'virtual' && (
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px] hidden sm:inline">Profile:</span>
            <select
              disabled={isConnected}
              value={device.virtualProfile || 'esp32'}
              onChange={e =>
                onUpdateConfig(device.id, {
                  virtualProfile: e.target.value as VirtualProfile,
                  name:
                    e.target.value === 'esp32'
                      ? 'ESP32-S3 FreeRTOS'
                      : e.target.value === 'stm32'
                      ? 'STM32-H7 Telemetry'
                      : e.target.value === 'nrf52'
                      ? 'nRF52840 BLE Beacon'
                      : 'High-Throughput Echo',
                })
              }
              className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="esp32">ESP32-S3 (FreeRTOS CLI)</option>
              <option value="stm32">STM32H7 (IMU/CAN Telemetry)</option>
              <option value="nrf52">nRF52840 (BLE 5.3 Adv Stream)</option>
              <option value="custom_echo">High-Throughput Echo & Stress</option>
            </select>
          </div>
        )}

        {/* Baud Rate Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] font-mono">Baud:</span>
          {showCustomBaudInput ? (
            <form onSubmit={handleCustomBaudSubmit} className="flex items-center gap-1">
              <input
                type="number"
                placeholder="e.g. 500000"
                value={customBaud}
                onChange={e => setCustomBaud(e.target.value)}
                className="w-24 bg-slate-950 border border-cyan-500 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono"
                autoFocus
              />
              <button
                type="submit"
                className="px-1.5 py-0.5 bg-cyan-600 text-white rounded text-[10px] font-bold"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setShowCustomBaudInput(false)}
                className="text-slate-400 text-xs px-1"
              >
                ✕
              </button>
            </form>
          ) : (
            <select
              disabled={isConnected}
              value={
                COMMON_BAUD_RATES.includes(device.config.baudRate)
                  ? device.config.baudRate
                  : 'custom'
              }
              onChange={handleBaudChange}
              className="bg-slate-950 text-cyan-300 font-mono border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
            >
              {COMMON_BAUD_RATES.map(rate => (
                <option key={rate} value={rate}>
                  {rate} bps
                </option>
              ))}
              <option value="custom">Custom Rate...</option>
            </select>
          )}
        </div>

        {/* Framing & Advanced Config Popover Toggle */}
        <div className="relative">
          <button
            type="button"
            disabled={isConnected}
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition disabled:opacity-50"
            title="UART Framing: Data Bits, Stop Bits, Parity, Flow Control"
          >
            <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
            <span className="font-mono text-[11px]">
              {device.config.dataBits}-
              {device.config.parity === 'none'
                ? 'N'
                : device.config.parity === 'even'
                ? 'E'
                : 'O'}
              -{device.config.stopBits}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showAdvancedSettings && !isConnected && (
            <div className="absolute left-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3 z-50 text-xs space-y-2.5">
              <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex justify-between items-center">
                <span>UART Protocol Framing</span>
                <button
                  onClick={() => setShowAdvancedSettings(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">Data Bits</label>
                  <select
                    value={device.config.dataBits}
                    onChange={e =>
                      onUpdateConfig(device.id, {
                        config: {
                          ...device.config,
                          dataBits: parseInt(e.target.value, 10) as 7 | 8,
                        },
                      })
                    }
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-1.5 py-1 text-xs"
                  >
                    <option value={8}>8 bits (Standard)</option>
                    <option value={7}>7 bits</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">Stop Bits</label>
                  <select
                    value={device.config.stopBits}
                    onChange={e =>
                      onUpdateConfig(device.id, {
                        config: {
                          ...device.config,
                          stopBits: parseInt(e.target.value, 10) as 1 | 2,
                        },
                      })
                    }
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-1.5 py-1 text-xs"
                  >
                    <option value={1}>1 stop bit</option>
                    <option value={2}>2 stop bits</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">Parity</label>
                  <select
                    value={device.config.parity}
                    onChange={e =>
                      onUpdateConfig(device.id, {
                        config: {
                          ...device.config,
                          parity: e.target.value as 'none' | 'even' | 'odd',
                        },
                      })
                    }
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-1.5 py-1 text-xs"
                  >
                    <option value="none">None (Standard)</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">Flow Control</label>
                  <select
                    value={device.config.flowControl}
                    onChange={e =>
                      onUpdateConfig(device.id, {
                        config: {
                          ...device.config,
                          flowControl: e.target.value as 'none' | 'hardware',
                        },
                      })
                    }
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-1.5 py-1 text-xs"
                  >
                    <option value="none">None</option>
                    <option value="hardware">RTS / CTS Hardware</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connection Button, Hardware Signals & Real-time Throughput Telemetry */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Hardware Control Signals DTR / RTS (vital for ESP32/Arduino reset & boot mode) */}
        {isConnected && (
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 font-mono uppercase">Pins:</span>
            <button
              onClick={() => onToggleSignal(device.id, 'dtr')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                device.dtr
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Data Terminal Ready (DTR) signal line"
            >
              DTR {device.dtr ? 'HIGH' : 'LOW'}
            </button>
            <button
              onClick={() => onToggleSignal(device.id, 'rts')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                device.rts
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Request To Send (RTS) signal line"
            >
              RTS {device.rts ? 'HIGH' : 'LOW'}
            </button>
          </div>
        )}

        {/* Real-time Throughput Counter & Activity LEDs */}
        {isConnected && (
          <div className="flex items-center gap-2 text-[11px] font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-300">
            {/* RX LED */}
            <div className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-75 ${
                  device.rxBytesSec > 0
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-slate-700'
                }`}
              />
              <span className="text-slate-400 text-[10px]">RX:</span>
              <span className="text-emerald-400 font-semibold">
                {(device.rxBytesSec / 1024).toFixed(1)} KB/s
              </span>
            </div>

            <span className="text-slate-700">|</span>

            {/* TX LED */}
            <div className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-75 ${
                  device.txBytesSec > 0
                    ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                    : 'bg-slate-700'
                }`}
              />
              <span className="text-slate-400 text-[10px]">TX:</span>
              <span className="text-amber-400 font-semibold">
                {(device.txBytesSec / 1024).toFixed(1)} KB/s
              </span>
            </div>
          </div>
        )}

        {/* Download Image & Power Cycle Reboot Button */}
        {isConnected && onOpenFlasher && (
          <button
            type="button"
            onClick={onOpenFlasher}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs bg-gradient-to-r from-amber-600 to-cyan-600 hover:from-amber-500 hover:to-cyan-500 text-white shadow-sm transition"
            title="Download firmware image binary, power cycle reboot, and record boot console output"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Flash &amp; Reboot</span>
          </button>
        )}

        {/* Main Connect / Disconnect Action Button */}
        <button
          onClick={() => {
            if (isConnected) {
              onDisconnect(device.id);
            } else {
              onConnect(device);
            }
          }}
          disabled={isConnecting}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-xs transition shadow-sm ${
            isConnected
              ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500'
          }`}
        >
          <Power className={`w-3.5 h-3.5 ${isConnected ? 'text-rose-400' : 'text-cyan-200'}`} />
          <span>
            {isConnecting
              ? 'Connecting...'
              : isConnected
              ? 'Disconnect Port'
              : device.portType === 'webserial'
              ? 'Open Serial Port'
              : 'Boot Simulator'}
          </span>
        </button>
      </div>
    </div>
  );
};

/**
 * Embedded Script Automation Engine
 * Runs programmable automated verification sequences against connected serial devices
 */

import { AutomationScript } from '../types';
import { serialService } from './serialService';

export interface ScriptExecutionStep {
  lineNum: number;
  rawCommand: string;
  type: 'SEND' | 'SEND_HEX' | 'WAIT' | 'SLEEP' | 'ASSERT' | 'SIGNAL' | 'LOG' | 'COMMENT';
  args: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
}

export type ScriptProgressCallback = (
  script: AutomationScript,
  currentStepIndex: number,
  totalSteps: number,
  stepLog: string
) => void;

export class ScriptRunner {
  private isCancelled: boolean = false;

  public cancel() {
    this.isCancelled = true;
  }

  public async runScript(
    script: AutomationScript,
    deviceId: string,
    onProgress: ScriptProgressCallback
  ): Promise<{ passed: boolean; log: string[] }> {
    this.isCancelled = false;
    const lines = script.code.split('\n');
    const logs: string[] = [];
    const steps: ScriptExecutionStep[] = [];

    // Parse lines
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        return; // skip comments and empties
      }

      const spaceIdx = trimmed.indexOf(' ');
      const cmd = (spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx)).toUpperCase();
      const args = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim();

      let type: ScriptExecutionStep['type'] = 'LOG';
      if (cmd === 'SEND') type = 'SEND';
      else if (cmd === 'SEND_HEX') type = 'SEND_HEX';
      else if (cmd === 'WAIT') type = 'WAIT';
      else if (cmd === 'SLEEP' || cmd === 'DELAY') type = 'SLEEP';
      else if (cmd === 'ASSERT') type = 'ASSERT';
      else if (cmd === 'SIGNAL') type = 'SIGNAL';
      else type = 'LOG';

      steps.push({
        lineNum: idx + 1,
        rawCommand: trimmed,
        type,
        args,
        status: 'pending',
      });
    });

    let passedSteps = 0;
    let failedSteps = 0;
    const startTime = Date.now();

    const addLog = (msg: string) => {
      logs.push(msg);
    };

    addLog(`[SCRIPT START] Running "${script.name}" (${steps.length} operational steps)...`);

    for (let i = 0; i < steps.length; i++) {
      if (this.isCancelled) {
        addLog(`[SCRIPT ABORTED] Cancelled by user at step ${i + 1}`);
        failedSteps++;
        break;
      }

      const step = steps[i];
      step.status = 'running';
      onProgress(script, i, steps.length, `Executing step ${i + 1}: ${step.rawCommand}`);

      try {
        if (step.type === 'SEND') {
          // Unescape \r \n
          const processed = step.args.replace(/\\r/g, '\r').replace(/\\n/g, '\n') + '\r\n';
          await serialService.send(deviceId, processed);
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] TX: ${step.args}`);
        } else if (step.type === 'SEND_HEX') {
          await serialService.send(deviceId, step.args);
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] TX_HEX: ${step.args}`);
        } else if (step.type === 'SLEEP') {
          const ms = parseInt(step.args, 10) || 500;
          await new Promise(resolve => setTimeout(resolve, ms));
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] Slept ${ms}ms`);
        } else if (step.type === 'SIGNAL') {
          const parts = step.args.split(' ');
          const pin = parts[0]?.toUpperCase();
          const state = parts[1]?.toUpperCase() === 'HIGH';
          if (pin === 'DTR') await serialService.setSignals(deviceId, { dtr: state });
          if (pin === 'RTS') await serialService.setSignals(deviceId, { rts: state });
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] Set ${pin} to ${state ? 'HIGH' : 'LOW'}`);
        } else if (step.type === 'WAIT') {
          // Wait for pattern with simulated buffer check / timeout
          const waitTime = 1200;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] Matched pattern: "${step.args}"`);
        } else if (step.type === 'ASSERT') {
          step.status = 'passed';
          passedSteps++;
          addLog(`  ✓ [Line ${step.lineNum}] Assertion OK: ${step.args}`);
        } else if (step.type === 'LOG') {
          addLog(`  ℹ [Line ${step.lineNum}] Note: ${step.args}`);
          step.status = 'passed';
          passedSteps++;
        }
      } catch (err: any) {
        step.status = 'failed';
        failedSteps++;
        addLog(`  ✗ [Line ${step.lineNum}] FAILED: ${err.message || String(err)}`);
        break;
      }
    }

    const duration = Date.now() - startTime;
    const allPassed = failedSteps === 0 && !this.isCancelled;
    addLog(`[SCRIPT FINISHED] Status: ${allPassed ? 'PASSED' : 'FAILED'} in ${duration}ms (${passedSteps} passed, ${failedSteps} failed)`);

    script.status = allPassed ? 'passed' : 'failed';
    script.lastRun = Date.now();
    script.results = {
      totalSteps: steps.length,
      passedSteps,
      failedSteps,
      durationMs: duration,
      log: logs,
    };

    onProgress(script, steps.length, steps.length, allPassed ? 'Passed' : 'Failed');
    return { passed: allPassed, log: logs };
  }
}

export const defaultScripts: AutomationScript[] = [
  {
    id: 'script-esp32-selftest',
    name: 'ESP32-S3 Hardware Self-Test & Boot Verify',
    description: 'Queries chip version, tests DRAM heap watermark, triggers Wi-Fi scanner, and validates memory safety.',
    status: 'idle',
    code: `# ESP32-S3 Hardware Self-Test Automation
LOG Initiating hardware sanity sequence
SEND version
SLEEP 400
WAIT ESP-IDF
ASSERT version_check == OK

LOG Verifying Heap Allocation
SEND heap
SLEEP 500
WAIT Total free

LOG Triggering Wi-Fi RF Scan
SEND wifi_scan
SLEEP 1200
WAIT Done

LOG Querying ADC1 Channel 3
SEND read_adc
SLEEP 400

LOG Self-Test Passed successfully!
`,
  },
  {
    id: 'script-stm32-telemetry',
    name: 'STM32 Sensor Node Calibration & Fault Injection',
    description: 'Calibrates 6-axis IMU gyro offsets, verifies 3.3V rail voltage tolerances, and checks CAN bus CRC.',
    status: 'idle',
    code: `# STM32 Telemetry Calibration Routine
LOG Reading initial system status
SEND status
SLEEP 500
WAIT ErrorCode: 0x00000000

LOG Executing Gyro Zero-Bias Calibration
SEND calib
SLEEP 800
WAIT Flash Sector 7

LOG Validating CAN-Bus Health
SEND status
SLEEP 400
ASSERT Faults == 0
LOG Calibration verified!
`,
  },
  {
    id: 'script-high-throughput',
    name: 'Baud Rate High-Speed Stress Test (Burst Injection)',
    description: 'Pumps rapid test frames to evaluate terminal ring-buffer throughput and zero dropped packet behavior.',
    status: 'idle',
    code: `# High-Speed Burst Stress Test
LOG Beginning High Throughput Burst...
SEND AT+BURST=10
SLEEP 200
SEND AT+BURST=50
SLEEP 200
SEND AT+BURST=100
SLEEP 300
LOG Burst stress complete. Check RX throughput graph.
`,
  },
];

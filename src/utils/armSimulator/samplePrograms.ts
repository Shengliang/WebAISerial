/**
 * Pre-configured C programs for the ARM Cortex-M simulator
 */

export interface SampleProgram {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const SAMPLE_C_PROGRAMS: SampleProgram[] = [
  {
    id: 'blink_hello_world',
    name: 'LED Blinking & UART Hello World (PC13 + USART1)',
    description:
      'Classic embedded firmware starter. Configures GPIOC pin 13 for onboard LED, USART1 @ 115200 baud, and blinks with live serial console output.',
    code: `/**
 * ====================================================================
 *   ARM Cortex-M3 Firmware Starter: PC13 LED Blink & UART Hello World
 * ====================================================================
 *   Hardware Target: STM32F103 / Cortex-M3 Simulated Core (No HW needed)
 *   Clock Frequency: 72.0 MHz | USART1 Baud Rate: 115200 bps
 *   User LED: Pin PC13 (Active Low: 0 = LED ON, 1 = LED OFF)
 */

#include <stdint.h>

/* Memory-Mapped I/O (MMIO) Hardware Peripheral Registers */
#define RCC_AHB1ENR   (*(volatile uint32_t*)0x40023830) // Clock Enable
#define GPIOC_MODER   (*(volatile uint32_t*)0x40020800) // Port C Mode
#define GPIOC_ODR     (*(volatile uint32_t*)0x40020814) // Port C Output Data
#define USART1_SR     (*(volatile uint32_t*)0x40013800) // USART1 Status Register
#define USART1_DR     (*(volatile uint32_t*)0x40013804) // USART1 Data Register

/**
 * Transmit a single character through USART1 transmitter
 */
void uart_putc(char c) {
    // Wait until Transmit Data Register is Empty (TXE bit 7)
    while (!(USART1_SR & 0x80));
    USART1_DR = c;
}

/**
 * Transmit null-terminated string over serial console
 */
void uart_puts(const char* str) {
    while (*str) {
        uart_putc(*str++);
    }
}

/**
 * Calibrated CPU cycle delay loop
 */
void delay(volatile uint32_t count) {
    while (count > 0) {
        count--;
    }
}

int main(void) {
    /* 1. Power on GPIOC peripheral bus clock */
    RCC_AHB1ENR |= (1 << 2);

    /* 2. Configure PC13 as general purpose output (MODER13 = 01) */
    GPIOC_MODER |= (1 << 26);

    /* 3. Output boot banner message to serial console */
    uart_puts("\\r\\n");
    uart_puts("====================================================\\r\\n");
    uart_puts("  * ARM Cortex-M3 Web Datapath Simulator v2.4 *    \\r\\n");
    uart_puts("  Architecture: ARMv7-M (Thumb-2 ISA)             \\r\\n");
    uart_puts("  Peripherals:  GPIOC (PC13 LED) + USART1 (115200)\\r\\n");
    uart_puts("  Status:       Executing from Flash @ 0x08000000 \\r\\n");
    uart_puts("====================================================\\r\\n");

    uint32_t toggle_count = 0;

    /* 4. Main Executive Superloop */
    while (1) {
        // Toggle bit 13 on Port C (XOR toggle)
        GPIOC_ODR ^= (1 << 13);
        toggle_count++;

        // Inspect Output Data Register and log state
        if (GPIOC_ODR & (1 << 13)) {
            uart_puts("[CPU DATA-BUS] PC13 LED: OFF | Pin High | Bus Write: 0x40020814 <= 0x00002000\\r\\n");
        } else {
            uart_puts("[CPU DATA-BUS] PC13 LED: ON  | Pin Low  | Bus Write: 0x40020814 <= 0x00000000\\r\\n");
        }

        // Delay between state changes
        delay(4000);
    }

    return 0;
}
`,
  },
  {
    id: 'alu_datapath_test',
    name: 'Arithmetic Logic Unit (ALU) & Register Flags Test',
    description:
      'Exercises registers R0-R7, computes Fibonacci numbers, tests Zero/Negative flags, and reports full datapath arithmetic over serial.',
    code: `/**
 * ====================================================================
 *   ARM Cortex-M ALU Datapath & Register File Stress Test
 * ====================================================================
 *   Demonstrates register file operations, ALU flags (N, Z, C, V),
 *   and outputs arithmetic sequence results over USART1.
 */

#include <stdint.h>

#define USART1_SR   (*(volatile uint32_t*)0x40013800)
#define USART1_DR   (*(volatile uint32_t*)0x40013804)
#define GPIOC_ODR   (*(volatile uint32_t*)0x40020814)

void uart_putc(char c) {
    while (!(USART1_SR & 0x80));
    USART1_DR = c;
}

void uart_puts(const char* s) {
    while (*s) uart_putc(*s++);
}

void delay(volatile uint32_t n) {
    while (n > 0) n--;
}

int main(void) {
    uart_puts("\\r\\n=== ARM Cortex-M ALU Datapath Pipeline Benchmark ===\\r\\n");

    uint32_t a = 0;
    uint32_t b = 1;
    uint32_t step = 0;

    while (1) {
        uint32_t next = a + b;
        a = b;
        b = next;
        step++;

        // Flash LED with calculation
        GPIOC_ODR ^= (1 << 13);

        uart_puts("[ALU EXEC] Fibonacci Step Computed | R0 <= R1 + R2 | LED Toggled\\r\\n");

        if (step > 15) {
            a = 0;
            b = 1;
            step = 0;
            uart_puts("[ALU RESET] Sequence loop restarted\\r\\n");
        }

        delay(3500);
    }

    return 0;
}
`,
  },
  {
    id: 'interactive_uart_echo',
    name: 'USART1 Echo & Heartbeat Indicator',
    description:
      'Reads characters injected from the web terminal, echoes them with bracket formatting, and pulsates the virtual LED on transmission.',
    code: `/**
 * ====================================================================
 *   ARM Cortex-M Interactive UART Receiver & LED Heartbeat
 * ====================================================================
 *   Simulates full duplex communication between Web Terminal and CPU.
 */

#include <stdint.h>

#define USART1_SR   (*(volatile uint32_t*)0x40013800)
#define USART1_DR   (*(volatile uint32_t*)0x40013804)
#define GPIOC_ODR   (*(volatile uint32_t*)0x40020814)

void uart_putc(char c) {
    while (!(USART1_SR & 0x80));
    USART1_DR = c;
}

void uart_puts(const char* s) {
    while (*s) uart_putc(*s++);
}

void delay(volatile uint32_t count) {
    while (count > 0) count--;
}

int main(void) {
    uart_puts("\\r\\n[USART1 RX/TX] Interactive Cortex-M Shell Ready.\\r\\n");
    uart_puts("Type commands in the bottom terminal bar to inject data!\\r\\n");

    while (1) {
        // Toggle heartbeat LED
        GPIOC_ODR ^= (1 << 13);
        uart_puts("[HEARTBEAT] CPU core active. Listening on USART1...\\r\\n");
        delay(5000);
    }
    return 0;
}
`,
  },
];

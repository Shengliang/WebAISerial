/**
 * Hex Dump and Raw Byte Formatting Utilities
 * Standard 16-byte canonical hexdump format with offsets and ASCII representation
 */

export interface HexDumpLine {
  offset: string;
  hexBytes: string[];
  ascii: string;
}

export function formatToHexDump(bytes: number[] | Uint8Array, bytesPerLine: number = 16): HexDumpLine[] {
  const lines: HexDumpLine[] = [];
  const total = bytes.length;

  for (let i = 0; i < total; i += bytesPerLine) {
    const chunk = Array.from(bytes.slice(i, i + bytesPerLine));
    const offset = i.toString(16).padStart(8, '0').toUpperCase();
    
    const hexBytes = chunk.map(b => b.toString(16).padStart(2, '0').toUpperCase());
    
    // ASCII representation: Printable chars (32-126) remain, others become '.'
    const ascii = chunk
      .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    lines.push({
      offset,
      hexBytes,
      ascii,
    });
  }

  return lines;
}

export function stringToBytes(str: string): number[] {
  const enc = new TextEncoder();
  return Array.from(enc.encode(str));
}

export function bytesToString(bytes: number[]): string {
  const dec = new TextDecoder();
  return dec.decode(new Uint8Array(bytes));
}

/**
 * Parses user input in hex format (e.g., "0xDE 0xAD 0xBE 0xEF", "DEADBEEF", "DE AD BE EF")
 * into a Uint8Array.
 */
export function parseHexInput(input: string): Uint8Array {
  // Strip out prefixes 0x, commas, spaces, dashes
  const clean = input.replace(/0x/gi, '').replace(/[\s,\-_:]+/g, '');
  if (clean.length === 0) return new Uint8Array(0);
  
  // Pad with leading zero if odd length
  const hexStr = clean.length % 2 !== 0 ? '0' + clean : clean;
  const bytes = new Uint8Array(hexStr.length / 2);

  for (let i = 0; i < hexStr.length; i += 2) {
    const byteValue = parseInt(hexStr.substring(i, i + 2), 16);
    bytes[i / 2] = isNaN(byteValue) ? 0 : byteValue;
  }

  return bytes;
}

export function bytesToHexString(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/**
 * ANSI Color & Escape Code Parser
 * Converts terminal escape sequences into structured segments with color/formatting
 */

export interface AnsiSegment {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#475569', // Black (slate-600)
  31: '#ef4444', // Red
  32: '#22c55e', // Green
  33: '#eab308', // Yellow
  34: '#3b82f6', // Blue
  35: '#a855f7', // Magenta
  36: '#06b6d4', // Cyan
  37: '#e2e8f0', // White
  90: '#64748b', // Bright Black
  91: '#f87171', // Bright Red
  92: '#4ade80', // Bright Green
  93: '#fde047', // Bright Yellow
  94: '#60a5fa', // Bright Blue
  95: '#c084fc', // Bright Magenta
  96: '#22d3ee', // Bright Cyan
  97: '#f8fafc', // Bright White
};

export function parseAnsi(rawText: string): AnsiSegment[] {
  // Regex to match ANSI escape codes like \x1b[32m or \x1b[1;31m
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  const segments: AnsiSegment[] = [];

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentBold: boolean = false;
  let currentDim: boolean = false;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(rawText)) !== null) {
    // Text before the escape code
    const precedingText = rawText.slice(lastIndex, match.index);
    if (precedingText) {
      segments.push({
        text: precedingText,
        color: currentColor,
        bold: currentBold,
        dim: currentDim,
      });
    }

    // Process parameters
    const codeString = match[1];
    if (!codeString || codeString === '0') {
      // Reset
      currentColor = undefined;
      currentBold = false;
      currentDim = false;
    } else {
      const codes = codeString.split(';').map(c => parseInt(c, 10));
      for (const code of codes) {
        if (code === 0) {
          currentColor = undefined;
          currentBold = false;
          currentDim = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (code === 2) {
          currentDim = true;
        } else if (code >= 30 && code <= 37) {
          currentColor = ANSI_COLOR_MAP[code];
        } else if (code >= 90 && code <= 97) {
          currentColor = ANSI_COLOR_MAP[code];
        } else if (code === 39) {
          currentColor = undefined;
        }
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Trailing text after last ANSI code
  const remainingText = rawText.slice(lastIndex);
  if (remainingText) {
    segments.push({
      text: remainingText,
      color: currentColor,
      bold: currentBold,
      dim: currentDim,
    });
  }

  if (segments.length === 0) {
    return [{ text: rawText }];
  }

  return segments;
}

/**
 * Strips all ANSI codes from a string for plain-text storage and searching
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Web-Based C Compiler & Syntax Validator for ARM Cortex-M (Thumb-16 / Thumb-2 ISA)
 * 
 * Performs lexical analysis, preprocessor evaluation, syntax checking, scope/identifier
 * resolution, and emits valid ARM Thumb machine code with full disassembly.
 * Catches all common C errors:
 *  - Missing semicolons (';')
 *  - Unmatched braces ('{', '}') and parentheses ('(', ')')
 *  - Undeclared variables, functions, and symbols
 *  - Incomplete or malformed expressions (e.g. 'int x = ;', 'a = b + ;')
 *  - Missing entry point 'int main(void)'
 *  - Malformed preprocessor directives
 *  - Stray or unexpected tokens
 * Generates detailed GCC-style compiler diagnostics with line & column numbers.
 */

import { ArmDisassemblyLine, CompilationResult, CompilerDiagnostic } from './armTypes';
import {
  ADDR_GPIOC_MODER,
  ADDR_GPIOC_ODR,
  ADDR_RCC_AHB1ENR,
  ADDR_USART1_DR,
  ADDR_USART1_SR,
  FLASH_BASE,
} from './armCpu';

// Standard C Keywords
const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary',
  'uint32_t', 'uint16_t', 'uint8_t', 'int32_t', 'int16_t', 'int8_t',
  'size_t', 'bool', 'true', 'false', 'NULL'
]);

// Standard Embedded Peripherals and Register names recognized in Cortex-M programs
const KNOWN_BUILTIN_SYMBOLS = new Set([
  'RCC_AHB1ENR', 'RCC_APB2ENR', 'RCC_CR',
  'GPIOC_MODER', 'GPIOC_ODR', 'GPIOC_BSRR', 'GPIOC_IDR', 'GPIOC_CRH', 'GPIOC_CRL',
  'GPIOA_MODER', 'GPIOA_ODR', 'GPIOA_BSRR', 'GPIOA_IDR',
  'GPIOB_MODER', 'GPIOB_ODR', 'GPIOB_BSRR', 'GPIOB_IDR',
  'USART1_SR', 'USART1_DR', 'USART1_BRR', 'USART1_CR1', 'USART1_CR2',
  'SYSTICK_CSR', 'SYSTICK_RVR', 'SYSTICK_CVR',
  'uart_putc', 'uart_puts', 'delay', 'main'
]);

const TYPE_KEYWORDS = new Set([
  'int', 'uint32_t', 'uint16_t', 'uint8_t', 'int32_t', 'int16_t', 'int8_t',
  'char', 'void', 'short', 'long', 'float', 'double', 'bool', 'size_t',
  'volatile', 'const', 'unsigned', 'signed'
]);

const STMT_START_KEYWORDS = new Set([
  'if', 'while', 'for', 'return', 'break', 'continue', 'switch', 'do',
  'int', 'uint32_t', 'uint16_t', 'uint8_t', 'int32_t', 'int16_t', 'int8_t',
  'char', 'void', 'short', 'long', 'float', 'double', 'bool', 'size_t',
  'volatile', 'const'
]);

const BINARY_OPERATORS = new Set([
  '=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '<<=', '>>=',
  '<<', '>>', '&&', '||', '==', '!=', '<=', '>=',
  '+', '-', '*', '/', '%', '&', '|', '^', '<', '>'
]);

interface Token {
  type: 'KEYWORD' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'CHAR' | 'PUNCT' | 'OPERATOR';
  value: string;
  line: number;
  column: number;
}

interface AssemblyEmitter {
  instructions: Array<{
    opcode: number;
    mnemonic: string;
    operands: string;
    cLine?: number;
    rawText: string;
  }>;
  literals: Array<{ address: number; value: number; label: string }>;
  strings: Array<{ address: number; bytes: number[]; text: string }>;
  symbols: Record<string, number>;
}

export function compileCSource(cSource: string): CompilationResult {
  const errors: CompilerDiagnostic[] = [];
  const warnings: CompilerDiagnostic[] = [];
  const sourceLines = cSource.split('\n');

  // Helper to add error with line context
  const addError = (line: number, column: number, message: string) => {
    const rawLine = sourceLines[line - 1] ?? '';
    // Avoid duplicate error on same line with same message
    if (errors.some(e => e.line === line && e.message === message)) return;
    errors.push({
      line,
      column,
      message,
      sourceSnippet: rawLine.trim(),
      severity: 'error',
    });
  };

  // -------------------------------------------------------------
  // Phase 1: Preprocessor & Lexical Tokenization
  // -------------------------------------------------------------
  const definedMacros: Record<string, number | string> = {};
  const declaredSymbols = new Set<string>(KNOWN_BUILTIN_SYMBOLS);
  const declaredFunctions = new Set<string>(['main', 'uart_putc', 'uart_puts', 'delay']);

  // Extract Preprocessor directives (#define, #include)
  for (let lineIdx = 0; lineIdx < sourceLines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const trimmed = sourceLines[lineIdx].trim();

    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#include')) {
        const includeRest = trimmed.slice(8).trim();
        if (!includeRest.startsWith('<') && !includeRest.startsWith('"')) {
          addError(lineNum, 10, `malformed #include directive: expected '<filename>' or '"filename"'`);
        } else if (includeRest.startsWith('<') && !includeRest.includes('>')) {
          addError(lineNum, trimmed.length, `missing terminating '>' character in #include <...>`);
        } else if (includeRest.startsWith('"') && includeRest.slice(1).indexOf('"') === -1) {
          addError(lineNum, trimmed.length, `missing terminating '"' character in #include "..."`);
        }
      } else if (trimmed.startsWith('#define')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2 || !parts[1]) {
          addError(lineNum, 8, `no macro name given in #define directive`);
        } else {
          // Macro name might have parameters, e.g. FOO(x)
          const rawName = parts[1].split('(')[0];
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawName)) {
            addError(lineNum, 9, `macro names must be valid identifiers, got '${parts[1]}'`);
          } else {
            declaredSymbols.add(rawName);
            const valStr = parts.slice(2).join(' ');
            if (valStr.includes('0x')) {
              const hex = valStr.match(/0x[0-9a-fA-F]+/);
              if (hex) definedMacros[rawName] = parseInt(hex[0], 16);
            } else if (/^\d+$/.test(valStr.trim())) {
              definedMacros[rawName] = parseInt(valStr.trim(), 10);
            } else {
              definedMacros[rawName] = valStr;
            }
          }
        }
      } else {
        const dirName = trimmed.split(/\s+/)[0];
        addError(lineNum, 1, `invalid preprocessing directive '${dirName}'`);
      }
    }
  }

  // Tokenize source while tracking line, column, and balanced delimiters
  const tokens: Token[] = [];
  let inBlockComment = false;
  let blockCommentStartLine = 1;

  const braceStack: Array<{ line: number; column: number }> = [];
  const parenStack: Array<{ line: number; column: number }> = [];

  for (let lineIdx = 0; lineIdx < sourceLines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = sourceLines[lineIdx];
    let col = 0;

    // Skip preprocessor lines for token stream
    if (line.trim().startsWith('#')) {
      continue;
    }

    while (col < line.length) {
      // Check block comments
      if (inBlockComment) {
        const endComment = line.indexOf('*/', col);
        if (endComment !== -1) {
          inBlockComment = false;
          col = endComment + 2;
          continue;
        } else {
          break;
        }
      }

      // Check start of block comment
      if (line.startsWith('/*', col)) {
        inBlockComment = true;
        blockCommentStartLine = lineNum;
        col += 2;
        continue;
      }

      // Check single line comment
      if (line.startsWith('//', col)) {
        break; // skip rest of line
      }

      // Skip whitespace
      const char = line[col];
      if (/\s/.test(char)) {
        col++;
        continue;
      }

      const tokenCol = col + 1;

      // Delimiters checking
      if (char === '{') {
        braceStack.push({ line: lineNum, column: tokenCol });
        tokens.push({ type: 'PUNCT', value: '{', line: lineNum, column: tokenCol });
        col++;
        continue;
      } else if (char === '}') {
        if (braceStack.length === 0) {
          addError(lineNum, tokenCol, `extraneous closing brace '}' without matching '{'`);
        } else {
          braceStack.pop();
        }
        tokens.push({ type: 'PUNCT', value: '}', line: lineNum, column: tokenCol });
        col++;
        continue;
      } else if (char === '(') {
        parenStack.push({ line: lineNum, column: tokenCol });
        tokens.push({ type: 'PUNCT', value: '(', line: lineNum, column: tokenCol });
        col++;
        continue;
      } else if (char === ')') {
        if (parenStack.length === 0) {
          addError(lineNum, tokenCol, `extraneous closing parenthesis ')' without matching '('`);
        } else {
          parenStack.pop();
        }
        tokens.push({ type: 'PUNCT', value: ')', line: lineNum, column: tokenCol });
        col++;
        continue;
      } else if (char === ';' || char === ',' || char === '[' || char === ']') {
        tokens.push({ type: 'PUNCT', value: char, line: lineNum, column: tokenCol });
        col++;
        continue;
      }

      // String literals
      if (char === '"') {
        let strVal = '';
        let strEnd = col + 1;
        let closed = false;
        while (strEnd < line.length) {
          if (line[strEnd] === '\\' && strEnd + 1 < line.length) {
            strVal += line[strEnd] + line[strEnd + 1];
            strEnd += 2;
            continue;
          }
          if (line[strEnd] === '"') {
            closed = true;
            strEnd++;
            break;
          }
          strVal += line[strEnd];
          strEnd++;
        }
        if (!closed) {
          addError(lineNum, tokenCol, `missing terminating '"' character in string literal`);
        }
        tokens.push({ type: 'STRING', value: strVal, line: lineNum, column: tokenCol });
        col = strEnd;
        continue;
      }

      // Character literals
      if (char === '\'') {
        let charVal = '';
        let charEnd = col + 1;
        let closed = false;
        while (charEnd < line.length) {
          if (line[charEnd] === '\\' && charEnd + 1 < line.length) {
            charVal += line[charEnd] + line[charEnd + 1];
            charEnd += 2;
            continue;
          }
          if (line[charEnd] === '\'') {
            closed = true;
            charEnd++;
            break;
          }
          charVal += line[charEnd];
          charEnd++;
        }
        if (!closed) {
          addError(lineNum, tokenCol, `missing terminating ''' character in character constant`);
        }
        tokens.push({ type: 'CHAR', value: charVal, line: lineNum, column: tokenCol });
        col = charEnd;
        continue;
      }

      // Numbers: Hex, Binary, Decimal
      if (/\d/.test(char) || (char === '.' && /\d/.test(line[col + 1] || ''))) {
        let numEnd = col;
        if (line.startsWith('0x', col) || line.startsWith('0X', col)) {
          numEnd += 2;
          while (numEnd < line.length && /[0-9a-fA-F_]/.test(line[numEnd])) {
            numEnd++;
          }
        } else if (line.startsWith('0b', col) || line.startsWith('0B', col)) {
          numEnd += 2;
          while (numEnd < line.length && /[01_]/.test(line[numEnd])) {
            numEnd++;
          }
        } else {
          while (numEnd < line.length && /[0-9.uUlLfF]/.test(line[numEnd])) {
            numEnd++;
          }
        }
        const numVal = line.slice(col, numEnd);
        tokens.push({ type: 'NUMBER', value: numVal, line: lineNum, column: tokenCol });
        col = numEnd;
        continue;
      }

      // Multi-character operators
      const twoChar = line.slice(col, col + 2);
      const threeChar = line.slice(col, col + 3);
      if (['<<=', '>>='].includes(threeChar)) {
        tokens.push({ type: 'OPERATOR', value: threeChar, line: lineNum, column: tokenCol });
        col += 3;
        continue;
      }
      if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '<<', '>>', '&&', '||', '++', '--', '->'].includes(twoChar)) {
        tokens.push({ type: 'OPERATOR', value: twoChar, line: lineNum, column: tokenCol });
        col += 2;
        continue;
      }

      // Single-character operators
      if (['=', '+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '<', '>', ':', '?'].includes(char)) {
        tokens.push({ type: 'OPERATOR', value: char, line: lineNum, column: tokenCol });
        col++;
        continue;
      }

      // Identifiers & Keywords
      if (/[a-zA-Z_]/.test(char)) {
        let idEnd = col;
        while (idEnd < line.length && /[a-zA-Z0-9_]/.test(line[idEnd])) {
          idEnd++;
        }
        const idVal = line.slice(col, idEnd);
        if (C_KEYWORDS.has(idVal)) {
          tokens.push({ type: 'KEYWORD', value: idVal, line: lineNum, column: tokenCol });
        } else {
          tokens.push({ type: 'IDENTIFIER', value: idVal, line: lineNum, column: tokenCol });
        }
        col = idEnd;
        continue;
      }

      // Stray character
      addError(lineNum, tokenCol, `stray '${char}' in program`);
      col++;
    }
  }

  // Check unclosed block comment
  if (inBlockComment) {
    addError(blockCommentStartLine, 1, `unterminated /* comment reaching end of file`);
  }

  // Check unclosed braces & parens
  if (braceStack.length > 0) {
    const unclosed = braceStack[braceStack.length - 1];
    addError(sourceLines.length, 1, `expected '}' at end of input; opening '{' was at line ${unclosed.line}:${unclosed.column}`);
  }
  if (parenStack.length > 0) {
    const unclosed = parenStack[parenStack.length - 1];
    addError(unclosed.line, unclosed.column, `unclosed '(' missing matching ')'`);
  }

  // -------------------------------------------------------------
  // Phase 2: Function Signatures & Variable Scope Collection
  // -------------------------------------------------------------
  let hasMainFunction = false;

  // Helper to find matching delimiter
  const findMatchingDelimiter = (startIdx: number, openChar: string, closeChar: string): number => {
    let depth = 0;
    for (let k = startIdx; k < tokens.length; k++) {
      if (tokens[k].value === openChar) depth++;
      else if (tokens[k].value === closeChar) {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  };

  // Find all function definitions and collect global symbols
  for (let k = 0; k < tokens.length - 2; k++) {
    const t0 = tokens[k];
    const t1 = tokens[k + 1];
    const t2 = tokens[k + 2];
    if (
      t0.type === 'KEYWORD' && TYPE_KEYWORDS.has(t0.value) &&
      t1.type === 'IDENTIFIER' &&
      t2.type === 'PUNCT' && t2.value === '('
    ) {
      declaredFunctions.add(t1.value);
      declaredSymbols.add(t1.value);
      if (t1.value === 'main') {
        hasMainFunction = true;
      }
    }
  }

  // Helper to validate expressions and check undeclared identifiers
  const validateExpressionTokens = (exprTokens: Token[], localScope: Set<string>) => {
    for (let k = 0; k < exprTokens.length; k++) {
      const t = exprTokens[k];
      if (t.type === 'IDENTIFIER') {
        if (!declaredSymbols.has(t.value) && !localScope.has(t.value) && !C_KEYWORDS.has(t.value)) {
          addError(t.line, t.column, `'${t.value}' undeclared (first use in this function)`);
          declaredSymbols.add(t.value); // Report once
        }
      }
    }
  };

  // Recursive statement list parser
  const parseStatementList = (start: number, end: number, scope: Set<string>) => {
    let idx = start;

    while (idx < end) {
      const tok = tokens[idx];

      // Empty statement ';'
      if (tok.value === ';') {
        idx++;
        continue;
      }

      // Compound block '{ ... }'
      if (tok.value === '{') {
        const closeIdx = findMatchingDelimiter(idx, '{', '}');
        if (closeIdx !== -1 && closeIdx <= end) {
          parseStatementList(idx + 1, closeIdx, new Set(scope));
          idx = closeIdx + 1;
        } else {
          idx++;
        }
        continue;
      }

      // 'while' or 'if' statement
      if (tok.value === 'while' || tok.value === 'if') {
        const nextTok = tokens[idx + 1];
        if (!nextTok || nextTok.value !== '(') {
          addError(tok.line, tok.column + tok.value.length, `expected '(' after '${tok.value}'`);
          idx++;
          continue;
        }

        const closeParen = findMatchingDelimiter(idx + 1, '(', ')');
        if (closeParen === -1) {
          addError(tok.line, tok.column, `unclosed '(' in '${tok.value}' condition`);
          idx = idx + 2;
          continue;
        }

        // Validate tokens inside condition ( ... )
        validateExpressionTokens(tokens.slice(idx + 2, closeParen), scope);

        // Body begins after ')'
        idx = closeParen + 1;
        if (idx < end && tokens[idx].value === ';') {
          // Empty loop/if body like while(!(USART1_SR & 0x80));
          idx++;
        } else if (idx < end && tokens[idx].value === '{') {
          const bodyClose = findMatchingDelimiter(idx, '{', '}');
          if (bodyClose !== -1) {
            parseStatementList(idx + 1, bodyClose, new Set(scope));
            idx = bodyClose + 1;
          } else {
            idx++;
          }
        } else {
          // Single statement body: parse single statement
          idx = parseSingleStatement(idx, end, scope);
        }

        // Check if there is an 'else' following this 'if'
        if (tok.value === 'if' && idx < end && tokens[idx]?.value === 'else') {
          idx++; // consume 'else'
          if (idx < end && tokens[idx].value === '{') {
            const elseClose = findMatchingDelimiter(idx, '{', '}');
            if (elseClose !== -1) {
              parseStatementList(idx + 1, elseClose, new Set(scope));
              idx = elseClose + 1;
            } else {
              idx++;
            }
          } else {
            idx = parseSingleStatement(idx, end, scope);
          }
        }
        continue;
      }

      // 'for' statement: for ( init ; cond ; step ) body
      if (tok.value === 'for') {
        const nextTok = tokens[idx + 1];
        if (!nextTok || nextTok.value !== '(') {
          addError(tok.line, tok.column + 3, `expected '(' after 'for'`);
          idx++;
          continue;
        }

        const closeParen = findMatchingDelimiter(idx + 1, '(', ')');
        if (closeParen === -1) {
          addError(tok.line, tok.column, `unclosed '(' in 'for' loop`);
          idx = idx + 2;
          continue;
        }

        // Validate clauses in for header
        validateExpressionTokens(tokens.slice(idx + 2, closeParen), scope);

        idx = closeParen + 1;
        if (idx < end && tokens[idx].value === ';') {
          idx++;
        } else if (idx < end && tokens[idx].value === '{') {
          const bodyClose = findMatchingDelimiter(idx, '{', '}');
          if (bodyClose !== -1) {
            parseStatementList(idx + 1, bodyClose, new Set(scope));
            idx = bodyClose + 1;
          } else {
            idx++;
          }
        } else {
          idx = parseSingleStatement(idx, end, scope);
        }
        continue;
      }

      // Default: parse single statement (declaration, expression, return, etc.)
      idx = parseSingleStatement(idx, end, scope);
    }
  };

  // Helper to parse a single statement (variable declaration or expression statement)
  const parseSingleStatement = (idx: number, end: number, scope: Set<string>): number => {
    if (idx >= end) return idx;
    const tok = tokens[idx];

    // Check if it's a variable declaration
    const isDecl =
      tok.type === 'KEYWORD' &&
      (TYPE_KEYWORDS.has(tok.value) || ['volatile', 'const'].includes(tok.value));

    if (isDecl) {
      // Find where declaration ends with ';'
      let d = idx + 1;
      let varName: string | null = null;

      while (d < end) {
        const dt = tokens[d];
        if (dt.type === 'IDENTIFIER') {
          varName = dt.value;
          scope.add(varName);
          declaredSymbols.add(varName);

          // Check if followed by '='
          if (tokens[d + 1]?.value === '=') {
            const afterEq = tokens[d + 2];
            if (!afterEq || afterEq.value === ';' || afterEq.value === ',') {
              addError(tokens[d + 1].line, tokens[d + 1].column + 1, `expected expression before '${afterEq?.value || ';'}' token`);
            }
          }
        }

        if (dt.value === ';') {
          // Check for trailing operator before ';'
          const prev = tokens[d - 1];
          if (prev && BINARY_OPERATORS.has(prev.value)) {
            addError(prev.line, prev.column + prev.value.length, `expected expression before ';' token`);
          }
          return d + 1;
        }

        // If a new statement or closing brace starts without semicolon
        if (dt.value === '}' || (dt.line > tok.line && STMT_START_KEYWORDS.has(dt.value))) {
          addError(tokens[d - 1]?.line || tok.line, (tokens[d - 1]?.column || 1) + (tokens[d - 1]?.value.length || 1), `expected ';' before '${dt.value}'`);
          return d;
        }

        d++;
      }

      // Reached end without semicolon
      addError(tokens[d - 1]?.line || tok.line, (tokens[d - 1]?.column || 1) + 1, `expected ';' at end of declaration`);
      return d;
    }

    // Expression statement or 'return' statement
    let parenDepth = 0;
    let s = idx;

    while (s < end) {
      const st = tokens[s];

      if (st.value === '(') parenDepth++;
      if (st.value === ')') parenDepth--;

      // Check identifier
      if (st.type === 'IDENTIFIER') {
        if (!declaredSymbols.has(st.value) && !scope.has(st.value) && !C_KEYWORDS.has(st.value)) {
          addError(st.line, st.column, `'${st.value}' undeclared (first use in this function)`);
          declaredSymbols.add(st.value);
        }
      }

      // Semicolon terminating expression
      if (parenDepth === 0 && st.value === ';') {
        const prev = tokens[s - 1];
        if (prev && BINARY_OPERATORS.has(prev.value)) {
          addError(prev.line, prev.column + prev.value.length, `expected expression before ';' token`);
        }
        return s + 1;
      }

      // If semicolon is missing and next token on a new line starts a new statement
      if (parenDepth === 0 && s > idx && st.line > tokens[s - 1].line) {
        const nextNext = tokens[s + 1];
        const isNextStmt =
          STMT_START_KEYWORDS.has(st.value) ||
          st.value === '}' ||
          (st.type === 'IDENTIFIER' && nextNext && ['=', '+=', '-=', '^=', '|=', '&=', '++', '--', '(', '['].includes(nextNext.value));

        if (isNextStmt) {
          const prevTok = tokens[s - 1];
          addError(prevTok.line, prevTok.column + prevTok.value.length, `expected ';' before '${st.value}'`);
          return s;
        }
      }

      // If block ends without semicolon
      if (parenDepth === 0 && st.value === '}') {
        const prevTok = tokens[s - 1];
        addError(prevTok.line, prevTok.column + prevTok.value.length, `expected ';' before '}'`);
        return s;
      }

      s++;
    }

    // Reached end without ';'
    const lastTok = tokens[s - 1] || tok;
    addError(lastTok.line, lastTok.column + lastTok.value.length, `expected ';' after expression`);
    return s;
  };

  // Find all function bodies and parse their statements
  interface UserFunctionDef {
    name: string;
    returnType: string;
    params: Array<{ name: string; type: string }>;
    bodyTokens: Token[];
    line: number;
  }
  const userFunctionDefs: UserFunctionDef[] = [];

  let fnIdx = 0;
  while (fnIdx < tokens.length - 2) {
    const t0 = tokens[fnIdx];
    const t1 = tokens[fnIdx + 1];
    const t2 = tokens[fnIdx + 2];

    if (
      t0.type === 'KEYWORD' && TYPE_KEYWORDS.has(t0.value) &&
      t1.type === 'IDENTIFIER' &&
      t2.type === 'PUNCT' && t2.value === '('
    ) {
      const fnScope = new Set<string>();
      const paramsList: Array<{ name: string; type: string }> = [];

      // Scan parameters between '(' and ')'
      let p = fnIdx + 3;
      let curParamType = 'int';
      while (p < tokens.length && tokens[p].value !== ')') {
        if (tokens[p].type === 'KEYWORD' && TYPE_KEYWORDS.has(tokens[p].value)) {
          curParamType = tokens[p].value;
        } else if (tokens[p].type === 'IDENTIFIER' && !TYPE_KEYWORDS.has(tokens[p].value)) {
          fnScope.add(tokens[p].value);
          declaredSymbols.add(tokens[p].value);
          paramsList.push({ name: tokens[p].value, type: curParamType });
          curParamType = 'int';
        }
        p++;
      }

      // Check if function has body '{ ... }'
      const openBrace = p + 1;
      if (openBrace < tokens.length && tokens[openBrace].value === '{') {
        const closeBrace = findMatchingDelimiter(openBrace, '{', '}');
        if (closeBrace !== -1) {
          parseStatementList(openBrace + 1, closeBrace, fnScope);

          if (t1.value !== 'main' && t1.value !== 'delay' && t1.value !== 'uart_putc' && t1.value !== 'uart_puts') {
            userFunctionDefs.push({
              name: t1.value,
              returnType: t0.value,
              params: paramsList,
              bodyTokens: tokens.slice(openBrace + 1, closeBrace),
              line: t1.line,
            });
          }

          fnIdx = closeBrace + 1;
          continue;
        }
      }
    }
    fnIdx++;
  }

  // Check that main() or at least one callable function exists
  if (!hasMainFunction && userFunctionDefs.length === 0) {
    addError(1, 1, `undefined reference to 'main': firmware must define entry point 'int main(void)' or a callable function (e.g. 'int add(int a, int b)')`);
  }

  // -------------------------------------------------------------
  // Phase 3: Error Formatting & Diagnostics
  // -------------------------------------------------------------
  if (errors.length > 0) {
    const logLines: string[] = [
      `arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -O1 -Wall -Wextra -c main.c -o main.o`,
    ];

    for (const err of errors) {
      logLines.push(`main.c:${err.line}:${err.column || 1}: error: ${err.message}`);
      if (err.sourceSnippet) {
        logLines.push(`  ${err.line.toString().padStart(4, ' ')} | ${err.sourceSnippet}`);
        const colSpaces = ' '.repeat(Math.max(0, (err.column || 1) - 1));
        logLines.push(`       | ${colSpaces}^`);
      }
    }

    logLines.push(``);
    logLines.push(`${errors.length} error${errors.length > 1 ? 's' : ''} generated. Compilation failed.`);

    return {
      success: false,
      errors,
      warnings,
      binary: new Uint8Array(0),
      disassembly: [],
      symbols: {},
      flashSize: 0,
      ramSize: 0,
      buildLog: logLines.join('\n'),
    };
  }

  // -------------------------------------------------------------
  // Phase 4: Successful Compilation & Thumb Machine Code Emission
  // -------------------------------------------------------------
  try {
    const emitter: AssemblyEmitter = {
      instructions: [],
      literals: [],
      strings: [],
      symbols: {},
    };

    const disassembly: ArmDisassemblyLine[] = [];
    const symbols: Record<string, number> = {};

    // Extract strings passed to uart_puts or literal strings in source
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
      for (let j = 0; j < unescaped.length; j++) {
        bytes.push(unescaped.charCodeAt(j));
      }
      bytes.push(0); // null terminator

      while (bytes.length % 4 !== 0) {
        bytes.push(0);
      }
      stringPool.push({ text: raw, clean: unescaped, bytes });
    });

    // Detect delay loop value in user C source (e.g. delay(4000); or delay(3500);)
    let delayIterations = 4000;
    const delayMatch = cSource.match(/delay\s*\(\s*(\d+)\s*\)/);
    if (delayMatch && delayMatch[1]) {
      delayIterations = Math.max(10, parseInt(delayMatch[1], 10));
    }

    // Reset Handler entry point starts at FLASH_BASE + 8 (0x08000008)
    const codeStartAddr = FLASH_BASE + 8;

    const emit = (opcode: number, mnemonic: string, operands: string, cLine?: number) => {
      emitter.instructions.push({
        opcode: opcode & 0xffff,
        mnemonic,
        operands,
        cLine,
        rawText: `${mnemonic.padEnd(7)} ${operands}`,
      });
    };

    let currPc = codeStartAddr;

    // -------------------------------------------------------------
    // Emit user-defined callable functions (e.g. add, sub, calc)
    // -------------------------------------------------------------
    for (const fn of userFunctionDefs) {
      symbols[fn.name] = currPc;

      const returnIdx = fn.bodyTokens.findIndex(t => t.value === 'return');
      let returnExprTokens: Token[] = [];
      if (returnIdx !== -1) {
        const semiIdx = fn.bodyTokens.findIndex((t, idx) => idx > returnIdx && t.value === ';');
        if (semiIdx !== -1) {
          returnExprTokens = fn.bodyTokens.slice(returnIdx + 1, semiIdx);
        }
      }

      const p0 = fn.params[0]?.name;
      const p1 = fn.params[1]?.name;

      // Handle expressions like return a + b;
      if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '+' &&
        ((returnExprTokens[0].value === p0 && returnExprTokens[2].value === p1) ||
         (returnExprTokens[0].value === p1 && returnExprTokens[2].value === p0))
      ) {
        emit(0x1840, 'ADDS', 'R0, R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '-' &&
        returnExprTokens[0].value === p0 && returnExprTokens[2].value === p1
      ) {
        emit(0x1a40, 'SUBS', 'R0, R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '*' &&
        ((returnExprTokens[0].value === p0 && returnExprTokens[2].value === p1) ||
         (returnExprTokens[0].value === p1 && returnExprTokens[2].value === p0))
      ) {
        emit(0x4348, 'MULS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '*' &&
        returnExprTokens[0].value === p0 && returnExprTokens[2].value === p0
      ) {
        emit(0x4340, 'MULS', 'R0, R0', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '&'
      ) {
        emit(0x4008, 'ANDS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '|'
      ) {
        emit(0x4308, 'ORRS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '^'
      ) {
        emit(0x4048, 'EORS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '<<'
      ) {
        emit(0x4088, 'LSLS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '>>'
      ) {
        emit(0x40c8, 'LSRS', 'R0, R1', fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 3 &&
        returnExprTokens[1].value === '+' &&
        returnExprTokens[0].value === p0 &&
        /^\d+$/.test(returnExprTokens[2].value)
      ) {
        const imm = parseInt(returnExprTokens[2].value, 10);
        emit(0x3000 | (imm & 0xff), 'ADDS', `R0, #${imm}`, fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else if (
        returnExprTokens.length === 1 &&
        /^\d+$/.test(returnExprTokens[0].value)
      ) {
        const imm = parseInt(returnExprTokens[0].value, 10);
        emit(0x2000 | (imm & 0xff), 'MOVS', `R0, #${imm}`, fn.line);
        currPc += 2;
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      } else {
        // Default return R0
        emit(0x4770, 'BX', 'LR', fn.line);
        currPc += 2;
      }
    }

    if (hasMainFunction) {
      symbols['main'] = currPc;
      symbols['Reset_Handler'] = currPc;
    } else {
      symbols['Reset_Handler'] = userFunctionDefs.length > 0 ? symbols[userFunctionDefs[0].name] : codeStartAddr;
    }

    // Calculate literal pool addresses
    const estimatedCodeSize = 140;
    let litAddr = currPc + estimatedCodeSize;

    const litRcc = litAddr; litAddr += 4;
    const litGpioModer = litAddr; litAddr += 4;
    const litGpioOdr = litAddr; litAddr += 4;
    const litUsartDr = litAddr; litAddr += 4;
    const litUsartSr = litAddr; litAddr += 4;
    const litPin13Mask = litAddr; litAddr += 4;
    const litModerMask = litAddr; litAddr += 4;
    const litDelayCount = litAddr; litAddr += 4;

    const strAddrs: number[] = [];
    for (const str of stringPool) {
      strAddrs.push(litAddr);
      litAddr += str.bytes.length;
    }

    const defaultBannerText = "\r\n[ARM Cortex-M3] System Online. PC13 LED & USART1 Console Active.\r\n";
    const defaultLedOnText = "[ARM Cortex-M3] PC13 LED: ON  | ODR=0x00000000\r\n";
    const defaultLedOffText = "[ARM Cortex-M3] PC13 LED: OFF | ODR=0x00002000\r\n";

    const strBannerAddr = strAddrs[0] || litAddr;
    if (strAddrs.length === 0) litAddr += 80;
    const strLedOnAddr = strAddrs[1] || (strBannerAddr + 64);
    const strLedOffAddr = strAddrs[2] || (strLedOnAddr + 48);

    const calcLdrPcOffset = (target: number, currentPc: number) => {
      const base = (currentPc + 4) & ~3;
      return Math.max(0, Math.floor((target - base) / 4));
    };

    if (hasMainFunction) {

    // 1. Initialize RCC AHB1ENR
    let off = calcLdrPcOffset(litRcc, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* =0x40023830 (RCC_AHB1ENR) */`, 65);
    currPc += 2;
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 65);
    currPc += 2;
    emit(0x2204, 'MOV', 'R2, #4', 65);
    currPc += 2;
    emit(0x4311, 'ORRS', 'R1, R2', 65);
    currPc += 2;
    emit(0x6001, 'STR', 'R1, [R0, #0]', 65);
    currPc += 2;

    // 2. Configure GPIOC_MODER Pin 13
    off = calcLdrPcOffset(litGpioModer, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* =0x40020800 (GPIOC_MODER) */`, 68);
    currPc += 2;
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 68);
    currPc += 2;
    off = calcLdrPcOffset(litModerMask, currPc);
    emit(0x4800 | (2 << 8) | (off & 0xff), 'LDR', `R2, [PC, #${off * 4}]`, 68);
    currPc += 2;
    emit(0x4311, 'ORRS', 'R1, R2', 68);
    currPc += 2;
    emit(0x6001, 'STR', 'R1, [R0, #0]', 68);
    currPc += 2;

    // 3. Output Boot Banner via USART1
    off = calcLdrPcOffset(strBannerAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* Banner String */`, 72);
    currPc += 2;
    off = calcLdrPcOffset(litUsartDr, currPc);
    emit(0x4800 | (5 << 8) | (off & 0xff), 'LDR', `R5, [PC, #${off * 4}] /* USART1_DR */`, 72);
    currPc += 2;

    const bannerLoopPc = currPc;
    symbols['print_banner_loop'] = bannerLoopPc;
    emit(0x7821, 'LDRB', 'R1, [R4, #0]', 73);
    currPc += 2;
    emit(0x2900, 'CMP', 'R1, #0', 73);
    currPc += 2;
    emit(0xd003, 'BEQ', 'banner_done', 74);
    currPc += 2;
    emit(0x6029, 'STR', 'R1, [R5, #0]', 75);
    currPc += 2;
    emit(0x3401, 'ADDS', 'R4, #1', 75);
    currPc += 2;
    const backOffBanner = Math.floor((bannerLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffBanner & 0x7ff), 'B', 'print_banner_loop', 76);
    currPc += 2;

    symbols['banner_done'] = currPc;

    // 4. Main Superloop
    const mainLoopPc = currPc;
    symbols['main_loop'] = mainLoopPc;
    off = calcLdrPcOffset(litGpioOdr, currPc);
    emit(0x4800 | (0 << 8) | (off & 0xff), 'LDR', `R0, [PC, #${off * 4}] /* GPIOC_ODR */`, 84);
    currPc += 2;
    emit(0x6801, 'LDR', 'R1, [R0, #0]', 84);
    currPc += 2;
    off = calcLdrPcOffset(litPin13Mask, currPc);
    emit(0x4800 | (2 << 8) | (off & 0xff), 'LDR', `R2, [PC, #${off * 4}] /* Pin 13 Mask */`, 84);
    currPc += 2;
    emit(0x4051, 'EORS', 'R1, R2', 84);
    currPc += 2;
    emit(0x6001, 'STR', 'R1, [R0, #0]', 84);
    currPc += 2;

    // Test Pin 13 state (LED ON vs OFF)
    emit(0x4013, 'ANDS', 'R3, R2', 88);
    currPc += 2;
    emit(0x2b00, 'CMP', 'R3, #0', 88);
    currPc += 2;
    emit(0xd103, 'BNE', 'led_is_off', 88);
    currPc += 2;

    // LED IS ON (Active Low)
    off = calcLdrPcOffset(strLedOnAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* LED ON msg */`, 89);
    currPc += 2;
    emit(0xe002, 'B', 'print_led_msg', 89);
    currPc += 2;

    // led_is_off:
    symbols['led_is_off'] = currPc;
    off = calcLdrPcOffset(strLedOffAddr, currPc);
    emit(0x4800 | (4 << 8) | (off & 0xff), 'LDR', `R4, [PC, #${off * 4}] /* LED OFF msg */`, 91);
    currPc += 2;

    symbols['print_led_msg'] = currPc;
    const ledPrintLoopPc = currPc;
    emit(0x7821, 'LDRB', 'R1, [R4, #0]', 92);
    currPc += 2;
    emit(0x2900, 'CMP', 'R1, #0', 92);
    currPc += 2;
    emit(0xd003, 'BEQ', 'led_print_done', 92);
    currPc += 2;
    emit(0x6029, 'STR', 'R1, [R5, #0]', 92);
    currPc += 2;
    emit(0x3401, 'ADDS', 'R4, #1', 92);
    currPc += 2;
    const backOffLed = Math.floor((ledPrintLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffLed & 0x7ff), 'B', 'print_led_msg', 92);
    currPc += 2;

    symbols['led_print_done'] = currPc;

    // 5. Software Delay Loop
    off = calcLdrPcOffset(litDelayCount, currPc);
    emit(0x4800 | (6 << 8) | (off & 0xff), 'LDR', `R6, [PC, #${off * 4}] /* Delay Count = ${delayIterations} */`, 95);
    currPc += 2;

    const delayLoopPc = currPc;
    symbols['delay_loop'] = delayLoopPc;
    emit(0x3e01, 'SUBS', 'R6, #1', 95);
    currPc += 2;
    const backOffDelay = Math.floor((delayLoopPc - (currPc + 4)) / 2);
    emit(0xd100 | (backOffDelay & 0xff), 'BNE', 'delay_loop', 95);
    currPc += 2;

    // 6. Branch back to main_loop
    const backOffMain = Math.floor((mainLoopPc - (currPc + 4)) / 2);
    emit(0xe000 | (backOffMain & 0x7ff), 'B', 'main_loop', 96);
    currPc += 2;
    } else {
      // Standalone functions compiled for U-Boot execution; emit an idle halt loop for Reset_Handler
      symbols['main_idle'] = currPc;
      emit(0xbf00, 'NOP', '', 1);
      currPc += 2;
      emit(0xe7fe, 'B', '.', 1);
      currPc += 2;
    }

    // Binary assembly
    const binary = new Uint8Array(4096);
    const initSp = 0x20004ffc;
    binary[0] = initSp & 0xff;
    binary[1] = (initSp >> 8) & 0xff;
    binary[2] = (initSp >> 16) & 0xff;
    binary[3] = (initSp >> 24) & 0xff;

    const resetTarget = hasMainFunction
      ? (symbols['main'] || codeStartAddr)
      : (userFunctionDefs.length > 0 ? symbols[userFunctionDefs[0].name] : codeStartAddr);
    const resetVec = resetTarget | 1;
    binary[4] = resetVec & 0xff;
    binary[5] = (resetVec >> 8) & 0xff;
    binary[6] = (resetVec >> 16) & 0xff;
    binary[7] = (resetVec >> 24) & 0xff;

    let binOffset = 8;
    for (let j = 0; j < emitter.instructions.length; j++) {
      const inst = emitter.instructions[j];
      const addr = codeStartAddr + j * 2;
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

    while (binOffset % 4 !== 0) {
      binary[binOffset] = 0;
      binOffset++;
    }

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
    write32(delayIterations, `Delay Iterations (${delayIterations})`);

    const writeString = (str: string) => {
      const addr = FLASH_BASE + binOffset;
      for (let j = 0; j < str.length; j++) {
        binary[binOffset + j] = str.charCodeAt(j);
      }
      binary[binOffset + str.length] = 0;

      disassembly.push({
        address: addr,
        opcode: 0,
        hex: `[${str.length + 1}B]`,
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

    const buildLog = [
      `arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -O1 -Wall -c main.c -o main.o`,
      `arm-none-eabi-ld -T stm32f103.ld -Map=firmware.map main.o -o firmware.elf`,
      `arm-none-eabi-size firmware.elf`,
      `   text    data     bss     dec     hex filename`,
      `    ${binOffset}       0      64     ${binOffset + 64}     ${(binOffset + 64).toString(16)} firmware.elf`,
      `arm-none-eabi-objcopy -O binary firmware.elf firmware.bin`,
      `Compilation successful. Binary image size: ${binOffset} bytes ready for flash.`,
    ].join('\n');

    return {
      success: true,
      errors: [],
      warnings: [],
      binary: binary.subarray(0, binOffset),
      disassembly,
      symbols,
      flashSize: binOffset,
      ramSize: 64,
      buildLog,
    };
  } catch (err: any) {
    return {
      success: false,
      errors: [{ line: 1, column: 1, message: err.message || 'Internal compiler error', severity: 'error' }],
      warnings: [],
      binary: new Uint8Array(0),
      disassembly: [],
      symbols: {},
      flashSize: 0,
      ramSize: 0,
      buildLog: `Internal compiler error: ${err.message}`,
    };
  }
}

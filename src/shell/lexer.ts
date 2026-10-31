// AetherOS - aesh Shell Lexer / Tokenizer
import type { Token } from './types';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '\n') {
      tokens.push({ type: 'NEWLINE', value: '\n' });
      i++;
      continue;
    }

    // Two-character operators
    if (ch === '&' && input[i + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&' });
      i += 2;
      continue;
    }

    if (ch === '|' && input[i + 1] === '|') {
      tokens.push({ type: 'OR', value: '||' });
      i += 2;
      continue;
    }

    if (ch === '>' && input[i + 1] === '>') {
      tokens.push({ type: 'REDIRECT_APPEND', value: '>>' });
      i += 2;
      continue;
    }

    if (ch === '2' && input[i + 1] === '>') {
      tokens.push({ type: 'REDIRECT_ERR', value: '2>' });
      i += 2;
      continue;
    }

    // Single-character operators
    if (ch === '|') {
      tokens.push({ type: 'PIPE', value: '|' });
      i++;
      continue;
    }

    if (ch === '>') {
      tokens.push({ type: 'REDIRECT_OUT', value: '>' });
      i++;
      continue;
    }

    if (ch === '<') {
      tokens.push({ type: 'REDIRECT_IN', value: '<' });
      i++;
      continue;
    }

    if (ch === ';') {
      tokens.push({ type: 'SEMICOLON', value: ';' });
      i++;
      continue;
    }

    // Words with quoting and escaping
    let word = '';
    let inDouble = false;
    let inSingle = false;

    while (i < len) {
      const c = input[i];

      if (inSingle) {
        if (c === "'") {
          inSingle = false;
          i++;
        } else {
          word += c;
          i++;
        }
      } else if (inDouble) {
        if (c === '"') {
          inDouble = false;
          i++;
        } else if (c === '\\' && i + 1 < len) {
          const next = input[i + 1];
          if (next === 'n') word += '\n';
          else if (next === 't') word += '\t';
          else if (next === 'r') word += '\r';
          else word += next;
          i += 2;
        } else {
          word += c;
          i++;
        }
      } else {
        if (c === "'") {
          inSingle = true;
          i++;
        } else if (c === '"') {
          inDouble = true;
          i++;
        } else if (c === '\\' && i + 1 < len) {
          const next = input[i + 1];
          if (next === 'n') word += '\n';
          else if (next === 't') word += '\t';
          else if (next === 'r') word += '\r';
          else word += next;
          i += 2;
        } else if (
          c === ' ' ||
          c === '\t' ||
          c === '\r' ||
          c === '\n' ||
          c === '|' ||
          c === '>' ||
          c === '<' ||
          c === ';' ||
          (c === '&' && input[i + 1] === '&')
        ) {
          break;
        } else {
          word += c;
          i++;
        }
      }
    }

    tokens.push({ type: 'WORD', value: word });
  }

  return tokens;
}

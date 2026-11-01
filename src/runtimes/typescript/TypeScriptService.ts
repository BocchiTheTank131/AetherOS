// AetherOS - TypeScript Language Intelligence Service
import { typeScriptCompiler } from './TypeScriptCompiler';
import type { TSDiagnostic, TSCompletionItem, TSHoverInfo, TSDefinitionLocation } from './types';

export class TypeScriptService {
  private static STANDARD_COMPLETIONS: TSCompletionItem[] = [
    { label: 'const', kind: 'keyword', detail: 'Declare a constant variable' },
    { label: 'let', kind: 'keyword', detail: 'Declare a block-scoped variable' },
    { label: 'function', kind: 'keyword', detail: 'Declare a function' },
    { label: 'class', kind: 'keyword', detail: 'Declare a class' },
    { label: 'interface', kind: 'keyword', detail: 'Declare a TypeScript interface' },
    { label: 'type', kind: 'keyword', detail: 'Declare a TypeScript type alias' },
    { label: 'return', kind: 'keyword', detail: 'Return from function' },
    { label: 'import', kind: 'keyword', detail: 'Import external module' },
    { label: 'export', kind: 'keyword', detail: 'Export symbol' },
    { label: 'async', kind: 'keyword', detail: 'Async function declaration' },
    { label: 'await', kind: 'keyword', detail: 'Await a Promise' },
    { label: 'console.log', kind: 'function', detail: 'Log message to console', documentation: 'Prints to stdout' },
    { label: 'Promise', kind: 'class', detail: 'Promise<T>', documentation: 'Represents the eventual completion of an async operation' },
    { label: 'JSON.stringify', kind: 'function', detail: 'Convert object to JSON string' },
    { label: 'JSON.parse', kind: 'function', detail: 'Parse JSON string to object' },
    { label: 'setTimeout', kind: 'function', detail: 'Schedule timer callback' },
    { label: 'aether', kind: 'variable', detail: 'AetherOS Guest Runtime SDK' },
    { label: 'vfs', kind: 'variable', detail: 'Virtual File System API' },
  ];

  /**
   * Generates live diagnostics for an active file in Code Studio.
   */
  public getDiagnostics(file: string, code: string): TSDiagnostic[] {
    return typeScriptCompiler.typeCheck(file, code);
  }

  /**
   * Generates autocomplete suggestions at a specific cursor position.
   */
  public getCompletions(code: string, line: number, col: number): TSCompletionItem[] {
    const lines = code.split('\n');
    const currentLine = lines[line - 1] || '';
    const prefix = currentLine.slice(0, col).trim().split(/[\s([{,.]+/).pop() || '';

    const results = [...TypeScriptService.STANDARD_COMPLETIONS];

    // Collect symbols declared in current file
    for (const l of lines) {
      const match = l.match(/\b(?:const|let|var|function|class)\s+([a-zA-Z0-9_]+)/);
      if (match) {
        results.push({
          label: match[1],
          kind: l.includes('function') ? 'function' : l.includes('class') ? 'class' : 'variable',
          detail: `(local symbol) ${match[1]}`,
        });
      }
    }

    if (!prefix) return results.slice(0, 30);
    return results
      .filter((item) => item.label.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 30);
  }

  /**
   * Retrieves hover information for symbol at cursor.
   */
  public getHover(code: string, line: number, col: number): TSHoverInfo | null {
    const lines = code.split('\n');
    const currentLine = lines[line - 1] || '';
    const match = currentLine.match(/\b([a-zA-Z0-9_]+)\b/g);
    if (!match) return null;

    let target = '';
    for (const word of match) {
      const idx = currentLine.indexOf(word);
      if (col >= idx && col <= idx + word.length) {
        target = word;
        break;
      }
    }

    if (!target) return null;

    if (target === 'console') {
      return { contents: ['**console**: Host standard output and error logging object'] };
    }
    if (target === 'Promise') {
      return { contents: ['**Promise<T>**: Represents an asynchronous deferred computation'] };
    }
    if (target === 'aether') {
      return { contents: ['**aether**: AetherOS guest application sandbox bridge'] };
    }

    return { contents: [`**${target}**: TypeScript symbol`] };
  }

  /**
   * Locates definition of symbol at cursor.
   */
  public getDefinition(file: string, code: string, line: number, col: number): TSDefinitionLocation | null {
    const lines = code.split('\n');
    const currentLine = lines[line - 1] || '';
    const match = currentLine.match(/\b([a-zA-Z0-9_]+)\b/g);
    if (!match) return null;

    let target = '';
    for (const word of match) {
      const idx = currentLine.indexOf(word);
      if (col >= idx && col <= idx + word.length) {
        target = word;
        break;
      }
    }

    if (!target) return null;

    // Search for declaration
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.match(new RegExp(`\\b(?:const|let|var|function|class|interface|type)\\s+${target}\\b`))) {
        return {
          file,
          line: i + 1,
          col: l.indexOf(target) + 1,
        };
      }
    }

    return null;
  }
}

export const typeScriptService = new TypeScriptService();

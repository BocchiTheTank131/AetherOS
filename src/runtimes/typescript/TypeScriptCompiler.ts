// AetherOS - TypeScript Compiler & Semantic Diagnostics Engine
import { vfs } from '../../vfs/vfs';
import type { TSCompileOptions, TSCompileResult, TSDiagnostic } from './types';

export class TypeScriptCompiler {
  /**
   * Transpiles TypeScript source code to clean, executable JavaScript.
   */
  public transpile(source: string, filename = 'inline.ts'): { outputText: string; diagnostics: TSDiagnostic[] } {
    const diagnostics = this.typeCheck(filename, source);
    let output = source;

    // 1. Remove single-line and multi-line comments temporarily or preserve them
    // 2. Remove import type / export type statements
    output = output.replace(/import\s+type\s+[^;]+;/g, '');
    output = output.replace(/export\s+type\s+[^;]+;/g, '');

    // 3. Transform enums into const objects
    output = output.replace(
      /(?:export\s+)?enum\s+([a-zA-Z0-9_]+)\s*\{([^}]+)\}/g,
      (_match, name, body) => {
        const members = body
          .split(',')
          .map((m: string) => m.trim())
          .filter(Boolean)
          .map((m: string) => {
            const parts = m.split('=');
            const key = parts[0].trim();
            const val = parts.length > 1 ? parts[1].trim() : JSON.stringify(key);
            return `  ${key}: ${val}`;
          })
          .join(',\n');
        return `const ${name} = {\n${members}\n};`;
      }
    );

    // 4. Strip interfaces
    output = output.replace(/(?:export\s+)?interface\s+[a-zA-Z0-9_]+(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*\{[^}]*\}/g, '');

    // 5. Strip type aliases
    output = output.replace(/(?:export\s+)?type\s+[a-zA-Z0-9_]+(?:<[^>]+>)?\s*=\s*[^;]+;/g, '');

    // 6. Strip generic type arguments on functions/classes: fn<T>(...) -> fn(...)
    output = output.replace(/(function\s+[a-zA-Z0-9_]+)\s*<[^>]+>/g, '$1');
    output = output.replace(/(class\s+[a-zA-Z0-9_]+)\s*<[^>]+>/g, '$1');
    output = output.replace(/(<[a-zA-Z0-9_,\s]+>)\s*\(/g, '(');

    // 7. Strip parameter type annotations in functions: (x: number, y: string) -> (x, y)
    output = output.replace(
      /\(([^)]*)\)/g,
      (_match, params: string) => {
        // Strip types from parameter list
        const cleaned = params
          .split(',')
          .map((p) => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            // Remove parameter default type like: x: number = 5
            return trimmed.replace(/:\s*[^=]+(\s*=.*)?$/, '$1').trim();
          })
          .join(', ');
        return `(${cleaned})`;
      }
    );

    // 8. Strip return type annotations: ): string { or ): Promise<void> =>
    output = output.replace(/\)\s*:\s*[a-zA-Z0-9_<>[\]|&\s,]+\s*(?=\{|=>)/g, ') ');

    // 9. Strip variable type annotations: const x: number = 42 -> const x = 42
    output = output.replace(
      /\b(const|let|var)\s+([a-zA-Z0-9_]+)\s*:\s*[a-zA-Z0-9_<>[\]|&\s,]+(?:\s*=)/g,
      '$1 $2 ='
    );

    // 10. Strip type assertions: expr as Type, <Type>expr
    output = output.replace(/\s+as\s+[a-zA-Z0-9_<>[\]|&]+/g, '');
    output = output.replace(/<[a-zA-Z0-9_]+>\s*([a-zA-Z0-9_]+)/g, '$1');

    return {
      outputText: output.trim() + '\n',
      diagnostics,
    };
  }

  /**
   * Performs semantic analysis and type checking.
   */
  public typeCheck(filename: string, source: string): TSDiagnostic[] {
    const diagnostics: TSDiagnostic[] = [];
    const lines = source.split('\n');

    // Known global symbols in AetherOS & standard JS/TS/DOM
    const knownGlobals = new Set([
      'console', 'window', 'document', 'Math', 'Date', 'Promise', 'Array',
      'Object', 'String', 'Number', 'Boolean', 'RegExp', 'JSON', 'Map',
      'Set', 'Uint8Array', 'TextEncoder', 'TextDecoder', 'fetch', 'setTimeout',
      'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'crypto',
      'URL', 'Blob', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
      'aether', 'vfs', 'process', 'module', 'exports', 'require',
    ]);

    // Collect declared symbols in this file
    const declaredSymbols = new Set<string>(knownGlobals);

    // 1. Scan declared variables, functions, classes, imports
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // const/let/var x
      const varMatches = line.matchAll(/\b(?:const|let|var)\s+([a-zA-Z0-9_]+)/g);
      for (const m of varMatches) {
        declaredSymbols.add(m[1]);
      }

      // function name(
      const fnMatches = line.matchAll(/\bfunction\s+([a-zA-Z0-9_]+)/g);
      for (const m of fnMatches) {
        declaredSymbols.add(m[1]);
      }

      // class name
      const classMatches = line.matchAll(/\bclass\s+([a-zA-Z0-9_]+)/g);
      for (const m of classMatches) {
        declaredSymbols.add(m[1]);
      }

      // import { a, b as c } from '...'
      const importMatch = line.match(/import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_]+))\s+from/);
      if (importMatch) {
        if (importMatch[1]) {
          const names = importMatch[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
          for (const n of names) declaredSymbols.add(n);
        } else if (importMatch[2]) {
          declaredSymbols.add(importMatch[2]);
        }
      }

      // Collect function parameters from declarations: function foo(a, b) or (a, b) =>
      const fnDecls = line.matchAll(/\bfunction(?:\s+[a-zA-Z0-9_]+)?\s*\(([^)]*)\)/g);
      for (const fd of fnDecls) {
        const parts = fd[1].split(',');
        for (const p of parts) {
          const pName = p.trim().split(/[:=]/)[0].trim();
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pName)) {
            declaredSymbols.add(pName);
          }
        }
      }
      const arrowDecls = line.matchAll(/\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/g);
      for (const ad of arrowDecls) {
        const parts = ad[1].split(',');
        for (const p of parts) {
          const pName = p.trim().split(/[:=]/)[0].trim();
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pName)) {
            declaredSymbols.add(pName);
          }
        }
      }
    }

    // 2. Scan for syntax errors & semantic errors
    let braceCount = 0;
    let parenCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check braces balance
      for (const ch of line) {
        if (ch === '{') braceCount++;
        else if (ch === '}') braceCount--;
        else if (ch === '(') parenCount++;
        else if (ch === ')') parenCount--;
      }

      // Type mismatch check: const x: number = "string" or const s: string = 123
      const numWithStr = line.match(/\b(?:const|let|var)\s+[a-zA-Z0-9_]+\s*:\s*number\s*=\s*(["'][^"']*["'])/);
      if (numWithStr) {
        diagnostics.push({
          file: filename,
          line: lineNum,
          col: line.indexOf(numWithStr[1]),
          message: `Type 'string' is not assignable to type 'number'.`,
          severity: 'error',
          code: 'TS2322',
        });
      }

      const strWithNum = line.match(/\b(?:const|let|var)\s+[a-zA-Z0-9_]+\s*:\s*string\s*=\s*([0-9]+(?:\.[0-9]+)?)/);
      if (strWithNum) {
        diagnostics.push({
          file: filename,
          line: lineNum,
          col: line.indexOf(strWithNum[1]),
          message: `Type 'number' is not assignable to type 'string'.`,
          severity: 'error',
          code: 'TS2322',
        });
      }

      const boolWithNum = line.match(/\b(?:const|let|var)\s+[a-zA-Z0-9_]+\s*:\s*boolean\s*=\s*([0-9]+|["'][^"']*["'])/);
      if (boolWithNum) {
        diagnostics.push({
          file: filename,
          line: lineNum,
          col: line.indexOf(boolWithNum[1]),
          message: `Type is not assignable to type 'boolean'.`,
          severity: 'error',
          code: 'TS2322',
        });
      }

      // Undeclared identifier usage: e.g. console.log(unknownVar)
      const callOrAccess = line.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*[:=])/g);
      for (const token of callOrAccess) {
        const id = token[1];
        const reserved = [
          'const', 'let', 'var', 'function', 'class', 'interface', 'type',
          'import', 'export', 'from', 'as', 'return', 'if', 'else', 'for',
          'while', 'switch', 'case', 'break', 'continue', 'default', 'try',
          'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof', 'void',
          'delete', 'in', 'of', 'true', 'false', 'null', 'undefined', 'this',
          'super', 'extends', 'implements', 'string', 'number', 'boolean', 'any'
        ];
        if (reserved.includes(id)) continue;
        if (!declaredSymbols.has(id) && !line.includes(`function ${id}`) && !line.includes(`class ${id}`)) {
          // If identifier appears after dot (property access), it's ok (e.g. obj.foo)
          const idx = token.index || 0;
          if (idx > 0 && line[idx - 1] === '.') continue;
          // If inside quotes, skip
          const before = line.slice(0, idx);
          const quotesCount = (before.match(/["'`]/g) || []).length;
          if (quotesCount % 2 === 1) continue;

          diagnostics.push({
            file: filename,
            line: lineNum,
            col: idx + 1,
            message: `Cannot find name '${id}'.`,
            severity: 'error',
            code: 'TS2304',
          });
          break;
        }
      }
    }

    if (braceCount !== 0) {
      diagnostics.push({
        file: filename,
        line: lines.length,
        col: 1,
        message: braceCount > 0 ? `Unclosed block: missing '}'` : `Unexpected closing brace '}'`,
        severity: 'error',
        code: 'TS1005',
      });
    }

    if (parenCount !== 0) {
      diagnostics.push({
        file: filename,
        line: lines.length,
        col: 1,
        message: parenCount > 0 ? `Unclosed parenthesis: missing ')'` : `Unexpected closing parenthesis ')'`,
        severity: 'error',
        code: 'TS1005',
      });
    }

    return diagnostics;
  }

  /**
   * Compiles a TypeScript project or entry file according to configuration.
   */
  public async compile(options: TSCompileOptions): Promise<TSCompileResult> {
    const cwd = options.cwd || '/home/aether/Projects';
    let entryFile = options.entryFile;
    let outDir = options.outDir || `${cwd}/dist`;
    let noEmit = options.noEmit || false;

    // Check for tsconfig.json
    const configPath = options.configPath || `${cwd}/tsconfig.json`;
    if (vfs.exists(configPath)) {
      try {
        const rawConfig = JSON.parse(vfs.readFile(configPath));
        if (rawConfig.compilerOptions?.outDir) {
          outDir = vfs.resolve(cwd, rawConfig.compilerOptions.outDir);
        }
        if (rawConfig.compilerOptions?.noEmit !== undefined) {
          noEmit = Boolean(rawConfig.compilerOptions.noEmit);
        }
      } catch {}
    }

    if (!entryFile) {
      if (vfs.exists(`${cwd}/src/main.ts`)) entryFile = `${cwd}/src/main.ts`;
      else if (vfs.exists(`${cwd}/main.ts`)) entryFile = `${cwd}/main.ts`;
      else if (vfs.exists(`${cwd}/index.ts`)) entryFile = `${cwd}/index.ts`;
    }

    if (!entryFile || !vfs.exists(entryFile)) {
      return {
        success: false,
        diagnostics: [
          {
            file: 'project',
            line: 1,
            col: 1,
            message: `Entry file not found in ${cwd}`,
            severity: 'error',
            code: 'TS18003',
          },
        ],
      };
    }

    const allDiagnostics: TSDiagnostic[] = [];
    const outputFiles: Record<string, string> = {};

    // Collect and compile modules recursively
    const visited = new Set<string>();
    const modules: { path: string; relName: string; code: string }[] = [];

    const processFile = (filePath: string) => {
      const norm = vfs.normalizePath(filePath);
      if (visited.has(norm)) return;
      visited.add(norm);

      if (!vfs.exists(norm)) {
        allDiagnostics.push({
          file: norm,
          line: 1,
          col: 1,
          message: `Cannot find module '${norm}'.`,
          severity: 'error',
          code: 'TS2307',
        });
        return;
      }

      const source = vfs.readFile(norm);
      const transpiled = this.transpile(source, norm);
      allDiagnostics.push(...transpiled.diagnostics);

      const relName = norm.replace(cwd, '').replace(/^\/+/, '');
      modules.push({ path: norm, relName, code: transpiled.outputText });

      // Scan relative imports
      const importMatches = source.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
      for (const m of importMatches) {
        let importTarget = m[1];
        if (!importTarget.endsWith('.ts') && !importTarget.endsWith('.js')) {
          importTarget += '.ts';
        }
        const dir = norm.split('/').slice(0, -1).join('/') || '/';
        const targetPath = vfs.resolve(dir, importTarget);
        processFile(targetPath);
      }
    };

    processFile(entryFile);

    const hasErrors = allDiagnostics.some((d) => d.severity === 'error');
    if (hasErrors && noEmit) {
      return {
        success: false,
        diagnostics: allDiagnostics,
      };
    }

    // Bundle modules into self-contained browser executable bundle
    let bundleCode = `// AetherOS Compiled TypeScript Bundle (${new Date().toISOString()})\n(function() {\n  'use strict';\n  const __modules = {};\n  const __require = (id) => __modules[id] ? __modules[id].exports : {};\n`;
    for (const mod of modules) {
      bundleCode += `\n  // Module: ${mod.relName}\n  __modules[${JSON.stringify(mod.relName)}] = { exports: {} };\n  (function(module, exports) {\n${mod.code}\n  })(__modules[${JSON.stringify(mod.relName)}], __modules[${JSON.stringify(mod.relName)}].exports);\n`;
    }
    bundleCode += `\n})();\n`;

    if (!noEmit) {
      if (!vfs.exists(outDir)) {
        vfs.mkdir(outDir, { recursive: true });
      }

      // Write bundle and individual transpiled files
      const mainOut = `${outDir}/main.js`;
      await vfs.writeFile(mainOut, bundleCode);
      outputFiles['main.js'] = bundleCode;

      for (const mod of modules) {
        const outFileName = mod.relName.replace(/\.ts$/, '.js');
        const targetAbs = `${outDir}/${outFileName}`;
        const parent = targetAbs.split('/').slice(0, -1).join('/') || '/';
        if (!vfs.exists(parent)) vfs.mkdir(parent, { recursive: true });
        await vfs.writeFile(targetAbs, mod.code);
        outputFiles[outFileName] = mod.code;
      }
    }

    return {
      success: !hasErrors,
      diagnostics: allDiagnostics,
      outputText: bundleCode,
      outputFiles,
      bundleCode,
    };
  }
}

export const typeScriptCompiler = new TypeScriptCompiler();

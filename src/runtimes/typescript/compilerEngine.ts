import ts from 'aether-typescript';
import type { CompilerRequest } from './compilerClient';
import type { TSCompileResult, TSCompletionItem, TSDefinitionLocation, TSDiagnostic, TSHoverInfo } from './types';

const libraries = new Map(Object.entries(import.meta.glob<string>(
  '/node_modules/aether-typescript/lib/lib.*.d.ts',
  { query: '?raw', import: 'default', eager: true },
)).map(([path, source]) => [path.slice(path.lastIndexOf('/') + 1), source]));
const libraryRoot = '/@typescript';
const defaults: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  allowJs: true,
  types: [],
};

function formatDiagnostic(error: ts.Diagnostic): TSDiagnostic {
  const position = error.file?.getLineAndCharacterOfPosition(error.start ?? 0);
  return {
    file: error.file?.fileName ?? '',
    line: (position?.line ?? 0) + 1,
    col: (position?.character ?? 0) + 1,
    severity: error.category === ts.DiagnosticCategory.Error ? 'error' :
      error.category === ts.DiagnosticCategory.Warning ? 'warning' : 'info',
    code: `TS${error.code}`,
    message: ts.flattenDiagnosticMessageText(error.messageText, '\n'),
  };
}

function directory(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(0, slash) || '/';
}

type FileEntries = { files: string[]; directories: string[] };
const matchFiles = (ts as typeof ts & {
  matchFiles(path: string, extensions: readonly string[], excludes: readonly string[] | undefined,
    includes: readonly string[], caseSensitive: boolean, currentDirectory: string, depth: number | undefined,
    entries: (directory: string) => FileEntries, realpath: (file: string) => string): string[];
}).matchFiles;

class Project {
  private sources = new Map<string, { text: string; version: number }>();
  private dirs = new Map<string, FileEntries>();
  private roots: string[] = [];
  private settings = defaults;
  private version = 0;
  private nextVersion = 0;
  readonly service: ts.LanguageService;
  readonly root: string;

  constructor(root: string) {
    this.root = root;
    this.service = ts.createLanguageService({
      getCurrentDirectory: () => this.root,
      getCompilationSettings: () => this.settings,
      getScriptFileNames: () => this.roots,
      getProjectVersion: () => String(this.version),
      getScriptVersion: (file) => String(this.sources.get(file)?.version ?? 0),
      getScriptSnapshot: (file) => {
        const source = this.readFile(file);
        return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
      },
      getDefaultLibFileName: (options) => libraryRoot + '/' + ts.getDefaultLibFileName(options),
      useCaseSensitiveFileNames: () => true,
      readFile: this.readFile,
      fileExists: (file) => this.readFile(file) !== undefined,
      directoryExists: (path) => this.dirs.has(path) || path === libraryRoot,
      getDirectories: (path) => this.dirs.get(path)?.directories ?? [],
      readDirectory: this.readDirectory,
    });
  }

  readFile = (file: string) => file.startsWith(libraryRoot + '/')
    ? libraries.get(file.slice(libraryRoot.length + 1))
    : this.sources.get(file)?.text;

  private readDirectory = (path: string, extensions: readonly string[], excludes: readonly string[] | undefined,
    includes: readonly string[], depth?: number) =>
    matchFiles(path, extensions, excludes, includes, true, this.root, depth,
      (dir) => this.dirs.get(dir) ?? { files: [], directories: [] }, (file) => file);

  update(request: Extract<CompilerRequest, { root: string }>): ts.Diagnostic[] {
    const before = this.sources;
    this.sources = new Map();
    this.dirs = new Map();
    let changed = before.size !== Object.keys(request.files).length;
    for (const [path, text] of Object.entries(request.files)) {
      const previous = before.get(path);
      const entry = previous?.text === text ? previous : { text, version: ++this.nextVersion };
      this.sources.set(path, entry);
      changed ||= previous !== entry;
      let dir = directory(path);
      let names = this.dirs.get(dir);
      if (!names) {
        names = { files: [], directories: [] };
        this.dirs.set(dir, names);
        while (dir !== '/') {
          const parent = directory(dir);
          const existing = this.dirs.get(parent);
          if (existing) {
            existing.directories.push(dir.slice(dir.lastIndexOf('/') + 1));
            break;
          }
          this.dirs.set(parent, { files: [], directories: [dir.slice(dir.lastIndexOf('/') + 1)] });
          dir = parent;
        }
      }
      names.files.push(path.slice(path.lastIndexOf('/') + 1));
    }

    const { options } = request;
    const configPath = options.configPath;
    const diagnostics: ts.Diagnostic[] = [];
    const config = configPath && this.readFile(configPath);
    let settings = { ...defaults, outDir: options.outDir ?? this.root + '/dist' };
    let roots = options.files ?? (options.entryFile && !config ? [options.entryFile] : []);
    if (config && configPath) {
      const parsed = ts.parseConfigFileTextToJson(configPath, config);
      if (parsed.error) diagnostics.push(parsed.error);
      else {
        const result = ts.parseJsonConfigFileContent(parsed.config, {
          useCaseSensitiveFileNames: true,
          fileExists: (path) => this.readFile(path) !== undefined,
          readFile: this.readFile,
          readDirectory: this.readDirectory,
        }, directory(configPath), {}, configPath);
        diagnostics.push(...result.errors);
        settings = { ...settings, ...result.options, outDir: options.outDir ?? result.options.outDir ?? settings.outDir };
        roots = options.files ?? result.fileNames;
      }
    } else if (!roots.length) {
      roots = [...this.sources.keys()].filter((path) => /\.[cm]?tsx?$/.test(path) &&
        !path.includes('/node_modules/') && !path.startsWith(settings.outDir + '/'));
    }
    if (request.file && this.readFile(request.file) !== undefined && !roots.includes(request.file)) {
      roots = [...roots, request.file];
    }
    if (options.noEmit) settings.noEmit = true;
    if (changed || JSON.stringify(roots) !== JSON.stringify(this.roots) || JSON.stringify(settings) !== JSON.stringify(this.settings)) {
      this.roots = roots;
      this.settings = settings;
      this.version++;
    }
    return diagnostics;
  }

  snapshot() {
    const files = this.sources;
    const dirs = this.dirs;
    return {
      hasFile: (path: string) => files.has(path),
      readFile: (path: string) => files.get(path)?.text,
      directoryExists: (path: string) => dirs.has(path),
    };
  }
}

const projects = new Map<string, Project>();

export async function processCompilerRequest(request: CompilerRequest): Promise<unknown> {
  if (request.action === 'version') return ts.version;
  if (request.action === 'transpile') {
    const result = ts.transpileModule(request.code, { fileName: request.file, compilerOptions: defaults, reportDiagnostics: true });
    return { outputText: result.outputText, diagnostics: result.diagnostics?.map(formatDiagnostic) ?? [] };
  }
  const key = request.root + '\n' + (request.options.configPath ?? '');
  const project = projects.get(key) ?? new Project(request.root);
  projects.delete(key);
  projects.set(key, project);
  if (projects.size > 4) {
    const oldest = projects.keys().next().value!;
    projects.get(oldest)?.service.dispose();
    projects.delete(oldest);
  }
  const configDiagnostics = project.update(request);
  const program = project.service.getProgram();
  if (request.action === 'compile') {
    const diagnostics = [...configDiagnostics, ...(program ? ts.getPreEmitDiagnostics(program) : [])].map(formatDiagnostic);
    if (!program?.getRootFileNames().length && diagnostics.length === 0) {
      diagnostics.push({ file: request.root, line: 1, col: 1, severity: 'error', code: 'TS18003', message: 'No TypeScript inputs found' });
    }
    const result: TSCompileResult = { success: !diagnostics.some((error) => error.severity === 'error'), diagnostics };
    if (!program || !result.success || program.getCompilerOptions().noEmit) return result;
    const outputFiles: Record<string, string> = Object.create(null);
    const emitted = program.emit(undefined, (path, text) => { outputFiles[path] = text; });
    diagnostics.push(...emitted.diagnostics.map(formatDiagnostic));
    if (emitted.emitSkipped) return { ...result, success: !diagnostics.some((error) => error.severity === 'error') };

    const roots = program.getRootFileNames();
    const entry = request.options.entryFile ?? roots.find((file) => /\/(main|index)\.[cm]?tsx?$/.test(file)) ?? roots[0];
    let bundleCode: string | undefined;
    const opts = program.getCompilerOptions();
    if (entry && request.options.bundle !== false && !opts.emitDeclarationOnly && !opts.outFile) {
      try {
        const snapshot = project.snapshot();
        const { bundleProject } = await import('./compilerBundle');
        bundleCode = await bundleProject(entry, snapshot, opts);
        outputFiles[`${opts.outDir ?? request.root + '/dist'}/main.js`] = bundleCode;
      } catch (error) {
        diagnostics.push({ file: entry, line: 1, col: 1, severity: 'error', code: 'AETHER_BUNDLE', message: String(error) });
        return { success: false, diagnostics };
      }
    }

    return { success: true, diagnostics, outputFiles, bundleCode } satisfies TSCompileResult;
  }

  const file = request.file ?? '';
  const source = program?.getSourceFile(file);
  if (!source) return request.action === 'hover' ? null : [];
  const starts = source.getLineStarts();
  const row = Math.min(Math.max((request.line ?? 1) - 1, 0), starts.length - 1);
  const end = row + 1 < starts.length ? starts[row + 1] - 1 : source.text.length;
  const pos = Math.min(starts[row] + Math.max((request.col ?? 1) - 1, 0), end);
  if (request.action === 'completions') {
    const completion = project.service.getCompletionsAtPosition(file, pos, {});
    const word = source.text.slice(0, pos).match(/[\w$]+$/)?.[0] ?? '';
    const entries = completion?.entries ?? [];
    return [...entries.filter((item) => item.name.startsWith(word)), ...entries.filter((item) => !item.name.startsWith(word))]
      .slice(0, 100).map((item): TSCompletionItem => ({
        label: item.name,
        kind: item.kind === ts.ScriptElementKind.keyword ? 'keyword' :
          item.kind === ts.ScriptElementKind.functionElement || item.kind === ts.ScriptElementKind.memberFunctionElement ? 'function' :
          item.kind === ts.ScriptElementKind.memberVariableElement ? 'property' :
          item.kind === ts.ScriptElementKind.classElement ? 'class' :
          item.kind === ts.ScriptElementKind.interfaceElement ? 'interface' : 'variable',
      }));
  }
  if (request.action === 'hover') {
    const info = project.service.getQuickInfoAtPosition(file, pos);
    if (!info) return null;
    return { contents: [ts.displayPartsToString(info.displayParts), ts.displayPartsToString(info.documentation)].filter(Boolean) } satisfies TSHoverInfo;
  }
  return (project.service.getDefinitionAtPosition(file, pos) ?? []).flatMap((definition): TSDefinitionLocation[] => {
    const target = program?.getSourceFile(definition.fileName);
    if (!target) return [];
    const { line, character } = target.getLineAndCharacterOfPosition(definition.textSpan.start);
    return [{ file: definition.fileName, line: line + 1, col: character + 1 }];
  });
}

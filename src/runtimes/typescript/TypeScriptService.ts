import { compilerProject, typeScriptCompiler } from './TypeScriptCompiler';
import { runCompiler } from './compilerClient';
import type { TSCompletionItem, TSDefinitionLocation, TSHoverInfo } from './types';

interface EditorProject {
  root: string;
  file: string;
  overlays?: Record<string, string>;
  signal?: AbortSignal;
}

function query<T>(
  action: 'completions' | 'hover' | 'definition',
  code: string,
  line: number,
  col: number,
  project?: EditorProject,
): Promise<T> {
  const root = project?.root ?? '/@inline';
  const file = project?.file ?? root + '/inline.ts';
  const options = { noEmit: true };
  const input = project
    ? compilerProject(root, options, { ...project.overlays, [file]: code })
    : { root, files: { [file]: code }, options };
  return runCompiler({ ...input, action, file, line, col }, project?.signal);
}

export const typeScriptService = {
  getDiagnostics: (file: string, code: string) => typeScriptCompiler.typeCheck(file, code),
  getCompletions: (code: string, line: number, col: number, project?: EditorProject) =>
    query<TSCompletionItem[]>('completions', code, line, col, project),
  getHover: (code: string, line: number, col: number, project?: EditorProject) =>
    query<TSHoverInfo | null>('hover', code, line, col, project),
  getDefinition: (code: string, line: number, col: number, project?: EditorProject) =>
    query<TSDefinitionLocation[]>('definition', code, line, col, project),
};

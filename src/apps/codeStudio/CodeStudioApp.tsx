// AetherOS - Code Studio 2.0 (Developer Workstation IDE)
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { aetherRuntime, type RuntimeSession } from '../../runtime/AetherRuntime';
import { pythonRuntime } from '../../runtimes/python/PythonRuntime';
import { typeScriptCompiler } from '../../runtimes/typescript/TypeScriptCompiler';
import { gitService, type GitStatusSummary, type GitCommitRecord } from '../../git/GitService';
import type { FileDiffResult } from '../../git/GitDiff';
import { taskManager } from '../../developer/TaskManager';
import type { TaskDefinition } from '../../developer/types';
import { TEMPLATES, type ProjectTemplate } from './templates';
import { PackageArchive } from '../../pkg/packageArchive';
import { PackageValidator } from '../../pkg/packageValidator';
import { packageManager } from '../../pkg/packageManager';
import { AppHost } from '../../appPlatform/AppHost';
import type { AppManifest } from '../../appPlatform/AppManifest';
import type { InstalledAppRecord } from '../../appPlatform/DynamicAppRegistry';
import { EditorHost } from '../../editor/EditorHost';
import { StudioTerminal } from './StudioTerminal';
import { StudioDiffViewer } from './StudioDiffViewer';
import type { TSDiagnostic } from '../../runtimes/typescript/types';
import {
  Play,
  Square,
  RefreshCw,
  FileCode,
  Save,
  Terminal,
  Eye,
  Trash2,
  Box,
  Plus,
  Download,
  Check,
  GitBranch,
  Search,
  AlertCircle,
  PlayCircle,
  Columns,
  Rows,
  FilePlus,
  Code2,
  Cpu,
  Layers,
  X,
} from 'lucide-react';

export const CodeStudioApp: React.FC<AppProps> = ({ initialProps }) => {
  const initialFilePath = (initialProps?.filePath as string) || '';
  const initialRoot = initialFilePath
    ? initialFilePath.split('/').slice(0, -1).join('/') || '/'
    : ((initialProps?.projectRoot as string) || '/home/aether/Projects/typescript-demo');

  // Project state
  const [projectRoot, setProjectRoot] = useState<string>(initialRoot);
  const [fileList, setFileList] = useState<string[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  const [secondaryActiveFile, _setSecondaryActiveFile] = useState<string>('');
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>('none');

  // File buffer contents
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});

  // Navigation & panels
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git' | 'search' | 'problems' | 'tasks'>('files');
  const [activeBottomTab, setActiveBottomTab] = useState<'terminal' | 'output' | 'problems'>('terminal');
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [mainView, setMainView] = useState<'editor' | 'preview' | 'diff'>('editor');

  // Cursor & status
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [jumpToLine, setJumpToLine] = useState<number | undefined>(undefined);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activePid, setActivePid] = useState<number | null>(null);

  // Git state
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommitRecord[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedDiff, setSelectedDiff] = useState<FileDiffResult | null>(null);
  const [hasGitRepo, setHasGitRepo] = useState(false);

  // Project search & diagnostics
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ file: string; line: number; text: string }[]>([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<TSDiagnostic[]>([]);
  const [projectTasks, setProjectTasks] = useState<TaskDefinition[]>([]);

  // Modals
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>(TEMPLATES[1] || TEMPLATES[0]);
  const [newProjectName, setNewProjectName] = useState('my-ts-app');
  const [newFileNameInput, setNewFileNameInput] = useState('');
  const [newFileModal, setNewFileModal] = useState(false);

  // Packaging & Preview
  const [previewKey, setPreviewKey] = useState(0);
  const [builtArchive, setBuiltArchive] = useState<Uint8Array | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Active execution session refs
  const activeJsSessionRef = useRef<RuntimeSession | null>(null);

  // Scan and refresh project files
  const refreshProject = useCallback(async () => {
    try {
      if (!vfs.exists(projectRoot)) {
        vfs.mkdir(projectRoot, { recursive: true });
        const defaultTmpl = TEMPLATES[1] || TEMPLATES[0];
        for (const [name, content] of Object.entries(defaultTmpl.files)) {
          const parentDir = `${projectRoot}/${name}`.split('/').slice(0, -1).join('/') || '/';
          if (!vfs.exists(parentDir)) vfs.mkdir(parentDir, { recursive: true });
          vfs.writeFile(`${projectRoot}/${name}`, content);
        }
      }

      // Collect project files recursively
      const collectFiles = (dir: string): string[] => {
        const res: string[] = [];
        try {
          const entries = vfs.readdir(dir);
          for (const e of entries) {
            if (e.name.startsWith('.git') || e.name === 'dist' || e.name === '__pycache__') continue;
            if (e.type === 'file') res.push(e.path);
            else if (e.type === 'dir') res.push(...collectFiles(e.path));
          }
        } catch {}
        return res;
      };

      const files = collectFiles(projectRoot);
      setFileList(files);

      // Load contents for clean files, preserve dirty edits
      setFileContents((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const f of files) {
          try {
            if (!(f in next) || next[f] === savedContents[f]) {
              next[f] = vfs.readFile(f);
            }
          } catch {}
        }
        return next;
      });

      setSavedContents((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const f of files) {
          try {
            next[f] = vfs.readFile(f);
          } catch {}
        }
        return next;
      });

      // Update active file & tabs
      if (files.length > 0) {
        if (!activeFile || !files.includes(activeFile)) {
          const candidate =
            initialFilePath && files.includes(initialFilePath)
              ? initialFilePath
              : files.find((f) => f.endsWith('main.ts') || f.endsWith('main.py') || f.endsWith('index.html')) || files[0];
          setActiveFile(candidate);
          setOpenTabs((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]));
        }
      }

      // Check Git status
      const isRepo = await gitService.isRepo(projectRoot);
      setHasGitRepo(isRepo);
      if (isRepo) {
        const status = await gitService.status(projectRoot);
        setGitStatus(status);
        const commits = await gitService.log(projectRoot, 10);
        setGitCommits(commits);
      } else {
        setGitStatus(null);
        setGitCommits([]);
      }

      // Load project tasks
      const tasks = taskManager.getTasksForProject(projectRoot);
      setProjectTasks(tasks);

      // Update diagnostics
      const diags: TSDiagnostic[] = [];
      for (const f of files) {
        if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
          try {
            const raw = vfs.readFile(f);
            diags.push(...typeScriptCompiler.typeCheck(f, raw));
          } catch {}
        }
      }
      setProjectDiagnostics(diags);
    } catch {}
  }, [projectRoot, initialFilePath, activeFile, savedContents]);

  // Initial load and file watching
  useEffect(() => {
    refreshProject();
    const unsub = vfs.watch(projectRoot, () => {
      refreshProject();
    });
    return () => unsub();
  }, [projectRoot, refreshProject]);

  // Handle Save All
  const handleSaveAll = useCallback(async () => {
    for (const [path, content] of Object.entries(fileContents)) {
      if (content !== savedContents[path]) {
        try {
          await vfs.writeFile(path, content);
        } catch {}
      }
    }
    setSavedContents({ ...fileContents });
    setPreviewKey((k) => k + 1);

    // Refresh Git & Diagnostics
    if (hasGitRepo) {
      try {
        const status = await gitService.status(projectRoot);
        setGitStatus(status);
      } catch {}
    }
  }, [fileContents, savedContents, hasGitRepo, projectRoot]);

  // Handle Save active file
  const handleSaveActive = useCallback(async () => {
    if (!activeFile) return;
    const content = fileContents[activeFile];
    if (content !== undefined) {
      await vfs.writeFile(activeFile, content);
      setSavedContents((prev) => ({ ...prev, [activeFile]: content }));
      setPreviewKey((k) => k + 1);
    }
  }, [activeFile, fileContents]);

  // Create New Project
  const handleCreateProject = () => {
    const cleanName = newProjectName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'my-project';
    const targetDir = `/home/aether/Projects/${cleanName}`;
    try {
      if (!vfs.exists(targetDir)) {
        vfs.mkdir(targetDir, { recursive: true });
      }
      for (const [relPath, content] of Object.entries(selectedTemplate.files)) {
        const fullPath = `${targetDir}/${relPath}`;
        const parent = fullPath.split('/').slice(0, -1).join('/') || '/';
        if (!vfs.exists(parent)) vfs.mkdir(parent, { recursive: true });
        vfs.writeFile(fullPath, content);
      }
      setProjectRoot(targetDir);
      setOpenTabs([]);
      setActiveFile('');
      setNewProjectModal(false);
      setLogs((prev) => [
        ...prev,
        `[Project] Created new project '${cleanName}' from template '${selectedTemplate.name}'`,
      ]);
    } catch (err) {
      setLogs((prev) => [...prev, `[Error] Failed to create project: ${(err as Error).message}`]);
    }
  };

  // Create New File in project
  const handleCreateFile = () => {
    if (!newFileNameInput.trim()) return;
    const filePath = `${projectRoot}/${newFileNameInput.trim()}`;
    try {
      const parent = filePath.split('/').slice(0, -1).join('/') || '/';
      if (!vfs.exists(parent)) vfs.mkdir(parent, { recursive: true });
      if (!vfs.exists(filePath)) {
        vfs.writeFile(filePath, '');
      }
      setNewFileModal(false);
      setNewFileNameInput('');
      setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
      setActiveFile(filePath);
      refreshProject();
    } catch (err) {
      setLogs((prev) => [...prev, `[Error] Failed to create file: ${(err as Error).message}`]);
    }
  };

  // Run File based on type
  const handleRunActiveFile = async () => {
    await handleSaveAll();
    const fileName = activeFile.split('/').pop() || '';
    const content = fileContents[activeFile] || '';

    // Python Execution
    if (activeFile.endsWith('.py')) {
      setIsRunning(true);
      setActiveBottomTab('output');
      setLogs((prev) => [
        ...prev,
        `[Python] Executing ${fileName} in WebAssembly Runtime (Pyodide v0.27.2)...`,
      ]);

      const session = pythonRuntime.createSession(`python ${fileName}`);
      setActivePid(session.pid);

      try {
        const res = await session.execute({
          code: content,
          filename: fileName,
          cwd: projectRoot,
          onStdout: (c) => setLogs((prev) => [...prev, c.trimEnd()]),
          onStderr: (c) => setLogs((prev) => [...prev, `\x1b[31m${c.trimEnd()}\x1b[0m`]),
        });

        setLogs((prev) => [
          ...prev,
          `[Python Finished] Process exited with code ${res.exitCode} (${res.durationMs}ms)`,
        ]);
        refreshProject();
      } catch (err) {
        setLogs((prev) => [...prev, `[Python Fatal] ${(err as Error).message}`]);
      } finally {
        setIsRunning(false);
        setActivePid(null);
      }
      return;
    }

    // TypeScript Compilation & Execution
    if (activeFile.endsWith('.ts') || activeFile.endsWith('.tsx')) {
      setIsRunning(true);
      setActiveBottomTab('output');
      setLogs((prev) => [
        ...prev,
        `[TypeScript] Compiling project from ${fileName}...`,
      ]);

      try {
        const res = await typeScriptCompiler.compile({
          entryFile: activeFile,
          cwd: projectRoot,
        });

        for (const d of res.diagnostics) {
          const line = `${d.file}(${d.line},${d.col}): ${d.message}`;
          setLogs((prev) => [...prev, d.severity === 'error' ? `[TS Error] ${line}` : `[TS Warning] ${line}`]);
        }

        if (res.success && res.bundleCode) {
          setLogs((prev) => [
            ...prev,
            `[TypeScript Success] Generated compiled JavaScript in dist/main.js`,
            `[Runtime] Executing compiled bundle...`,
          ]);

          const jsSession = aetherRuntime.createSession({
            commandName: `js ${fileName}`,
            onStdout: (c) => setLogs((prev) => [...prev, c.trimEnd()]),
            onStderr: (c) => setLogs((prev) => [...prev, `[JS Error] ${c.trimEnd()}`]),
          });
          activeJsSessionRef.current = jsSession;
          setActivePid(jsSession.pid);

          const runRes = await jsSession.execute(res.bundleCode);
          setLogs((prev) => [
            ...prev,
            `[Execution Finished] Exit code ${runRes.exitCode} (${runRes.durationMs}ms)`,
          ]);
        } else {
          setLogs((prev) => [...prev, `[TypeScript Build Failed] Found compilation errors.`]);
        }
        refreshProject();
      } catch (err) {
        setLogs((prev) => [...prev, `[Compile Error] ${(err as Error).message}`]);
      } finally {
        setIsRunning(false);
        setActivePid(null);
        activeJsSessionRef.current = null;
      }
      return;
    }

    // JavaScript Execution
    if (activeFile.endsWith('.js')) {
      setIsRunning(true);
      setActiveBottomTab('output');
      setLogs((prev) => [
        ...prev,
        `[Runtime] Executing ${fileName} in Aether Secure Runtime...`,
      ]);

      const session = aetherRuntime.createSession({
        commandName: `js ${fileName}`,
        onStdout: (c) => setLogs((prev) => [...prev, c.trimEnd()]),
        onStderr: (c) => setLogs((prev) => [...prev, `[Error] ${c.trimEnd()}`]),
      });
      activeJsSessionRef.current = session;
      setActivePid(session.pid);

      try {
        const res = await session.execute(content);
        setLogs((prev) => [...prev, `[Finished] Exit code ${res.exitCode} (${res.durationMs}ms)`]);
      } catch (err) {
        setLogs((prev) => [...prev, `[Fatal] ${(err as Error).message}`]);
      } finally {
        setIsRunning(false);
        setActivePid(null);
        activeJsSessionRef.current = null;
      }
    }
  };

  // Stop Execution
  const handleStopExecution = () => {
    if (activePid) {
      pythonRuntime.cancel(activePid);
      if (activeJsSessionRef.current) activeJsSessionRef.current.cancel();
      setLogs((prev) => [...prev, `[Stopped] Process PID ${activePid} cancelled by user.`]);
      setIsRunning(false);
      setActivePid(null);
    }
  };

  // Build .aepkg Package Archive
  const handleBuildPackage = async () => {
    await handleSaveAll();
    setInstallSuccess(false);

    try {
      setLogs((prev) => [...prev, `[Build] Packaging project files from ${projectRoot}...`]);

      const packFiles = new Map<string, Uint8Array>();
      for (const f of fileList) {
        const rel = f.replace(projectRoot, '').replace(/^\/+/, '');
        if (!rel.startsWith('dist/')) {
          packFiles.set(rel, vfs.readBytes(f));
        }
      }

      const val = await PackageValidator.validate(packFiles);
      if (!val.valid || !val.manifest) {
        setLogs((prev) => [
          ...prev,
          `[Build Failed] Validation errors:`,
          ...val.errors.map((e) => `  - ${e}`),
        ]);
        setActiveBottomTab('output');
        return;
      }

      const archiveBytes = await PackageArchive.pack(packFiles);
      setBuiltArchive(archiveBytes);

      const distDir = `${projectRoot}/dist`;
      if (!vfs.exists(distDir)) vfs.mkdir(distDir, { recursive: true });

      const distFile = `${distDir}/${val.manifest.id}.aepkg`;
      await vfs.writeBytes(distFile, archiveBytes);

      setLogs((prev) => [
        ...prev,
        `[Build Success] Built package: ${val.manifest?.name} (${val.manifest?.version})`,
        `  Saved to VFS: ${distFile} (${archiveBytes.byteLength} bytes)`,
      ]);
      setActiveBottomTab('output');
    } catch (err) {
      setLogs((prev) => [...prev, `[Build Error] ${(err as Error).message}`]);
    }
  };

  // Install Built Package into OS
  const handleInstallBuiltPackage = async () => {
    if (!builtArchive) return;
    try {
      setLogs((prev) => [...prev, `[Install] Installing built package into AetherOS...`]);
      const res = await packageManager.installArchive(builtArchive);
      if (res.success) {
        setInstallSuccess(true);
        setLogs((prev) => [
          ...prev,
          `[Install Success] Application '${res.packageId}' v${res.version} is now installed!`,
          `  It is accessible via Application Launcher, Alt+Space runner, and Software Center.`,
        ]);
      } else {
        setLogs((prev) => [...prev, `[Install Failed] ${res.error}`]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[Install Error] ${(err as Error).message}`]);
    }
  };

  // Git Actions
  const handleGitInit = async () => {
    try {
      await gitService.init(projectRoot);
      setLogs((prev) => [...prev, `[Git] Initialized empty Git repository in ${projectRoot}/.git/`]);
      refreshProject();
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Error] ${(err as Error).message}`]);
    }
  };

  const handleGitStage = async (file: string) => {
    try {
      await gitService.add(projectRoot, file);
      refreshProject();
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Error] ${(err as Error).message}`]);
    }
  };

  const handleGitCommit = async () => {
    if (!commitMessage.trim()) return;
    try {
      const oid = await gitService.commit(projectRoot, commitMessage.trim());
      setLogs((prev) => [...prev, `[Git Commit] [${gitStatus?.branch} ${oid.slice(0, 7)}] ${commitMessage}`]);
      setCommitMessage('');
      refreshProject();
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Error] ${(err as Error).message}`]);
    }
  };

  const handleViewDiff = async (filepath: string) => {
    try {
      const diffs = await gitService.diff(projectRoot, filepath);
      if (diffs.length > 0) {
        setSelectedDiff(diffs[0]);
        setMainView('diff');
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Diff Error] ${(err as Error).message}`]);
    }
  };

  // Project search
  const handleProjectSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const results: { file: string; line: number; text: string }[] = [];
    const lower = query.toLowerCase();

    for (const f of fileList) {
      const content = fileContents[f] || (vfs.exists(f) ? vfs.readFile(f) : '');
      const fileLines = content.split('\n');
      for (let i = 0; i < fileLines.length; i++) {
        if (fileLines[i].toLowerCase().includes(lower)) {
          results.push({
            file: f,
            line: i + 1,
            text: fileLines[i].trim(),
          });
        }
      }
    }
    setSearchResults(results);
  };

  // Manifest and Preview Record
  const manifestContent = fileContents[`${projectRoot}/manifest.json`];
  let parsedManifest: AppManifest | null = null;
  if (manifestContent) {
    try {
      parsedManifest = JSON.parse(manifestContent);
    } catch {}
  }

  const previewRecord: InstalledAppRecord | undefined = useMemo(() => {
    if (!parsedManifest) return undefined;
    return {
      id: parsedManifest.id || 'preview.app',
      packageId: parsedManifest.id || 'preview.app',
      name: parsedManifest.name || 'Preview App',
      version: parsedManifest.version || '1.0.0',
      description: parsedManifest.description || '',
      author: parsedManifest.author || '',
      type: parsedManifest.type || 'windowed',
      entry: parsedManifest.entry || 'index.html',
      icon: parsedManifest.icon,
      installDir: projectRoot,
      manifest: parsedManifest,
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'local',
    };
  }, [parsedManifest, projectRoot]);

  const activeFileName = activeFile.split('/').pop() || '';
  const currentContent = fileContents[activeFile] || '';

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-gray-200 font-mono text-xs overflow-hidden select-text relative">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 select-none">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">Code Studio 2.0</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 truncate max-w-[200px]" title={projectRoot}>
            {projectRoot.replace('/home/aether/Projects/', '')}
          </span>

          <button
            onClick={() => setNewProjectModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] transition-colors ml-1"
            title="Create Project from Template"
          >
            <Plus className="w-3 h-3 text-cyan-400" />
            <span>New Project</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Intelligent Run Button */}
          {isRunning ? (
            <button
              onClick={handleStopExecution}
              className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium animate-pulse"
              title="Stop Running Process"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop (PID {activePid})</span>
            </button>
          ) : (
            <button
              onClick={handleRunActiveFile}
              className={`flex items-center gap-1 px-2.5 py-1 text-white rounded text-xs font-medium shadow-sm transition-colors ${
                activeFile.endsWith('.py')
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : activeFile.endsWith('.ts')
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : 'bg-purple-600 hover:bg-purple-500'
              }`}
              title="Run or Compile Active File"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {activeFile.endsWith('.py')
                  ? 'Run Python'
                  : activeFile.endsWith('.ts')
                  ? 'Compile TS'
                  : 'Run in Runtime'}
              </span>
            </button>
          )}

          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-medium"
            title="Save All (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          {parsedManifest && (
            <button
              onClick={handleBuildPackage}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium shadow-sm"
              title="Package Application into .aepkg Archive"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Build .aepkg</span>
            </button>
          )}

          {builtArchive && (
            <button
              onClick={handleInstallBuiltPackage}
              className={`flex items-center gap-1 px-2.5 py-1 text-white rounded text-xs font-medium transition-colors ${
                installSuccess ? 'bg-emerald-600' : 'bg-cyan-600 hover:bg-cyan-500'
              }`}
              title="Install Built Package into AetherOS"
            >
              {installSuccess ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              <span>{installSuccess ? 'Installed' : 'Install to OS'}</span>
            </button>
          )}

          {previewRecord && (
            <button
              onClick={() => {
                handleSaveAll();
                setMainView('preview');
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
              title="Run Project in Sandboxed Preview"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Activity Bar */}
        <div className="w-12 bg-[#0b0e14] border-r border-gray-800 flex flex-col items-center py-2 gap-3 select-none z-10">
          <button
            onClick={() => setActiveSidebar('files')}
            className={`p-2 rounded hover:bg-gray-800 transition-colors relative ${
              activeSidebar === 'files' ? 'text-cyan-400 bg-gray-800/60' : 'text-gray-400'
            }`}
            title="Explorer (Files)"
          >
            <Layers className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveSidebar('git')}
            className={`p-2 rounded hover:bg-gray-800 transition-colors relative ${
              activeSidebar === 'git' ? 'text-cyan-400 bg-gray-800/60' : 'text-gray-400'
            }`}
            title="Source Control (Git)"
          >
            <GitBranch className="w-5 h-5" />
            {gitStatus && !gitStatus.isClean && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 absolute top-1 right-1" />
            )}
          </button>

          <button
            onClick={() => setActiveSidebar('search')}
            className={`p-2 rounded hover:bg-gray-800 transition-colors ${
              activeSidebar === 'search' ? 'text-cyan-400 bg-gray-800/60' : 'text-gray-400'
            }`}
            title="Search in Project"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveSidebar('problems')}
            className={`p-2 rounded hover:bg-gray-800 transition-colors relative ${
              activeSidebar === 'problems' ? 'text-cyan-400 bg-gray-800/60' : 'text-gray-400'
            }`}
            title="Problems & Diagnostics"
          >
            <AlertCircle className="w-5 h-5" />
            {projectDiagnostics.length > 0 && (
              <span className="px-1 text-[9px] bg-rose-600 text-white rounded-full absolute -top-0.5 -right-0.5 font-bold">
                {projectDiagnostics.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSidebar('tasks')}
            className={`p-2 rounded hover:bg-gray-800 transition-colors ${
              activeSidebar === 'tasks' ? 'text-cyan-400 bg-gray-800/60' : 'text-gray-400'
            }`}
            title="Tasks & Scripts"
          >
            <PlayCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Sidebar Content */}
        <div className="w-56 bg-[#161a26] border-r border-gray-800 flex flex-col select-none overflow-hidden">
          {/* Files Explorer */}
          {activeSidebar === 'files' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
                <span>Files</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setNewFileModal(true)} title="New File" className="hover:text-white">
                    <FilePlus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={refreshProject} title="Refresh" className="hover:text-white">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
                {fileList.map((file) => {
                  const name = file.replace(projectRoot, '').replace(/^\/+/, '');
                  const isSelected = file === activeFile;
                  const dirty = fileContents[file] !== savedContents[file];

                  return (
                    <button
                      key={file}
                      onClick={() => {
                        if (!openTabs.includes(file)) setOpenTabs((prev) => [...prev, file]);
                        setActiveFile(file);
                        setMainView('editor');
                      }}
                      className={`flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                        isSelected ? 'bg-cyan-500/20 text-cyan-300 font-medium' : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {file.endsWith('.ts') ? (
                          <Code2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        ) : file.endsWith('.py') ? (
                          <Cpu className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        ) : file.endsWith('.json') ? (
                          <Box className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{name}</span>
                      </div>
                      {dirty && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source Control / Git */}
          {activeSidebar === 'git' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
                <span>Source Control</span>
                {hasGitRepo && (
                  <span className="text-cyan-400 lowercase font-normal">{gitStatus?.branch || 'main'}</span>
                )}
              </div>

              {!hasGitRepo ? (
                <div className="flex flex-col gap-2 p-3 text-center">
                  <p className="text-gray-400 text-[11px]">This folder is not a Git repository.</p>
                  <button
                    onClick={handleGitInit}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-xs shadow"
                  >
                    Initialize Git
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message (Enter to commit)..."
                      className="w-full h-16 p-2 bg-[#0d1117] border border-gray-700 rounded text-xs text-white outline-none resize-none focus:border-cyan-400"
                    />
                    <button
                      onClick={handleGitCommit}
                      disabled={!commitMessage.trim()}
                      className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded font-medium text-xs transition-colors"
                    >
                      Commit to {gitStatus?.branch || 'main'}
                    </button>
                  </div>

                  {/* Changes List */}
                  {gitStatus && (
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">
                        Changes ({gitStatus.unstaged.length + gitStatus.untracked.length})
                      </span>
                      {[...gitStatus.unstaged, ...gitStatus.untracked].map((item) => (
                        <div
                          key={item.filepath}
                          className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-gray-800/80 group"
                        >
                          <button
                            onClick={() => handleViewDiff(item.filepath)}
                            className="flex items-center gap-1.5 truncate text-left text-gray-300 hover:text-cyan-300 flex-1"
                            title="Click to view diff"
                          >
                            <span className="text-[10px] font-bold text-amber-400">
                              {item.status === 'untracked' ? 'U' : 'M'}
                            </span>
                            <span className="truncate">{item.filepath}</span>
                          </button>
                          <button
                            onClick={() => handleGitStage(item.filepath)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 text-gray-400 transition-opacity"
                            title="Stage file"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* Staged Changes */}
                      {gitStatus.staged.length > 0 && (
                        <>
                          <span className="text-[10px] text-gray-500 font-semibold uppercase mt-2">
                            Staged ({gitStatus.staged.length})
                          </span>
                          {gitStatus.staged.map((item) => (
                            <div
                              key={item.filepath}
                              className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-gray-800/80"
                            >
                              <button
                                onClick={() => handleViewDiff(item.filepath)}
                                className="flex items-center gap-1.5 truncate text-left text-emerald-300 hover:underline flex-1"
                              >
                                <span className="text-[10px] font-bold text-emerald-400">
                                  {item.status === 'added' ? 'A' : 'M'}
                                </span>
                                <span className="truncate">{item.filepath}</span>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* Commit History */}
                  {gitCommits.length > 0 && (
                    <div className="flex flex-col gap-1 mt-3 pt-2 border-t border-gray-800">
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Recent Commits</span>
                      {gitCommits.map((c) => (
                        <div key={c.oid} className="flex flex-col text-[11px] p-1 rounded hover:bg-gray-800/50">
                          <span className="text-white truncate font-medium">{c.message}</span>
                          <span className="text-[10px] text-gray-500">{c.oid.slice(0, 7)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Search in Project */}
          {activeSidebar === 'search' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
                <span>Search</span>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleProjectSearch(e.target.value)}
                placeholder="Search text in project..."
                className="px-2 py-1 bg-[#0d1117] border border-gray-700 rounded text-xs text-white outline-none mb-2 focus:border-cyan-400"
              />
              <div className="flex-1 overflow-y-auto flex flex-col gap-1">
                {searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!openTabs.includes(res.file)) setOpenTabs((prev) => [...prev, res.file]);
                      setActiveFile(res.file);
                      setJumpToLine(res.line);
                      setMainView('editor');
                    }}
                    className="flex flex-col text-left p-1.5 rounded hover:bg-gray-800/60 border border-transparent hover:border-gray-700 transition-colors"
                  >
                    <span className="text-cyan-400 text-[11px] font-medium truncate">
                      {res.file.split('/').pop()}:{res.line}
                    </span>
                    <span className="text-gray-400 text-[10px] truncate">{res.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Problems / Diagnostics */}
          {activeSidebar === 'problems' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
                <span>Problems ({projectDiagnostics.length})</span>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1">
                {projectDiagnostics.length === 0 ? (
                  <div className="text-gray-500 italic p-3 text-center">No issues detected in project.</div>
                ) : (
                  projectDiagnostics.map((d, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (!openTabs.includes(d.file)) setOpenTabs((prev) => [...prev, d.file]);
                        setActiveFile(d.file);
                        setJumpToLine(d.line);
                        setMainView('editor');
                      }}
                      className="flex flex-col text-left p-1.5 rounded hover:bg-gray-800/60 border border-transparent hover:border-rose-900/40"
                    >
                      <div className="flex items-center gap-1 text-rose-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{d.code}: {d.message}</span>
                      </div>
                      <span className="text-gray-500 text-[10px] pl-4">
                        {d.file.split('/').pop()}(Ln {d.line}, Col {d.col})
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tasks & Build Scripts */}
          {activeSidebar === 'tasks' && (
            <div className="flex-1 flex flex-col p-2 overflow-hidden">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
                <span>Tasks & Scripts</span>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
                {projectTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800 hover:border-gray-700"
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-semibold text-white">{t.name}</span>
                      <span className="text-[10px] text-gray-400 truncate">{t.command}</span>
                    </div>
                    <button
                      onClick={async () => {
                        setActiveBottomTab('output');
                        await taskManager.runTask(projectRoot, t, (chunk) => {
                          setLogs((prev) => [...prev, chunk.trimEnd()]);
                        });
                        refreshProject();
                      }}
                      className="p-1.5 bg-cyan-600/80 hover:bg-cyan-500 text-white rounded"
                      title="Run Task"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center Main Editor / Preview Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Tabs Header */}
          <div className="flex items-center justify-between bg-[#141822] border-b border-gray-800 px-2 select-none">
            <div className="flex items-center overflow-x-auto flex-1 scrollbar-none">
              {openTabs.map((tabPath) => {
                const tabName = tabPath.split('/').pop() || '';
                const isSelected = tabPath === activeFile && mainView === 'editor';
                const tabDirty = fileContents[tabPath] !== savedContents[tabPath];

                return (
                  <div
                    key={tabPath}
                    onClick={() => {
                      setActiveFile(tabPath);
                      setMainView('editor');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border-t-2 font-medium cursor-pointer border-r border-gray-800/60 transition-colors ${
                      isSelected
                        ? 'bg-[#0d1117] text-white border-cyan-400'
                        : 'text-gray-400 border-transparent hover:bg-gray-800/60 hover:text-gray-200'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{tabName}</span>
                    {tabDirty && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextTabs = openTabs.filter((t) => t !== tabPath);
                        setOpenTabs(nextTabs);
                        if (activeFile === tabPath && nextTabs.length > 0) {
                          setActiveFile(nextTabs[nextTabs.length - 1]);
                        }
                      }}
                      className="p-0.5 hover:text-white rounded hover:bg-gray-700 ml-1 text-gray-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {previewRecord && (
                <button
                  onClick={() => setMainView('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-t-2 font-medium ${
                    mainView === 'preview'
                      ? 'bg-[#0d1117] text-white border-emerald-400'
                      : 'text-gray-400 border-transparent hover:bg-gray-800'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Preview</span>
                </button>
              )}

              {selectedDiff && (
                <button
                  onClick={() => setMainView('diff')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-t-2 font-medium ${
                    mainView === 'diff'
                      ? 'bg-[#0d1117] text-white border-amber-400'
                      : 'text-gray-400 border-transparent hover:bg-gray-800'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                  <span>Diff: {selectedDiff.filepath}</span>
                </button>
              )}
            </div>

            {/* Split Editor Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSplitMode((prev) => (prev === 'horizontal' ? 'none' : 'horizontal'))}
                className={`p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white ${
                  splitMode === 'horizontal' ? 'text-cyan-400 bg-gray-800' : ''
                }`}
                title="Split Editor Horizontally"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSplitMode((prev) => (prev === 'vertical' ? 'none' : 'vertical'))}
                className={`p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white ${
                  splitMode === 'vertical' ? 'text-cyan-400 bg-gray-800' : ''
                }`}
                title="Split Editor Vertically"
              >
                <Rows className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Main Workspace Surface */}
          <div className="flex-1 flex overflow-hidden relative">
            {mainView === 'preview' ? (
              <div className="w-full h-full flex flex-col bg-[#0f172a] relative">
                {previewRecord ? (
                  <AppHost
                    key={previewKey}
                    windowId="code-studio-preview"
                    pid={9999}
                    isFocused={true}
                    onClose={() => setMainView('editor')}
                    previewRecord={previewRecord}
                  />
                ) : (
                  <div className="p-4 text-gray-400 text-xs">No previewable app available.</div>
                )}
              </div>
            ) : mainView === 'diff' && selectedDiff ? (
              <StudioDiffViewer diff={selectedDiff} onClose={() => setMainView('editor')} />
            ) : (
              <div className={`flex-1 flex overflow-hidden ${splitMode === 'vertical' ? 'flex-col' : 'flex-row'}`}>
                {/* Primary Editor Pane */}
                <div className="flex-1 h-full overflow-hidden">
                  <EditorHost
                    value={currentContent}
                    onChange={(val) => {
                      setFileContents((prev) => ({ ...prev, [activeFile]: val }));
                    }}
                    filename={activeFileName}
                    onSave={handleSaveActive}
                    onCursorChange={(line, col) => setCursorPos({ line, col })}
                    highlightLine={jumpToLine}
                    diagnostics={projectDiagnostics.filter((d) => d.file === activeFile)}
                  />
                </div>

                {/* Secondary Split Pane */}
                {splitMode !== 'none' && (
                  <div className="flex-1 h-full border-l border-gray-800 overflow-hidden">
                    <EditorHost
                      value={fileContents[secondaryActiveFile || fileList[1] || activeFile] || ''}
                      onChange={(val) => {
                        const target = secondaryActiveFile || fileList[1] || activeFile;
                        setFileContents((prev) => ({ ...prev, [target]: val }));
                      }}
                      filename={(secondaryActiveFile || fileList[1] || activeFile).split('/').pop()}
                      onSave={handleSaveAll}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Panel (Terminal, Output, Problems) */}
          {bottomPanelOpen && (
            <div className="h-44 bg-[#0d1017] border-t border-gray-800 flex flex-col overflow-hidden select-text">
              {/* Bottom Panel Tab Header */}
              <div className="flex items-center justify-between px-2 bg-[#161a26] border-b border-gray-800 select-none">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveBottomTab('terminal')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border-t-2 ${
                      activeBottomTab === 'terminal'
                        ? 'border-cyan-400 text-white bg-[#0d1017]'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Terminal</span>
                  </button>

                  <button
                    onClick={() => setActiveBottomTab('output')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border-t-2 ${
                      activeBottomTab === 'output'
                        ? 'border-cyan-400 text-white bg-[#0d1017]'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 text-purple-400" />
                    <span>Output</span>
                    {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </button>

                  <button
                    onClick={() => setActiveBottomTab('problems')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border-t-2 ${
                      activeBottomTab === 'problems'
                        ? 'border-cyan-400 text-white bg-[#0d1017]'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Problems</span>
                    {projectDiagnostics.length > 0 && (
                      <span className="text-[10px] text-rose-400">({projectDiagnostics.length})</span>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {activeBottomTab === 'output' && (
                    <button
                      onClick={() => setLogs([])}
                      className="flex items-center gap-1 hover:text-white transition-colors text-[10px] text-gray-400"
                      title="Clear Output"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    onClick={() => setBottomPanelOpen(false)}
                    className="p-1 text-gray-500 hover:text-white rounded"
                    title="Collapse Panel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bottom Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeBottomTab === 'terminal' ? (
                  <StudioTerminal cwd={projectRoot} onCwdChange={(newCwd) => setProjectRoot(newCwd)} />
                ) : activeBottomTab === 'output' ? (
                  <div className="h-full p-2 font-mono text-[11px] overflow-y-auto select-text text-gray-300 leading-relaxed">
                    {logs.length === 0 ? (
                      <div className="text-gray-600 italic">No output. Run scripts or compile project.</div>
                    ) : (
                      logs.map((log, idx) => <div key={idx}>{log}</div>)
                    )}
                  </div>
                ) : (
                  <div className="h-full p-2 overflow-y-auto flex flex-col gap-1 text-[11px]">
                    {projectDiagnostics.map((d, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          if (!openTabs.includes(d.file)) setOpenTabs((prev) => [...prev, d.file]);
                          setActiveFile(d.file);
                          setJumpToLine(d.line);
                          setMainView('editor');
                        }}
                        className="flex items-center gap-2 p-1 rounded hover:bg-gray-800 cursor-pointer text-rose-300"
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="font-semibold">{d.code}:</span>
                        <span className="truncate flex-1">{d.message}</span>
                        <span className="text-gray-500 text-[10px]">
                          {d.file.split('/').pop()}:{d.line}:{d.col}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* IDE Status Bar */}
          <div className="h-5 bg-[#0b0e14] border-t border-gray-800 px-3 flex items-center justify-between text-[11px] text-gray-400 select-none">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-cyan-400">
                <GitBranch className="w-3 h-3" />
                <span>{hasGitRepo ? gitStatus?.branch || 'main' : 'No Git'}</span>
              </span>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => setBottomPanelOpen((prev) => !prev)}
                className="hover:text-white transition-colors"
              >
                {bottomPanelOpen ? 'Hide Terminal' : 'Show Terminal'}
              </button>
              {isRunning && (
                <span className="text-amber-400 animate-pulse">PID {activePid} Running</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
              <span className="text-gray-600">|</span>
              <span>Spaces: 2</span>
              <span className="text-gray-600">|</span>
              <span>UTF-8</span>
              <span className="text-gray-600">|</span>
              <span className="uppercase text-cyan-400">
                {activeFileName.split('.').pop() || 'Plain Text'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {newProjectModal && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a202c] border border-gray-700 rounded-lg max-w-lg w-full p-4 flex flex-col gap-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-2">
              <h3 className="font-semibold text-white text-sm">Create New Development Project</h3>
              <button onClick={() => setNewProjectModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-400">Project Directory Name:</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white outline-none focus:border-cyan-400"
                placeholder="my-aether-app"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-400">Select Template:</label>
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={`flex flex-col text-left p-2.5 rounded border transition-colors ${
                      selectedTemplate.id === tmpl.id
                        ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                        : 'border-gray-700/60 bg-gray-900/60 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-medium text-xs text-white">{tmpl.name}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">{tmpl.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
              <button
                onClick={() => setNewProjectModal(false)}
                className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {newFileModal && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a202c] border border-gray-700 rounded-lg max-w-sm w-full p-4 flex flex-col gap-3 shadow-2xl">
            <h3 className="font-semibold text-white text-sm">Create New File</h3>
            <input
              type="text"
              value={newFileNameInput}
              onChange={(e) => setNewFileNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') setNewFileModal(false);
              }}
              placeholder="e.g., utils.ts, script.py"
              className="px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white outline-none focus:border-cyan-400"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setNewFileModal(false)}
                className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// AetherOS - Code Studio 3.0 (Developer Workstation IDE)
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { aetherRuntime, type RuntimeSession } from '../../runtime/AetherRuntime';
import { pythonRuntime } from '../../runtimes/python/PythonRuntime';
import { typeScriptCompiler } from '../../runtimes/typescript/TypeScriptCompiler';
import { gitService, type GitStatusSummary, type GitCommitRecord } from '../../git/GitService';
import type { FileDiffResult } from '../../git/GitDiff';
import { projectManager } from '../../developer/ProjectManager';
import { taskManager } from '../../developer/TaskManager';
import type { TaskDefinition, TaskExecution } from '../../developer/types';
import { TEMPLATES, type ProjectTemplate } from './templates';
import { PackageArchive } from '../../pkg/packageArchive';
import { PackageValidator } from '../../pkg/packageValidator';
import { packageManager } from '../../pkg/packageManager';
import { useSystem } from '../../core/context';
import { systemLogger } from '../../core/logger';
import { dialogService } from '../../core/dialog';
import { isWithin, relativeFilePath, withoutSymlinks } from '../../vfs/safePath';
import { typeScriptService } from '../../runtimes/typescript/TypeScriptService';
import { generateIntegrityManifest } from '../../pkg/packageIntegrity';
import { lastStudioProject, readStudioWorkspace, saveStudioWorkspace, type PreviewSize } from './workspaceState';
import { AppHost, type PreviewMessage } from '../../appPlatform/AppHost';
import type { AppManifest } from '../../appPlatform/AppManifest';
import type { InstalledAppRecord } from '../../appPlatform/DynamicAppRegistry';
import { EditorHost } from '../../editor/EditorHost';
import { StudioTerminal } from './StudioTerminal';
import { StudioDiffViewer } from './StudioDiffViewer';
import type { TSCompletionItem, TSDiagnostic } from '../../runtimes/typescript/types';
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

export const CodeStudioApp: React.FC<AppProps> = ({ initialProps, windowId, pid, isFocused }) => {
  const { registerCloseGuard } = useSystem();
  const initialFilePath = (initialProps?.filePath as string) || '';
  const initialRoot = initialFilePath
    ? projectManager.findProjectRoot(initialFilePath)
    : ((initialProps?.projectRoot as string) || lastStudioProject() || '/home/aether/Projects/typescript-demo');

  // Project state
  const [initialWorkspace] = useState(() => readStudioWorkspace(initialRoot));
  const [projectRoot, setProjectRoot] = useState<string>(initialRoot);
  const [fileList, setFileList] = useState<string[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>(() => initialFilePath ? [...new Set([...initialWorkspace.openTabs, initialFilePath])] : initialWorkspace.openTabs);
  const [activeFile, setActiveFile] = useState(initialFilePath || initialWorkspace.activeFile);
  const [secondaryActiveFile, setSecondaryActiveFile] = useState(initialWorkspace.secondaryFile);
  const [splitMode, setSplitMode] = useState(initialWorkspace.split);

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
  const [jump, setJump] = useState<{ line: number; col?: number }>();
  const [suggestions, setSuggestions] = useState<{ items: TSCompletionItem[]; position: number; prefix: string }>();
  const [hoverText, setHoverText] = useState('');
  const [saveError, setSaveError] = useState('');
  const [autosave, setAutosave] = useState(initialWorkspace.autosave);
  const [logs, setLogs] = useState<string[]>([]);
  const queuedLogs = useRef<string[]>([]);
  const logFrame = useRef<number | undefined>(undefined);
  const appendLog = useCallback((chunk: string) => {
    queuedLogs.current.push(chunk.trimEnd().slice(0, 8000));
    if (logFrame.current !== undefined) return;
    logFrame.current = requestAnimationFrame(() => {
      logFrame.current = undefined;
      const batch = queuedLogs.current.splice(0);
      setLogs((previous) => [...previous, ...batch].slice(-300));
    });
  }, []);
  useEffect(() => () => {
    if (logFrame.current !== undefined) cancelAnimationFrame(logFrame.current);
    logFrame.current = undefined;
  }, []);
  const [isRunning, setIsRunning] = useState(false);
  const [activePid, setActivePid] = useState<number | null>(null);

  // Git state
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [gitCommits, setGitCommits] = useState<GitCommitRecord[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedDiff, setSelectedDiff] = useState<FileDiffResult | null>(null);
  const [hasGitRepo, setHasGitRepo] = useState(false);

  // Project search & diagnostics
  const [searchQuery, setSearchQuery] = useState('');
  const searchSequence = useRef(0);
  const [searchResults, setSearchResults] = useState<{ file: string; line: number; text: string }[]>([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<TSDiagnostic[]>([]);
  const [projectTasks, setProjectTasks] = useState<TaskDefinition[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskExecution[]>([]);
  const [taskClock, setTaskClock] = useState(0);
  const tasksRunning = taskRuns.some((task) => task.status === 'running');
  useEffect(() => {
    if (!tasksRunning || activeSidebar !== 'tasks') return;
    const timer = setInterval(() => setTaskClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, [tasksRunning, activeSidebar]);
  const runningTasks = useRef(new Set<number>());

  // Modals
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>(TEMPLATES[1] || TEMPLATES[0]);
  const [newProjectName, setNewProjectName] = useState('my-ts-app');
  const [newFileNameInput, setNewFileNameInput] = useState('');
  const [newFileModal, setNewFileModal] = useState(false);

  // Packaging & Preview
  const [previewKey, setPreviewKey] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSize>(initialWorkspace.previewSize);
  const [previewConsole, setPreviewConsole] = useState<PreviewMessage[]>([]);
  const [previewError, setPreviewError] = useState<PreviewMessage>();
  const capturePreview = useCallback((message: PreviewMessage) => {
    setPreviewConsole((previous) => [...previous.slice(-199), message]);
    if (message.level === 'exception') setPreviewError(message);
  }, []);
  const [builtArchive, setBuiltArchive] = useState<Uint8Array | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Active execution session refs
  const activeJsSessionRef = useRef<RuntimeSession | null>(null);
  const activeRun = useRef<AbortController | null>(null);
  useEffect(() => {
    const tasks = runningTasks.current;
    return () => {
      activeRun.current?.abort(143);
      activeJsSessionRef.current?.cancel();
      for (const task of tasks) taskManager.cancel(task);
    };
  }, []);

  const state = useRef({ activeFile, openTabs, fileContents, savedContents });
  const refreshSequence = useRef(0);
  const loadedRoot = useRef('');
  useEffect(() => {
    state.current = { activeFile, openTabs, fileContents, savedContents };
  }, [activeFile, openTabs, fileContents, savedContents]);

  const refreshProject = useCallback(async () => {
    const current = ++refreshSequence.current;
    try {
      if (!vfs.exists(projectRoot)) {
        vfs.atomicBatch(() => {
          for (const [name, content] of Object.entries((TEMPLATES.find((template) => template.id === 'typescript-app') ?? TEMPLATES[0]).files)) {
            const path = vfs.resolve(projectRoot, name);
            vfs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
            vfs.writeText(path, content);
          }
        });
      }
      const files = vfs.getAllNodes().filter((node) => node.type === 'file' && isWithin(node.path, projectRoot) &&
        !node.path.slice(projectRoot.length + 1).split('/').some((part) =>
          ['.git', 'dist', 'node_modules', '__pycache__'].includes(part))).map((node) => node.path).sort();
      setFileList(files);
      if (loadedRoot.current !== projectRoot) {
        loadedRoot.current = projectRoot;
        const candidate = state.current.activeFile && files.includes(state.current.activeFile)
          ? state.current.activeFile
          : files.find((file) => /\/(main\.[jt]s|main\.py|index\.html)$/.test(file)) ?? files[0] ?? '';
        setActiveFile(candidate);
        if (candidate) setOpenTabs((previous) => previous.includes(candidate) ? previous : [...previous, candidate]);
      }
      const currentState = state.current;
      const updates: Record<string, string> = {};
      for (const file of currentState.openTabs) {
        if (!files.includes(file) || currentState.fileContents[file] !== currentState.savedContents[file]) continue;
        const node = vfs.getNodeRaw(file);
        if (node && !node.isBinary && node.size <= 2 * 1024 * 1024) updates[file] = vfs.readText(file);
      }
      if (Object.entries(updates).some(([file, text]) => text !== currentState.savedContents[file])) {
        setFileContents((previous) => ({ ...previous, ...updates }));
        setSavedContents((previous) => ({ ...previous, ...updates }));
      }
      setProjectTasks(taskManager.getTasksForProject(projectRoot));
      const isRepo = await gitService.isRepo(projectRoot);
      const status = isRepo ? await gitService.status(projectRoot) : null;
      const commits = isRepo ? await gitService.log(projectRoot, 10) : [];
      const refs = isRepo ? await gitService.listBranches(projectRoot) : [];
      if (current !== refreshSequence.current) return;
      setHasGitRepo(isRepo);
      setGitStatus(status);
      setGitCommits(commits);
      setBranches(refs);
    } catch (error) {
      if (current === refreshSequence.current) setSaveError(String(error));
    }
  }, [projectRoot]);

  useEffect(() => {
    let timer = setTimeout(refreshProject, 0);
    const unsubscribe = vfs.watch(projectRoot, ({ path }) => {
      if (path.endsWith('/code-studio.json')) return;
      clearTimeout(timer);
      timer = setTimeout(refreshProject, 80);
      if (/\.(?:html?|css|[cm]?js|svg|png|jpe?g)$/.test(path)) {
        setPreviewError(undefined);
        setPreviewConsole([]);
        setPreviewKey((key) => key + 1);
      }
    });
    const invalidate = () => { refreshSequence.current++; };
    return () => { clearTimeout(timer); unsubscribe(); invalidate(); };
  }, [projectRoot, refreshProject]);

  useEffect(() => {
    const paths = new Set([activeFile, secondaryActiveFile, ...openTabs].filter(Boolean));
    const timer = setTimeout(() => {
      const loaded: Record<string, string> = {};
      for (const path of paths) {
        if (!isWithin(path, projectRoot) || Object.hasOwn(state.current.fileContents, path) || !vfs.exists(path)) continue;
        try {
          const stat = vfs.stat(path);
          if (stat.isFile() && !vfs.getNodeRaw(path)?.isBinary && stat.size <= 2 * 1024 * 1024) loaded[path] = vfs.readText(path);
        } catch {}
      }
      if (!Object.keys(loaded).length) return;
      setFileContents((previous) => ({ ...previous, ...loaded }));
      setSavedContents((previous) => ({ ...previous, ...loaded }));
    }, 0);
    return () => clearTimeout(timer);
  }, [activeFile, openTabs, secondaryActiveFile, projectRoot]);

  useEffect(() => {
    const write = () => {
      try {
        saveStudioWorkspace(projectRoot, { openTabs, activeFile, secondaryFile: secondaryActiveFile,
          split: splitMode, previewSize, autosave });
      } catch (error) { systemLogger.warn('studio', 'Could not store workspace: ' + String(error)); }
    };
    write();
    window.addEventListener('pagehide', write);
    return () => window.removeEventListener('pagehide', write);
  }, [projectRoot, openTabs, activeFile, secondaryActiveFile, splitMode, previewSize, autosave]);

  const dirtyFiles = useMemo(() => Object.keys(fileContents).filter((file) =>
    fileContents[file] !== savedContents[file]), [fileContents, savedContents]);
  const overlays = useMemo(() => Object.fromEntries(dirtyFiles.map((file) => [file, fileContents[file]])), [dirtyFiles, fileContents]);

  useEffect(() => {
    if (!fileList.some((file) => /\.[cm]?tsx?$/.test(file))) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void typeScriptCompiler.compile({ cwd: projectRoot, noEmit: true }, overlays, controller.signal)
        .then((report) => { if (!controller.signal.aborted) setProjectDiagnostics(report.diagnostics); })
        .catch((error: unknown) => { if (!controller.signal.aborted) setSaveError(String(error)); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectRoot, fileList, overlays]);

  const saveFiles = useCallback(async (paths = dirtyFiles, ask = false): Promise<boolean> => {
    if (!paths.length) return true;
    try {
      const snapshot = state.current;
      const versions = new Map<string, string | undefined>();
      for (const path of paths) {
        const checked = withoutSymlinks(path);
        if (!isWithin(checked, projectRoot) || !vfs.checkAccess(checked, 'w')) throw new Error(`Cannot write ${path}`);
        const disk = vfs.exists(checked) ? vfs.readText(checked) : undefined;
        versions.set(path, disk);
        if (disk !== snapshot.savedContents[path] && disk !== snapshot.fileContents[path]) {
          if (!ask || !await dialogService.confirm({
            title: 'File changed outside Code Studio', message: `${path} changed on disk. Overwrite it?`,
            confirmText: 'Overwrite file', danger: true,
          })) throw new Error(`Save conflict in ${path}`);
          if ((vfs.exists(checked) ? vfs.readText(checked) : undefined) !== disk) throw new Error(`File changed again: ${path}`);
        }
      }
      vfs.atomicBatch(() => {
        for (const path of paths) {
          const target = withoutSymlinks(path);
          if (!vfs.checkAccess(target, 'w') || (vfs.exists(target) ? vfs.readText(target) : undefined) !== versions.get(path)) {
            throw new Error(`File changed while saving: ${path}`);
          }
          vfs.writeText(target, snapshot.fileContents[path]);
        }
      });
      if (!await vfs.flush()) throw new Error('File changes are in memory. AetherFS could not persist them.');
      const written = Object.fromEntries(paths.map((path) => [path, snapshot.fileContents[path]]));
      setSavedContents((previous) => ({ ...previous, ...written }));
      setSaveError('');
      return true;
    } catch (error) {
      setSaveError(String(error));
      return false;
    }
  }, [dirtyFiles, projectRoot]);

  const handleSaveAll = useCallback(() => saveFiles(dirtyFiles, true), [dirtyFiles, saveFiles]);
  const handleSaveActive = useCallback(() => saveFiles(dirtyFiles.filter((path) => path === activeFile), true), [dirtyFiles, activeFile, saveFiles]);
  useEffect(() => {
    if (!autosave || !dirtyFiles.length) return;
    const timer = setTimeout(() => { void saveFiles(); }, 650);
    return () => clearTimeout(timer);
  }, [autosave, dirtyFiles, saveFiles]);

  const confirmLeaving = useCallback(async () => {
    if (!dirtyFiles.length || await saveFiles()) return true;
    return dialogService.confirm({
      title: 'Unsaved changes', message: 'Some changes could not be saved. Discard them?',
      confirmText: 'Discard changes', danger: true,
    });
  }, [dirtyFiles, saveFiles]);
  useEffect(() => registerCloseGuard(windowId, confirmLeaving), [registerCloseGuard, windowId, confirmLeaving]);
  useEffect(() => {
    if (!dirtyFiles.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyFiles.length]);

  const changeProject = async (root: string) => {
    root = withoutSymlinks(root);
    if (root === projectRoot || !await confirmLeaving()) return;
    const saved = readStudioWorkspace(root);
    searchSequence.current++;
    setSearchQuery('');
    setSearchResults([]);
    setProjectRoot(root);
    setOpenTabs(saved.openTabs);
    setActiveFile(saved.activeFile);
    setSecondaryActiveFile(saved.secondaryFile);
    setSplitMode(saved.split);
    setPreviewSize(saved.previewSize);
    setAutosave(saved.autosave);
    setFileContents({});
    setSavedContents({});
    setProjectDiagnostics([]);
    setSaveError('');
    setBuiltArchive(null);
    setPreviewConsole([]);
    setPreviewError(undefined);
    setMainView('editor');
  };

  const openProject = async () => {
    const input = await dialogService.prompt({
      title: 'Open Project', message: 'Enter an AetherFS project directory.', defaultValue: projectRoot,
      validate: (path) => {
        try { return vfs.stat(vfs.resolve(projectRoot, path)).isDirectory() ? null : 'Choose a directory.'; }
        catch { return 'Directory not found.'; }
      },
    });
    if (input) {
      try { await changeProject(vfs.resolve(projectRoot, input)); }
      catch (error) { setSaveError(String(error)); }
    }
  };

  // Create New Project
  const handleCreateProject = async () => {
    const cleanName = newProjectName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'my-project';
    const targetDir = `/home/aether/Projects/${cleanName}`;
    try {
      if (vfs.exists(targetDir)) throw new Error('A project directory already exists with that name');
      vfs.mkdir(targetDir, { recursive: true });
      for (const [relPath, content] of Object.entries(selectedTemplate.files)) {
        const fullPath = `${targetDir}/${relPath}`;
        const parent = fullPath.split('/').slice(0, -1).join('/') || '/';
        if (!vfs.exists(parent)) vfs.mkdir(parent, { recursive: true });
        vfs.writeFile(fullPath, content);
      }
      await changeProject(targetDir);
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
    try {
      const filePath = withoutSymlinks(`${projectRoot}/${relativeFilePath(newFileNameInput.trim())}`);
      if (vfs.exists(filePath)) throw new Error('A file already exists at this path');
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

  const handleRunActiveFile = async () => {
    if (!activeFile || activeRun.current) return;
    if (/\.html?$/.test(activeFile)) {
      if (await handleSaveAll()) preview();
      return;
    }
    if (!/\.(?:py|[cm]?[jt]sx?)$/.test(activeFile)) {
      setSaveError('Select a JavaScript, TypeScript, Python, or HTML file to run.');
      return;
    }
    const controller = new AbortController();
    activeRun.current = controller;
    const filename = activeFile.split('/').at(-1) ?? activeFile;
    setIsRunning(true);
    setActiveBottomTab('output');
    setBottomPanelOpen(true);
    const stderr = (chunk: string) => appendLog('[stderr] ' + chunk);
    try {
      if (!await handleSaveAll()) return;
      controller.signal.throwIfAborted();
      let code = fileContents[activeFile] ?? vfs.readText(activeFile);
      if (activeFile.endsWith('.py')) {
        appendLog(`[Python] Running ${filename}`);
        const session = pythonRuntime.createSession(`python ${filename}`, pid);
        setActivePid(session.pid);
        const result = await session.execute({
          code, filename, cwd: projectRoot, signal: controller.signal,
          onStdout: appendLog, onStderr: stderr, onStatus: appendLog,
        });
        appendLog(`[Python] Exit ${result.exitCode} (${result.durationMs} ms)`);
        return;
      }
      if (/\.[cm]?tsx?$/.test(activeFile)) {
        appendLog(`[TypeScript] Compiling ${filename}`);
        const result = await typeScriptCompiler.compile({
          entryFile: activeFile, cwd: projectRoot,
        }, overlays, controller.signal);
        for (const diagnostic of result.diagnostics) {
          appendLog(`${diagnostic.file}:${diagnostic.line}:${diagnostic.col} ${diagnostic.code} ${diagnostic.message}`);
        }
        if (!result.success || !result.bundleCode) {
          appendLog(result.success ? 'The project configuration emitted no runnable bundle.' : 'TypeScript compilation failed.');
          return;
        }
        code = result.bundleCode;
      }
      controller.signal.throwIfAborted();
      const session = aetherRuntime.createSession({
        commandName: `js ${filename}`, ppid: pid, onStdout: appendLog, onStderr: stderr,
      });
      activeJsSessionRef.current = session;
      setActivePid(session.pid);
      const result = await session.execute(code);
      appendLog(`[JavaScript] Exit ${result.exitCode} (${result.durationMs} ms)`);
    } catch (error) {
      appendLog(controller.signal.aborted ? 'Execution cancelled.' : String(error));
    } finally {
      setIsRunning(false);
      setActivePid(null);
      activeJsSessionRef.current = null;
      activeRun.current = null;
      void refreshProject();
    }
  };

  const handleStopExecution = () => {
    activeRun.current?.abort(130);
    activeJsSessionRef.current?.cancel();
  };

  const handleBuildPackage = async () => {
    if (!await handleSaveAll()) return;
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

      packFiles.set('integrity.json', new TextEncoder().encode(JSON.stringify(await generateIntegrityManifest(packFiles))));
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
      const summary = await gitService.status(projectRoot);
      if (!summary.staged.length) throw new Error('Stage files before committing');
      const oid = await gitService.commit(projectRoot, commitMessage.trim());
      setLogs((prev) => [...prev, `[Git Commit] [${gitStatus?.branch} ${oid.slice(0, 7)}] ${commitMessage}`]);
      setCommitMessage('');
      refreshProject();
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Error] ${(err as Error).message}`]);
    }
  };

  const handleViewDiff = async (filepath: string, staged = false) => {
    try {
      const diffs = await gitService.diff(projectRoot, filepath, staged ? 'staged' : 'unstaged');
      if (diffs.length > 0) {
        setSelectedDiff(diffs[0]);
        setMainView('diff');
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[Git Diff Error] ${(err as Error).message}`]);
    }
  };

  // Project search
  const gitAction = async (operation: () => Promise<void>) => {
    try { await operation(); await refreshProject(); }
    catch (error) { setSaveError(String(error)); }
  };

  const addBranch = async () => {
    const ref = await dialogService.prompt({ title: 'Create Git branch', message: 'Enter a branch name.' });
    if (ref?.trim()) await gitAction(() => gitService.branch(projectRoot, ref.trim()));
  };

  const switchBranch = async (ref: string) => {
    if (dirtyFiles.length) {
      setSaveError('Save your editor buffers before switching branches.');
      return;
    }
    await gitAction(() => gitService.checkout(projectRoot, ref));
  };

  const restoreFile = async (file: string) => {
    if (dirtyFiles.includes(vfs.resolve(projectRoot, file))) {
      setSaveError('Save or close the editor buffer before restoring this file.');
      return;
    }
    if (await dialogService.confirm({
      title: 'Restore working file', message: `Replace changes in ${file} with the staged version?`,
      danger: true, confirmText: 'Restore',
    })) await gitAction(() => gitService.restore(projectRoot, file));
  };

  const handleProjectSearch = async (query: string) => {
    setSearchQuery(query);
    const request = ++searchSequence.current;
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const results: { file: string; line: number; text: string }[] = [];
    const lower = query.toLowerCase();

    let scanned = 0;
    for (const f of fileList) {
      if (results.length >= 200) break;
      if (++scanned % 16 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (request !== searchSequence.current) return;
      }
      const node = vfs.getNodeRaw(f);
      if (!node || node.isBinary || node.size > 2 * 1024 * 1024 || !vfs.checkAccess(f, 'r')) continue;
      const content = fileContents[f] ?? vfs.readFile(f);
      const fileLines = content.split('\n');
      for (let i = 0; i < fileLines.length && results.length < 200; i++) {
        if (fileLines[i].toLowerCase().includes(lower)) {
          results.push({
            file: f,
            line: i + 1,
            text: fileLines[i].trim(),
          });
        }
      }
    }
    if (request === searchSequence.current) setSearchResults(results);
  };

  const parsedManifest = useMemo<AppManifest | null>(() => {
    const file = projectRoot + '/manifest.json';
    try { return JSON.parse(fileContents[file] ?? (fileList.includes(file) ? vfs.readText(file) : 'null')); }
    catch { return null; }
  }, [fileContents, fileList, projectRoot]);

  const previewEntry = fileList.find((path) => path === projectRoot + '/index.html') ??
    fileList.find((path) => /\.html?$/.test(path));
  const previewRecord = useMemo<InstalledAppRecord | undefined>(() => {
    if (!previewEntry) return;
    const entry = previewEntry.slice(projectRoot.length + 1);
    const manifest: AppManifest = {
      schemaVersion: 1, id: 'preview.app', name: 'Web Preview',
      version: '1.0.0', description: '', author: '', type: 'windowed', entry, ...parsedManifest,
    };
    if (!/\.html?$/i.test(manifest.entry)) manifest.entry = entry;
    return {
      id: manifest.id, packageId: manifest.id, name: manifest.name, version: manifest.version,
      description: manifest.description, author: manifest.author, type: manifest.type, entry: manifest.entry,
      installDir: projectRoot, manifest, installedAt: '', updatedAt: '', source: 'local',
    };
  }, [parsedManifest, previewEntry, projectRoot]);

  const preview = () => {
    setPreviewError(undefined);
    setPreviewConsole([]);
    setPreviewKey((key) => key + 1);
    setMainView('preview');
  };

  const openFile = (path: string, line?: number, col?: number) => {
    if (!isWithin(path, projectRoot) || !vfs.exists(path)) return;
    setOpenTabs((previous) => previous.includes(path) ? previous : [...previous, path]);
    setActiveFile(path);
    setSuggestions(undefined);
    setHoverText('');
    setMainView('editor');
    if (line) setJump({ line, col });
  };

  const inspectSymbol = async (action: 'complete' | 'hover' | 'definition') => {
    if (!/\.[cm]?[jt]sx?$/.test(activeFile)) return;
    try {
      const project = { root: projectRoot, file: activeFile, overlays };
      const { line, col } = cursorPos;
      if (action === 'complete') {
        const items = await typeScriptService.getCompletions(currentContent, line, col, project);
        const position = currentContent.split('\n').slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0) + col - 1;
        setSuggestions({ items: items.slice(0, 12), position, prefix: currentContent.slice(0, position).match(/[\w$]+$/)?.[0] ?? '' });
      } else if (action === 'hover') {
        const info = await typeScriptService.getHover(currentContent, line, col, project);
        setHoverText(info?.contents.join('\n') || 'No symbol information');
      } else {
        const targets = await typeScriptService.getDefinition(currentContent, line, col, project);
        const target = targets.find((item) => isWithin(item.file, projectRoot));
        if (target) openFile(target.file, target.line, target.col);
        else setHoverText('No project definition found');
      }
    } catch (error) { setSaveError(String(error)); }
  };

  const taskState = (execution: TaskExecution) => {
    if (execution.status === 'running') {
      runningTasks.current.add(execution.pid);
      setTaskClock(execution.startTime);
    }
    else runningTasks.current.delete(execution.pid);
    setTaskRuns((previous) => [execution, ...previous.filter((item) => item.pid !== execution.pid)]
      .filter((item, index) => item.status === 'running' || index < 12));
  };

  const activeFileName = activeFile.split('/').pop() || '';
  const currentContent = fileContents[activeFile] ?? '';
  const activeNode = fileList.includes(activeFile) ? vfs.getNodeRaw(activeFile) : null;
  const editorUnavailable = Boolean(activeNode && (activeNode.isBinary || activeNode.size > 2 * 1024 * 1024));

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-gray-200 font-mono text-xs overflow-hidden select-text relative">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 select-none">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">Code Studio 3.0</span>
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
          <button onClick={openProject} className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700">Open Project</button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <label className="flex items-center gap-1 text-[10px]">
            <input type="checkbox" checked={autosave} onChange={(event) => setAutosave(event.target.checked)} />
            Autosave
          </label>
          {/* Intelligent Run Button */}
          {isRunning ? (
            <button
              onClick={handleStopExecution}
              className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium animate-pulse"
              title="Stop Running Process"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{activePid ? `Stop (PID ${activePid})` : 'Cancel'}</span>
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
              onClick={preview}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
              title="Run Project in Sandboxed Preview"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          )}
        </div>
      </div>

      {saveError && <div role="alert" className="px-3 py-1 bg-rose-950/60 text-rose-200">{saveError}</div>}
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
                    <div className="flex gap-1">
                      <select aria-label="Git branch" className="min-w-0 flex-1 bg-gray-800" value={gitStatus?.branch ?? ''} onChange={(event) => void switchBranch(event.target.value)}>
                        {[...new Set([gitStatus?.branch ?? 'main', ...branches])].map((branch) => <option key={branch}>{branch}</option>)}
                      </select>
                      <button className="px-1 bg-gray-800 rounded" onClick={addBranch}>New branch</button>
                    </div>
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message"
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
                              {item.status === 'untracked' ? 'U' : item.status === 'deleted' ? 'D' : 'M'}
                            </span>
                            <span className="truncate">{item.filepath}</span>
                          </button>
                          <button
                            onClick={() => handleGitStage(item.filepath)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 text-gray-400 transition-opacity"
                            title="Stage file"
                            aria-label={`Stage ${item.filepath}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          {item.status !== 'untracked' && <button className="px-1" onClick={() => void restoreFile(item.filepath)}>Restore</button>}
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
                                onClick={() => handleViewDiff(item.filepath, true)}
                                className="flex items-center gap-1.5 truncate text-left text-emerald-300 hover:underline flex-1"
                              >
                                <span className="text-[10px] font-bold text-emerald-400">
                                  {item.status === 'added' ? 'A' : item.status === 'deleted' ? 'D' : 'M'}
                                </span>
                                <span className="truncate">{item.filepath}</span>
                              </button>
                              <button className="px-1" onClick={() => void gitAction(() => gitService.unstage(projectRoot, item.filepath))}>Unstage</button>
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
                      setJump({ line: res.line });
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
                        setJump({ line: d.line, col: d.col });
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
                {taskRuns.map((task) => (
                  <div key={task.pid} className="rounded border border-gray-700 p-2" role="status">
                    <div>{task.taskId} · PID {task.pid} · {task.status}</div>
                    {task.endTime !== undefined ? <span>Exit {task.exitCode} · {task.endTime - task.startTime} ms</span> :
                      <div className="flex justify-between"><span>{((Math.max(taskClock, task.startTime) - task.startTime) / 1000).toFixed(1)} s</span>
                        <button className="text-rose-300" onClick={() => taskManager.cancel(task.pid)}>Stop task</button></div>}
                  </div>
                ))}
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
                        setBottomPanelOpen(true);
                        setActiveBottomTab('output');
                        try {
                          await taskManager.runTask(projectRoot, t, appendLog, taskState, pid);
                          void refreshProject();
                        } catch (error) { setSaveError(String(error)); }
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
                      setSuggestions(undefined);
                      setHoverText('');
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
                      aria-label={`Close ${tabName}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (tabDirty && !await saveFiles([tabPath]) &&
                            !await dialogService.confirm({ title: 'Close unsaved file?', message: tabPath, confirmText: 'Discard changes', danger: true })) return;
                        setFileContents((previous) => { const next = { ...previous }; delete next[tabPath]; return next; });
                        setSavedContents((previous) => { const next = { ...previous }; delete next[tabPath]; return next; });
                        const nextTabs = openTabs.filter((t) => t !== tabPath);
                        setOpenTabs(nextTabs);
                        if (activeFile === tabPath) setActiveFile(nextTabs.at(-1) ?? '');
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
                  onClick={preview}
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
                <div className="flex items-center gap-2 p-2 border-b border-gray-800">
                  <label>Viewport <select aria-label="Preview viewport" className="bg-gray-800 p-1" value={previewSize}
                    onChange={(event) => setPreviewSize(event.target.value as PreviewSize)}>
                    <option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option>
                  </select></label>
                  <button className="px-2 py-1 bg-gray-800 rounded" onClick={preview}>Reload preview</button>
                </div>
                <div className="flex-1 min-h-0 relative overflow-auto">
                  <div className="h-full mx-auto bg-white" style={{ width: previewSize === 'mobile' ? 390 : previewSize === 'tablet' ? 768 : '100%' }}>
                    {previewRecord && <AppHost key={previewKey} windowId={windowId + '-preview'} pid={pid}
                      isFocused={isFocused} previewRecord={previewRecord} onPreviewOutput={capturePreview} />}
                  </div>
                  {previewError && <div role="alert" className="absolute top-0 inset-x-0 p-3 bg-rose-950/95 text-rose-100">
                    <button className="float-right underline" onClick={() => setPreviewError(undefined)}>Dismiss</button>
                    <div>{previewError.message}</div>
                    {previewError.source && <div>{previewError.source}:{previewError.line}:{previewError.col}</div>}
                  </div>}
                </div>
                <div className="h-24 overflow-auto border-t border-gray-700 p-2" aria-label="Preview console">
                  {previewConsole.map((log, index) => <div key={index} className={log.level === 'exception' || log.level === 'error' ? 'text-rose-300' : 'text-gray-300'}>
                    [{log.level}] {log.message}
                  </div>)}
                </div>
              </div>
            ) : mainView === 'diff' && selectedDiff ? (
              <StudioDiffViewer diff={selectedDiff} onClose={() => setMainView('editor')} />
            ) : (
              <div className={`flex-1 flex overflow-hidden ${splitMode === 'vertical' ? 'flex-col' : 'flex-row'}`}>
                {/* Primary Editor Pane */}
                <div className="flex-1 h-full overflow-hidden relative">
                  <div className="absolute right-2 top-1 z-10 flex gap-1">
                    <button className="rounded bg-gray-800 px-1.5" onClick={() => void inspectSymbol('complete')}>Complete</button>
                    <button className="rounded bg-gray-800 px-1.5" onClick={() => void inspectSymbol('hover')}>Type info</button>
                    <button className="rounded bg-gray-800 px-1.5" onClick={() => void inspectSymbol('definition')}>Definition</button>
                  </div>
                  {hoverText && <div className="absolute right-2 top-7 z-20 max-w-[80%] rounded bg-gray-900 p-2 shadow" role="status">
                    <button className="float-right ml-2 underline" onClick={() => setHoverText('')}>Close</button>
                    <pre className="whitespace-pre-wrap">{hoverText}</pre>
                  </div>}
                  {suggestions && <div className="absolute right-2 top-7 z-20 rounded bg-gray-900 p-2 shadow">
                    <button className="underline" onClick={() => setSuggestions(undefined)}>Close suggestions</button>
                    {suggestions.items.map((item) => <button key={item.label} className="block w-full text-left p-1 hover:bg-gray-700"
                      onClick={() => {
                        const start = suggestions.position - suggestions.prefix.length;
                        setFileContents((previous) => ({ ...previous, [activeFile]: currentContent.slice(0, start) + item.label + currentContent.slice(suggestions.position) }));
                        setSuggestions(undefined);
                      }}>{item.label}</button>)}
                  </div>}
                  {editorUnavailable ? <p className="p-4 text-gray-400">This file is binary or exceeds the 2 MiB editor limit.</p> : <EditorHost
                    value={currentContent}
                    key={activeFile}
                    readOnly={!activeFile || fileContents[activeFile] === undefined}
                    onComplete={() => void inspectSymbol('complete')}
                    onDefinition={() => void inspectSymbol('definition')}
                    onChange={(val) => {
                      setFileContents((prev) => ({ ...prev, [activeFile]: val }));
                    }}
                    filename={activeFileName}
                    onSave={handleSaveActive}
                    onCursorChange={(line, col) => setCursorPos({ line, col })}
                    jump={jump}
                    diagnostics={projectDiagnostics.filter((d) => d.file === activeFile)}
                  />}
                </div>

                {/* Secondary Split Pane */}
                {splitMode !== 'none' && (
                  <div className="flex-1 h-full border-l border-gray-800 overflow-hidden flex flex-col">
                    <select aria-label="Split editor file" value={secondaryActiveFile || activeFile} className="bg-gray-800 px-2"
                      onChange={(event) => setSecondaryActiveFile(event.target.value)}>
                      {fileList.map((path) => <option key={path} value={path}>{path.slice(projectRoot.length + 1)}</option>)}
                    </select>
                    <EditorHost
                      value={fileContents[secondaryActiveFile || activeFile] || ''}
                      readOnly={fileContents[secondaryActiveFile || activeFile] === undefined}
                      onChange={(val) => {
                        const target = secondaryActiveFile || activeFile;
                        setFileContents((prev) => ({ ...prev, [target]: val }));
                      }}
                      filename={(secondaryActiveFile || activeFile).split('/').pop()}
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
                  <StudioTerminal key={projectRoot} cwd={projectRoot} />
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
                          setJump({ line: d.line, col: d.col });
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

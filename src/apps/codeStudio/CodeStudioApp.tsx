// AetherOS - Code Studio IDE with Project Explorer, Manifest Validator, App Packaging & Live Sandbox Preview
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { aetherRuntime, type RuntimeSession } from '../../runtime/AetherRuntime';
import { TEMPLATES, type ProjectTemplate } from './templates';
import { PackageArchive } from '../../pkg/packageArchive';
import { PackageValidator } from '../../pkg/packageValidator';
import { packageManager } from '../../pkg/packageManager';
import { AppHost } from '../../appPlatform/AppHost';
import { validateManifest, type AppManifest } from '../../appPlatform/AppManifest';
import type { InstalledAppRecord } from '../../appPlatform/DynamicAppRegistry';
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
  CheckCircle2,
  Download,
  Check,
} from 'lucide-react';

export const CodeStudioApp: React.FC<AppProps> = ({ initialProps }) => {
  const initialFilePath = (initialProps?.filePath as string) || '';
  const initialRoot = initialFilePath
    ? initialFilePath.split('/').slice(0, -1).join('/') || '/'
    : ((initialProps?.projectRoot as string) || '/home/aether/Projects/hello-aether');

  const [projectRoot, setProjectRoot] = useState<string>(initialRoot);
  const [fileList, setFileList] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>(
    initialFilePath || `${initialRoot}/index.html`
  );
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  const [previewKey, setPreviewKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activePid, setActivePid] = useState<number | null>(null);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>(TEMPLATES[0]);
  const [newProjectName, setNewProjectName] = useState('hello-aether');
  const [builtArchive, setBuiltArchive] = useState<Uint8Array | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const activeSessionRef = useRef<RuntimeSession | null>(null);

  // Scan project files
  const refreshProject = useCallback(() => {
    try {
      if (!vfs.exists(projectRoot)) {
        // Create initial project if it doesn't exist
        vfs.mkdir(projectRoot, { recursive: true });
        for (const [name, content] of Object.entries(TEMPLATES[0].files)) {
          vfs.writeFile(`${projectRoot}/${name}`, content);
        }
      }

      const entries = vfs.readdir(projectRoot);
      const files = entries
        .filter((e) => e.type === 'file' && !e.path.includes('/dist/'))
        .map((e) => e.path);
      setFileList(files);

      // Load contents
      const contents: Record<string, string> = {};
      for (const f of files) {
        try {
          contents[f] = vfs.readFile(f);
        } catch {}
      }
      setFileContents(contents);
      setSavedContents({ ...contents });

      if (initialFilePath && files.includes(initialFilePath)) {
        setActiveFile(initialFilePath);
      } else if (files.includes(`${projectRoot}/manifest.json`)) {
        setActiveFile(`${projectRoot}/manifest.json`);
      } else if (files.includes(`${projectRoot}/index.html`)) {
        setActiveFile(`${projectRoot}/index.html`);
      } else if (files.length > 0) {
        setActiveFile(files[0]);
      }
    } catch {}
  }, [projectRoot, initialFilePath]);

  useEffect(() => {
    refreshProject();
  }, [refreshProject]);

  const handleSaveAll = useCallback(() => {
    for (const [path, content] of Object.entries(fileContents)) {
      if (content !== savedContents[path]) {
        try {
          vfs.writeFile(path, content);
        } catch {}
      }
    }
    setSavedContents({ ...fileContents });
    setPreviewKey((k) => k + 1);
  }, [fileContents, savedContents]);

  const handlePreviewSetTitle = useCallback((t: string) => {
    setLogs((prev) => {
      const msg = `[Window Title] App set title to: ${t}`;
      if (prev[prev.length - 1] === msg) return prev;
      return [...prev, msg];
    });
  }, []);

  // Create new project from template
  const handleCreateProject = () => {
    const cleanName = newProjectName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'my-app';
    const targetDir = `/home/aether/Projects/${cleanName}`;
    try {
      if (!vfs.exists(targetDir)) {
        vfs.mkdir(targetDir, { recursive: true });
      }
      for (const [relPath, content] of Object.entries(selectedTemplate.files)) {
        vfs.writeFile(`${targetDir}/${relPath}`, content);
      }
      setProjectRoot(targetDir);
      setNewProjectModal(false);
      setLogs((prev) => [
        ...prev,
        `[Project] Created new project '${cleanName}' from template '${selectedTemplate.name}'`,
      ]);
    } catch (err) {
      setLogs((prev) => [...prev, `[Error] Failed to create project: ${(err as Error).message}`]);
    }
  };

  // Validate Manifest
  const handleValidateManifest = () => {
    handleSaveAll();
    const manifestPath = `${projectRoot}/manifest.json`;
    const raw = fileContents[manifestPath] || (vfs.exists(manifestPath) ? vfs.readFile(manifestPath) : '');
    if (!raw) {
      setLogs((prev) => [...prev, `[Validation] No 'manifest.json' found in ${projectRoot}`]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const res = validateManifest(parsed);
      if (res.valid) {
        setLogs((prev) => [
          ...prev,
          `[Validation Success] Manifest for '${res.manifest?.name}' (v${res.manifest?.version}) is valid and conforms to AetherOS v1.3 schema.`,
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          `[Validation Failed] Manifest errors:`,
          ...res.errors.map((e) => `  - ${e}`),
        ]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[Validation Error] Manifest JSON syntax error: ${(err as Error).message}`]);
    }
  };

  // Build .aepkg package archive
  const handleBuildPackage = async () => {
    handleSaveAll();
    setInstallSuccess(false);

    try {
      setLogs((prev) => [...prev, `[Build] Packaging project files from ${projectRoot}...`]);

      const packFiles = new Map<string, string>();
      for (const f of fileList) {
        const rel = f.replace(projectRoot, '').replace(/^\/+/, '');
        if (!rel.startsWith('dist/')) {
          packFiles.set(rel, fileContents[f] || vfs.readFile(f));
        }
      }

      // Check validation first
      const valFiles = new Map<string, Uint8Array>();
      const enc = new TextEncoder();
      for (const [p, c] of packFiles.entries()) {
        valFiles.set(p, enc.encode(c));
      }

      const val = await PackageValidator.validate(valFiles);
      if (!val.valid || !val.manifest) {
        setLogs((prev) => [
          ...prev,
          `[Build Failed] Validation errors:`,
          ...val.errors.map((e) => `  - ${e}`),
        ]);
        return;
      }

      // Pack ZIP
      const archiveBytes = await PackageArchive.pack(packFiles);
      setBuiltArchive(archiveBytes);

      // Save to VFS dist folder
      const distDir = `${projectRoot}/dist`;
      if (!vfs.exists(distDir)) {
        vfs.mkdir(distDir, { recursive: true });
      }
      const manifest = val.manifest;
      const distFile = `${distDir}/${manifest.id}.aepkg`;
      await vfs.writeBytes(distFile, archiveBytes);

      setLogs((prev) => [
        ...prev,
        `[Build Success] Built package: ${manifest.name} (${manifest.version})`,
        `  Saved to VFS: ${distFile} (${archiveBytes.byteLength} bytes)`,
      ]);

      // Host machine download export
      try {
        const blob = new Blob([new Uint8Array(archiveBytes)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${manifest.id}-${manifest.version}.aepkg`;
        a.click();
        URL.revokeObjectURL(url);
        setLogs((prev) => [...prev, `  Exported to host download: ${a.download}`]);
      } catch {}
    } catch (err) {
      setLogs((prev) => [...prev, `[Build Error] ${(err as Error).message}`]);
    }
  };

  // Direct Install of the Built Package to AetherOS
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
          `  It is now available in the Application Launcher, Alt+Space runner, and Software Center.`,
        ]);
      } else {
        setLogs((prev) => [...prev, `[Install Failed] ${res.error}`]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[Install Error] ${(err as Error).message}`]);
    }
  };

  // Run single JS script in Aether Runtime
  const handleRunJs = async () => {
    handleSaveAll();
    try {
      const session = aetherRuntime.createSession({
        commandName: `js ${activeFileName}`,
        onStdout: (chunk) => setLogs((prev) => [...prev, chunk.trimEnd()]),
        onStderr: (chunk) => setLogs((prev) => [...prev, `[Error] ${chunk.trimEnd()}`]),
      });
      activeSessionRef.current = session;
      setIsRunning(true);
      setActivePid(session.pid);
      setLogs((prev) => [
        ...prev,
        `[Run ${new Date().toLocaleTimeString()}] Executing ${activeFileName} in Aether Secure Runtime (PID ${session.pid})...`,
      ]);

      const res = await session.execute(currentContent);
      setLogs((prev) => [...prev, `[Finished] Process exited with code ${res.exitCode} (${res.durationMs}ms)`]);
    } catch (err) {
      setLogs((prev) => [...prev, `[Fatal] Execution failed: ${(err as Error).message}`]);
    } finally {
      setIsRunning(false);
      setActivePid(null);
      activeSessionRef.current = null;
    }
  };

  const handleStopExecution = () => {
    if (activeSessionRef.current) {
      activeSessionRef.current.cancel();
      setLogs((prev) => [...prev, `[Stopped] User cancelled execution (PID ${activePid})`]);
    }
  };

  const currentContent = fileContents[activeFile] || '';
  const isDirty = currentContent !== savedContents[activeFile];
  const activeFileName = activeFile.split('/').pop() || '';

  // Check if current project has a manifest for sandboxed preview
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

  return (
    <div className="flex flex-col h-full bg-[#11141e] text-gray-200 font-mono text-xs overflow-hidden select-text relative">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1f2e] border-b border-gray-700 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-cyan-400">Code Studio</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 truncate max-w-[200px]">{projectRoot}</span>
          <button
            onClick={() => setNewProjectModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] transition-colors ml-2"
            title="Create Project from Template"
          >
            <Plus className="w-3 h-3 text-cyan-400" />
            <span>New Project</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {activeFile.endsWith('manifest.json') && (
            <button
              onClick={handleValidateManifest}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 text-white rounded text-xs font-medium"
              title="Validate Manifest Schema"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Validate Manifest</span>
            </button>
          )}

          {activeFile.endsWith('.js') && (
            isRunning ? (
              <button
                onClick={handleStopExecution}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium animate-pulse"
                title="Stop Running Script"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop (PID {activePid})</span>
              </button>
            ) : (
              <button
                onClick={handleRunJs}
                className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium"
                title="Run in Aether Secure Runtime"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run in Runtime</span>
              </button>
            )
          )}

          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-medium"
            title="Save All Files"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          <button
            onClick={handleBuildPackage}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium shadow-sm"
            title="Package Application into .aepkg Archive"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Build .aepkg</span>
          </button>

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

          <button
            onClick={() => {
              handleSaveAll();
              setActiveTab('preview');
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
            title="Run Project in Sandboxed Preview"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Live Preview</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Project Files Sidebar */}
        <div className="w-48 bg-[#161a26] border-r border-gray-800 p-2 flex flex-col select-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px]">
            <span>Files</span>
            <button onClick={refreshProject} title="Refresh">
              <RefreshCw className="w-3 h-3 hover:text-white" />
            </button>
          </div>

          <div className="flex flex-col gap-1 overflow-y-auto">
            {fileList.map((file) => {
              const name = file.split('/').pop() || '';
              const isSelected = file === activeFile;
              const dirty = fileContents[file] !== savedContents[file];
              const isManifest = name === 'manifest.json';
              return (
                <button
                  key={file}
                  onClick={() => {
                    setActiveFile(file);
                    setActiveTab('editor');
                  }}
                  className={`flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                    isSelected ? 'bg-cyan-500/20 text-cyan-300 font-medium' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isManifest ? (
                      <Box className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    )}
                    <span className="truncate">{name}</span>
                  </div>
                  {dirty && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center / Right Content Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Header */}
          <div className="flex items-center bg-[#141822] border-b border-gray-800 px-2 select-none">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 border-t-2 font-medium ${
                activeTab === 'editor'
                  ? 'bg-[#11141e] text-white border-cyan-400'
                  : 'text-gray-400 border-transparent hover:bg-gray-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{activeFileName || 'Editor'}</span>
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>}
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 border-t-2 font-medium ${
                activeTab === 'preview'
                  ? 'bg-[#11141e] text-white border-emerald-400'
                  : 'text-gray-400 border-transparent hover:bg-gray-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sandboxed Preview</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'editor' ? (
              <textarea
                value={currentContent}
                onChange={(e) => {
                  const val = e.target.value;
                  setFileContents((prev) => ({ ...prev, [activeFile]: val }));
                }}
                spellCheck={false}
                className="w-full h-full p-3 bg-transparent text-gray-100 outline-none resize-none font-mono text-xs leading-5"
                placeholder="Select or open a file..."
              />
            ) : (
              <div className="w-full h-full flex flex-col bg-[#0f172a] relative">
                {previewRecord ? (
                  <AppHost
                    key={previewKey}
                    windowId="code-studio-preview"
                    pid={9999}
                    isFocused={true}
                    onClose={() => setActiveTab('editor')}
                    setTitle={handlePreviewSetTitle}
                    previewRecord={previewRecord}
                  />
                ) : (
                  <div className="p-4 text-gray-400 text-xs">
                    No valid application manifest or HTML found to preview.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mini Console Output */}
          <div className="h-32 bg-[#0d1017] border-t border-gray-800 p-2 font-mono text-[11px] overflow-y-auto select-text text-gray-400">
            <div className="flex items-center justify-between text-gray-500 pb-1 border-b border-gray-800 mb-1 select-none font-semibold">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Build, Validation & Runtime Output</span>
                {isRunning && (
                  <span className="text-[10px] text-amber-400 font-normal">
                    (PID {activePid} running)
                  </span>
                )}
              </div>
              <button
                onClick={() => setLogs([])}
                className="flex items-center gap-1 hover:text-white transition-colors"
                title="Clear Logs"
              >
                <Trash2 className="w-3 h-3" />
                <span className="text-[10px]">Clear</span>
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="text-gray-600 italic">No output. Click "Build .aepkg", "Validate Manifest", or "Live Preview".</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {newProjectModal && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a202c] border border-gray-700 rounded-lg max-w-md w-full p-4 flex flex-col gap-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-2">
              <h3 className="font-semibold text-white text-sm">Create New Application Project</h3>
              <button
                onClick={() => setNewProjectModal(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-400">Project Name / Folder:</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white outline-none focus:border-cyan-400"
                placeholder="my-aether-app"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-400">Application Template:</label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={`flex flex-col text-left p-2 rounded border transition-colors ${
                      selectedTemplate.id === tmpl.id
                        ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                        : 'border-gray-700/60 bg-gray-900/60 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-medium text-xs">{tmpl.name}</span>
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
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

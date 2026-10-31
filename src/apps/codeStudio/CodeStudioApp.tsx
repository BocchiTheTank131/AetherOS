// AetherOS - Code Studio IDE with Project Explorer & Live Sandbox Preview
import React, { useState, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { aetherRuntime } from '../../runtime/AetherRuntime';
import {
  Play,
  RefreshCw,
  FileCode,
  Save,
  Terminal,
  Eye,
} from 'lucide-react';

export const CodeStudioApp: React.FC<AppProps> = ({ initialProps }) => {
  const initialFilePath = (initialProps?.filePath as string) || '';
  const initialRoot = initialFilePath
    ? initialFilePath.split('/').slice(0, -1).join('/') || '/'
    : ((initialProps?.projectRoot as string) || '/home/aether/Projects/web-demo');

  const [projectRoot] = useState<string>(initialRoot);
  const [fileList, setFileList] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>(
    initialFilePath || `${initialRoot}/index.html`
  );
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  const [previewKey, setPreviewKey] = useState(0);
  const [previewHtml, setPreviewHtml] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [logs, setLogs] = useState<string[]>([]);

  // Scan project files
  const refreshProject = useCallback(() => {
    try {
      if (vfs.exists(projectRoot)) {
        const entries = vfs.readdir(projectRoot);
        const files = entries.filter((e) => e.type === 'file').map((e) => e.path);
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
        } else if (files.includes(`${projectRoot}/index.html`)) {
          setActiveFile(`${projectRoot}/index.html`);
        } else if (files.length > 0) {
          setActiveFile(files[0]);
        }
      }
    } catch {}
  }, [projectRoot, initialFilePath]);

  useEffect(() => {
    refreshProject();
  }, [refreshProject]);

  // Build bundled HTML for iframe preview
  const generatePreview = useCallback(() => {
    try {
      let html = fileContents[`${projectRoot}/index.html`] || '<h1>No index.html found</h1>';

      // Inject all linked CSS files
      html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (fullMatch, href) => {
        if (fullMatch.includes('stylesheet') || href.endsWith('.css')) {
          const cssPath = vfs.resolve(projectRoot, href);
          const cssContent = fileContents[cssPath] || (vfs.exists(cssPath) ? vfs.readFile(cssPath) : '');
          return `<style>/* ${href} */\n${cssContent}</style>`;
        }
        return fullMatch;
      });

      // Inject all linked JS scripts
      html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (_fullMatch, src) => {
        const jsPath = vfs.resolve(projectRoot, src);
        const jsContent = fileContents[jsPath] || (vfs.exists(jsPath) ? vfs.readFile(jsPath) : '');
        return `<script>/* ${src} */\n${jsContent}</script>`;
      });

      setPreviewHtml(html);
      setPreviewKey((k) => k + 1);
      setLogs((prev) => [...prev, `[Build ${new Date().toLocaleTimeString()}] Live preview compiled successfully`]);
    } catch (err) {
      setLogs((prev) => [...prev, `[Error] Failed to build preview: ${(err as Error).message}`]);
    }
  }, [fileContents, projectRoot]);

  // Initial preview build
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  const handleSaveAll = () => {
    for (const [path, content] of Object.entries(fileContents)) {
      if (content !== savedContents[path]) {
        try {
          vfs.writeFile(path, content);
        } catch {}
      }
    }
    setSavedContents({ ...fileContents });
    generatePreview();
  };

  const handleRunJs = async () => {
    handleSaveAll();
    setLogs((prev) => [...prev, `[Run ${new Date().toLocaleTimeString()}] Executing ${activeFileName} in Aether Secure Runtime...`]);
    try {
      const res = await aetherRuntime.execute(currentContent, {
        commandName: `js ${activeFileName}`,
        onStdout: (chunk) => setLogs((prev) => [...prev, chunk.trimEnd()]),
        onStderr: (chunk) => setLogs((prev) => [...prev, `[Error] ${chunk.trimEnd()}`]),
      });
      setLogs((prev) => [...prev, `[Finished] Process exited with code ${res.exitCode} (${res.durationMs}ms)`]);
    } catch (err) {
      setLogs((prev) => [...prev, `[Fatal] Execution failed: ${(err as Error).message}`]);
    }
  };

  const currentContent = fileContents[activeFile] || '';
  const isDirty = currentContent !== savedContents[activeFile];
  const activeFileName = activeFile.split('/').pop() || '';

  return (
    <div className="flex flex-col h-full bg-[#11141e] text-gray-200 font-mono text-xs overflow-hidden select-text">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1f2e] border-b border-gray-700 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-cyan-400">Code Studio</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 truncate max-w-[200px]">{projectRoot}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {activeFile.endsWith('.js') && (
            <button
              onClick={handleRunJs}
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium"
              title="Run in Aether Secure Runtime"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run in Runtime</span>
            </button>
          )}
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium"
            title="Save and Update Preview"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
          <button
            onClick={() => {
              handleSaveAll();
              generatePreview();
              setActiveTab('preview');
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
            title="Run Project Preview"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Preview</span>
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
                    <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
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
              <span>Live Preview</span>
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
              <div className="w-full h-full flex flex-col bg-white">
                <iframe
                  key={previewKey}
                  srcDoc={previewHtml}
                  title="AetherOS App Preview"
                  sandbox="allow-scripts allow-modals"
                  className="w-full flex-1 border-none bg-white"
                />
              </div>
            )}
          </div>

          {/* Mini Console Output */}
          <div className="h-24 bg-[#0d1017] border-t border-gray-800 p-2 font-mono text-[11px] overflow-y-auto select-text text-gray-400">
            <div className="flex items-center gap-1 text-gray-500 pb-1 border-b border-gray-800 mb-1 select-none font-semibold">
              <Terminal className="w-3 h-3" />
              <span>Preview Build Logs</span>
            </div>
            {logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

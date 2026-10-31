// AetherOS - Web Browser Application
import React, { useState, useRef } from 'react';
import type { AppProps } from '../types';
import {
  RotateCw,
  Home,
  Search,
  ExternalLink,
  Bookmark,
  Shield,
  Plus,
  X,
  Globe,
  AlertCircle,
} from 'lucide-react';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
}

const DEFAULT_BOOKMARKS = [
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { title: 'Wikipedia', url: 'https://en.m.wikipedia.org' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com' },
  { title: 'AetherOS Docs', url: 'about:docs' },
];

export const WebBrowserApp: React.FC<AppProps> = ({ setTitle }) => {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('https://duckduckgo.com');
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNavigate = (targetUrl: string) => {
    let finalUrl = targetUrl.trim();
    if (finalUrl === 'about:docs') {
      // Local docs
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(finalUrl)}`;
      }
    }

    setUrlInput(finalUrl);
    setLoadError(false);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? { ...t, url: finalUrl, title: finalUrl.replace(/^https?:\/\//, '') }
          : t
      )
    );
    if (setTitle) setTitle(`${finalUrl.replace(/^https?:\/\//, '')} - Aether Browser`);
  };

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    const newTab: BrowserTab = { id, title: 'New Tab', url: 'https://duckduckgo.com' };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
    setUrlInput('https://duckduckgo.com');
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
      setUrlInput(remaining[0].url);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e2330] text-gray-200 text-sm overflow-hidden select-none">
      {/* Tabs Bar */}
      <div className="flex items-center bg-[#151922] px-2 pt-1.5 border-b border-gray-800 gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => {
              setActiveTabId(tab.id);
              setUrlInput(tab.url);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-lg max-w-[180px] cursor-pointer transition-colors ${
              tab.id === activeTabId
                ? 'bg-[#1e2330] text-white font-medium border-t-2 border-cyan-400'
                : 'text-gray-400 hover:bg-[#1a1f2c]'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => closeTab(tab.id, e)}
                className="hover:bg-red-500/20 hover:text-red-400 rounded p-0.5 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded ml-1"
          title="New Tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-[#1e2330] border-b border-gray-700/60">
        <div className="flex items-center gap-1 text-gray-400">
          <button
            onClick={() => handleNavigate(activeTab.url)}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Reload"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleNavigate('https://duckduckgo.com')}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex-1 flex items-center bg-[#141824] border border-gray-700/80 rounded-full px-3 py-1 text-xs gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(urlInput);
            }}
            className="flex-1 bg-transparent text-white outline-none font-sans"
            placeholder="Search or enter web address..."
          />
          <button
            onClick={() => handleNavigate(urlInput)}
            className="text-gray-400 hover:text-cyan-400"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Open in Host Tab */}
        <a
          href={activeTab.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/60 rounded"
          title="Open in new browser tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Bookmarks Bar */}
      <div className="flex items-center gap-3 px-3 py-1 bg-[#1a1e2b] border-b border-gray-800 text-xs text-gray-300">
        <Bookmark className="w-3 h-3 text-cyan-400" />
        {DEFAULT_BOOKMARKS.map((b) => (
          <button
            key={b.url}
            onClick={() => handleNavigate(b.url)}
            className="hover:text-cyan-400 transition-colors truncate max-w-[140px]"
          >
            {b.title}
          </button>
        ))}
      </div>

      {/* Viewport / Frame */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {activeTab.url === 'about:docs' ? (
          <div className="w-full h-full p-8 bg-[#0f172a] text-gray-100 overflow-y-auto">
            <h1 className="text-2xl font-bold text-cyan-400 mb-3">AetherOS Browser Guide</h1>
            <p className="text-gray-300 mb-4 leading-relaxed">
              AetherOS is a web-based operating system running securely within your browser sandbox.
            </p>
            <div className="bg-[#1e293b] p-4 rounded-lg border border-gray-700 space-y-2 text-sm">
              <h2 className="font-semibold text-white">Browser Security & Embedding:</h2>
              <p className="text-gray-300">
                Major sites (such as Google, GitHub, or YouTube) send <code className="text-cyan-300">X-Frame-Options: SAMEORIGIN</code> headers to prevent iframe clickjacking.
              </p>
              <p className="text-gray-300">
                When a site cannot be rendered inside the virtual window, click the <ExternalLink className="w-3.5 h-3.5 inline text-cyan-400 mx-1" /> icon to open it in a real browser tab.
              </p>
            </div>
          </div>
        ) : (
          <>
            {loadError && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-amber-900/90 text-amber-200 border border-amber-600 px-3 py-1.5 rounded text-xs flex items-center gap-2 shadow-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Failed to embed page inside frame (X-Frame-Options or network restriction).</span>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={activeTab.url}
              title={activeTab.title}
              sandbox="allow-scripts allow-forms allow-popups"
              onError={() => setLoadError(true)}
              className="w-full h-full border-none"
            />
            {/* Friendly frame restriction overlay button */}
            <div className="absolute bottom-3 right-3 bg-gray-900/90 backdrop-blur border border-gray-700 px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-gray-200">
              <span>Site not loading?</span>
              <a
                href={activeTab.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
              >
                Open in Host Tab <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

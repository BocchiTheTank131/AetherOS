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

const START_PAGE = 'about:start';

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
    { id: 'tab-1', title: 'Start Page', url: START_PAGE },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('');
  const [startQuery, setStartQuery] = useState('');
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNavigate = (targetUrl: string) => {
    let finalUrl = targetUrl.trim();
    if (!finalUrl) return;
    if (finalUrl !== START_PAGE && finalUrl !== 'about:docs' && !/^https?:\/\//i.test(finalUrl)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(finalUrl)}`;
      }
    }

    const title = finalUrl === START_PAGE ? 'Start Page'
      : finalUrl === 'about:docs' ? 'AetherOS Docs' : finalUrl.replace(/^https?:\/\//i, '');
    setUrlInput(finalUrl === START_PAGE ? '' : finalUrl);
    setLoadError(false);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? { ...t, url: finalUrl, title }
          : t
      )
    );
    setTitle?.(finalUrl === START_PAGE ? 'Web Browser' : `${title} · Web Browser`);
  };

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    const newTab: BrowserTab = { id, title: 'Start Page', url: START_PAGE };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
    setUrlInput('');
    setTitle?.('Web Browser');
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
      setUrlInput(remaining[0].url === START_PAGE ? '' : remaining[0].url);
      setTitle?.(remaining[0].url === START_PAGE ? 'Web Browser' : `${remaining[0].title} · Web Browser`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-raised text-ink text-sm overflow-hidden select-none">
      {/* Tabs Bar */}
      <div className="app-tabbar" role="group" aria-label="Browser tabs">
        {tabs.map((tab) => (
          <div key={tab.id} className="app-tab" data-active={tab.id === activeTabId}>
            <button type="button" aria-pressed={tab.id === activeTabId} onClick={() => {
              setActiveTabId(tab.id);
              setUrlInput(tab.url === START_PAGE ? '' : tab.url);
              setTitle?.(tab.url === START_PAGE ? 'Web Browser' : `${tab.title} · Web Browser`);
            }}>
            <Globe size={15} className="text-accent" />
              <span>{tab.title}</span>
            </button>
            {tabs.length > 1 && (
              <button
                aria-label={`Close ${tab.title}`}
                onClick={(e) => closeTab(tab.id, e)}
                className="hover:bg-danger/20 hover:text-danger rounded p-0.5 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="app-tab-new text-muted"
          title="New Tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Toolbar */}
      <div className="browser-toolbar">
        <div className="flex items-center gap-1 text-muted">
          <button
            onClick={() => {
              setLoadError(false);
              const iframe = iframeRef.current;
              if (iframe) iframe.src = activeTab.url;
            }}
            disabled={!/^https?:/i.test(activeTab.url)}
            className="p-1.5 hover:bg-hover rounded"
            title="Reload"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleNavigate(START_PAGE)}
            className="p-1.5 hover:bg-hover rounded"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Address Bar */}
        <div className="browser-address">
          <Shield className="w-3.5 h-3.5 text-positive" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(urlInput);
            }}
            aria-label="Web address" className="bg-transparent text-ink"
            placeholder="Search or enter web address..."
          />
          <button
            onClick={() => handleNavigate(urlInput)}
            aria-label="Navigate" className="text-muted hover:text-accent"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Open in Host Tab */}
        {/^https?:/i.test(activeTab.url) && <a
          href={activeTab.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-muted hover:text-ink hover:bg-hover rounded"
          title="Open in new browser tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>}
      </div>

      {/* Bookmarks Bar */}
      <div className="browser-bookmarks flex items-center gap-3 px-3 py-1.5 bg-side border-b border-line text-xs text-secondary">
        <Bookmark className="w-3 h-3 text-accent" />
        {DEFAULT_BOOKMARKS.map((b) => (
          <button
            key={b.url}
            onClick={() => handleNavigate(b.url)}
            className="hover:text-accent transition-colors truncate max-w-[140px]"
          >
            {b.title}
          </button>
        ))}
      </div>

      {/* Viewport / Frame */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {activeTab.url === START_PAGE ? (
          <section className="browser-start">
            <div className="browser-start-content">
              <div className="browser-start-icon"><Globe size={27} /></div>
              <h1>Start Page</h1>
              <form className="browser-start-search" onSubmit={(event) => { event.preventDefault(); handleNavigate(startQuery); }}>
                <Search size={18} className="text-muted" />
                <input aria-label="Search the web" placeholder="Search the web or enter an address" value={startQuery} onChange={(event) => setStartQuery(event.target.value)} />
                <button className="ui-button primary" type="submit">Go</button>
              </form>
              <h2>Bookmarks</h2>
              <div className="browser-favorites">
                {DEFAULT_BOOKMARKS.map((bookmark) => <button key={bookmark.url} className="ui-card" onClick={() => handleNavigate(bookmark.url)}>
                  <Bookmark size={16} className="text-accent" /><span>{bookmark.title}</span>
                </button>)}
              </div>
            </div>
          </section>
        ) : activeTab.url === 'about:docs' ? (
          <div className="browser-guide"><div>
            <h1 className="mb-3">AetherOS Browser Guide</h1>
            <p className="text-secondary mb-4 leading-relaxed">
              AetherOS is a web-based operating system running securely within your browser sandbox.
            </p>
            <div className="bg-raised p-4 rounded-lg border border-line space-y-2 text-sm">
              <h2 className="font-semibold text-ink">Browser Security & Embedding:</h2>
              <p className="text-secondary">
                Major sites (such as Google, GitHub, or YouTube) send <code className="text-accent">X-Frame-Options: SAMEORIGIN</code> headers to prevent iframe clickjacking.
              </p>
              <p className="text-secondary">
                When a site cannot be rendered inside the virtual window, click the <ExternalLink className="w-3.5 h-3.5 inline text-accent mx-1" /> icon to open it in a real browser tab.
              </p>
            </div>
          </div></div>
        ) : (
          <>
            {loadError && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-caution/90 text-caution border border-amber-600 px-3 py-1.5 rounded text-xs flex items-center gap-2 shadow-lg">
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
            <div className="absolute bottom-3 right-3 bg-inset backdrop-blur border border-line px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-ink">
              <span>Site not loading?</span>
              <a
                href={activeTab.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1 font-semibold"
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

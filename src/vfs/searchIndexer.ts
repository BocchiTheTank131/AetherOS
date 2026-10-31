// AetherOS - Search Indexer Service
import { vfs } from './vfs';
import type { VFSEntry } from './types';

export interface SearchResult {
  title: string;
  subtitle: string;
  type: 'app' | 'file' | 'folder' | 'setting' | 'command';
  icon?: string;
  action: () => void;
  metadata?: Record<string, unknown>;
}

export class SearchIndexer {
  private indexedFiles: VFSEntry[] = [];
  private lastIndexed = 0;

  public buildIndex(): void {
    try {
      const all = vfs.getAllNodes();
      this.indexedFiles = all
        .filter((n) => !n.path.startsWith('/proc') && !n.path.startsWith('/dev'))
        .map((n) => ({
          name: n.name,
          path: n.path,
          type: n.type,
          size: n.size,
          modifiedAt: n.modifiedAt,
          mimeType: n.mimeType,
          permissions: n.permissions,
          owner: n.owner,
        }));
      this.lastIndexed = Date.now();
    } catch {
      // Ignore
    }
  }

  public async updateIndex(): Promise<void> {
    this.buildIndex();
  }

  public searchFiles(query: string, maxResults = 20): VFSEntry[] {
    if (!query.trim()) return [];
    if (this.indexedFiles.length === 0 || Date.now() - this.lastIndexed > 10000) {
      this.buildIndex();
    }

    const q = query.toLowerCase().trim();
    return this.indexedFiles
      .filter((file) => file.name.toLowerCase().includes(q) || file.path.toLowerCase().includes(q))
      .slice(0, maxResults);
  }
}

export const searchIndexer = new SearchIndexer();

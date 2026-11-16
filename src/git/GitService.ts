// AetherOS - Local Git Service Engine
import { Buffer } from 'buffer';
import { gitFsAdapter } from './GitFileSystemAdapter';
import { isWithin, withoutSymlinks } from '../vfs/safePath';
import { vfs } from '../vfs/vfs';
import { computeLineDiff, type FileDiffResult } from './GitDiff';

let engine: Promise<typeof import('isomorphic-git').default> | undefined;
function getGit() {
  if (typeof globalThis.Buffer === 'undefined') Object.defineProperty(globalThis, 'Buffer', { value: Buffer });
  return engine ??= import('isomorphic-git').then((module) => module.default);
}

function repoPath(root: string, file: string): string {
  const path = vfs.resolve(root, file);
  if (!isWithin(path, root) || path === root || isWithin(path, vfs.resolve(root, '.git'))) {
    throw new Error(`Path is outside the Git working tree: ${file}`);
  }
  return path.slice(root === '/' ? 1 : root.length + 1);
}

async function readIndexFile(dir: string, path: string): Promise<{ bytes: Uint8Array; mode: number } | undefined> {
  const git = await getGit();
  return await git.walk({
    fs: gitFsAdapter, dir, trees: [git.STAGE()],
    map: async (filepath, [entry]) => {
      if (filepath === path && entry && await entry.type() === 'blob') {
        const { blob } = await git.readBlob({ fs: gitFsAdapter, dir, oid: await entry.oid() });
        return { bytes: blob, mode: await entry.mode() };
      }
      if (filepath !== '.' && !path.startsWith(filepath + '/')) return null;
    },
    reduce: (value, children) => Promise.resolve(value ?? children.find(Boolean)),
  });
}

function textOf(bytes: Uint8Array): string | undefined {
  if (bytes.length > 512 * 1024 || bytes.includes(0)) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let lines = 0;
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
      if (++lines > 12_000) return undefined;
    }
    return text;
  }
  catch { return undefined; }
}

export interface GitFileStatus {
  filepath: string;
  staged: boolean;
  status: 'unmodified' | 'modified' | 'added' | 'deleted' | 'untracked';
}

export interface GitStatusSummary {
  branch: string;
  isClean: boolean;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export interface GitCommitRecord {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  parent: string[];
}

export class GitService {
  /**
   * Checks if a directory contains a valid initialized .git repository.
   */
  public async isRepo(dir: string): Promise<boolean> {
    const gitDir = `${vfs.normalizePath(dir)}/.git`;
    return vfs.exists(gitDir);
  }

  /**
   * Initializes a new Git repository in the specified directory.
   */
  public async init(dir: string, defaultBranch = 'main'): Promise<void> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    if (!vfs.exists(norm)) {
      vfs.mkdir(norm, { recursive: true });
    }
    await git.init({
      fs: gitFsAdapter,
      dir: norm,
      defaultBranch,
    });
  }

  /**
   * Returns current branch name or 'HEAD (detached)'
   */
  public async currentBranch(dir: string): Promise<string> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    try {
      const branch = await git.currentBranch({
        fs: gitFsAdapter,
        dir: norm,
        fullname: false,
      });
      if (branch) return branch;
      const head = vfs.exists(norm + '/.git/HEAD') ? vfs.readText(norm + '/.git/HEAD').trim() : '';
      return head.startsWith('ref: refs/heads/') ? head.slice(16) : 'HEAD (detached)';
    } catch {
      return 'main';
    }
  }

  /**
   * Computes status matrix for files in the repository.
   */
  public async status(dir: string): Promise<GitStatusSummary> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    const branch = await this.currentBranch(norm);

    if (!(await this.isRepo(norm))) {
      throw new Error(`fatal: not a git repository (or any of the parent directories): ${dir}`);
    }

    const matrix = await git.statusMatrix({
      fs: gitFsAdapter,
      dir: norm,
      filter: (f) => !f.startsWith('.git/'),
    });

    const staged: GitFileStatus[] = [];
    const unstaged: GitFileStatus[] = [];
    const untracked: GitFileStatus[] = [];

    for (const [filepath, head, workdir, stage] of matrix) {
      if (head === 0 && workdir !== 0 && stage === 0) {
        untracked.push({ filepath, staged: false, status: 'untracked' });
        continue;
      }
      if (head !== stage) {
        staged.push({ filepath, staged: true, status: stage === 0 ? 'deleted' : head === 0 ? 'added' : 'modified' });
      }
      if (workdir !== stage) {
        unstaged.push({ filepath, staged: false, status: workdir === 0 ? 'deleted' : stage === 0 ? 'added' : 'modified' });
      }
    }

    const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

    return {
      branch,
      isClean,
      staged,
      unstaged,
      untracked,
    };
  }

  /**
   * Stages file(s) into git index.
   */
  public async add(dir: string, filepath: string | string[]): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const git = await getGit();
    const inputs = Array.isArray(filepath) ? filepath : [filepath];
    const summary = await this.status(norm);
    const changes = [...summary.untracked, ...summary.unstaged];
    const targets = new Set<string>();
    for (const input of inputs) {
      const path = vfs.resolve(norm, input);
      if (path === norm) {
        for (const change of changes) targets.add(change.filepath);
      } else {
        const relative = repoPath(norm, input);
        if (vfs.exists(path) && vfs.lstat(path).isDirectory()) {
          for (const change of changes) if (isWithin(change.filepath, relative)) targets.add(change.filepath);
        } else targets.add(relative);
      }
    }
    for (const file of targets) {
      if (vfs.exists(vfs.resolve(norm, file))) await git.add({ fs: gitFsAdapter, dir: norm, filepath: file });
      else if (changes.some((change) => change.filepath === file && change.status === 'deleted')) {
        await git.remove({ fs: gitFsAdapter, dir: norm, filepath: file });
      } else throw new Error(`Pathspec did not match a working file: ${file}`);
    }
  }

  public async remove(dir: string, filepath: string): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const git = await getGit();
    await git.remove({ fs: gitFsAdapter, dir: norm, filepath: repoPath(norm, filepath) });
  }

  public async unstage(dir: string, file: string): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const path = repoPath(norm, file);
    const git = await getGit();
    const head = await git.resolveRef({ fs: gitFsAdapter, dir: norm, ref: 'HEAD' }).catch(() => undefined);
    if (head) await git.resetIndex({ fs: gitFsAdapter, dir: norm, filepath: path });
    else await git.remove({ fs: gitFsAdapter, dir: norm, filepath: path });
  }

  /**
   * Commits staged changes.
   */
  public async commit(
    dir: string,
    message: string,
    author = { name: 'Aether Developer', email: 'dev@aetheros.internal' }
  ): Promise<string> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    return await git.commit({
      fs: gitFsAdapter,
      dir: norm,
      message,
      author,
    });
  }

  /**
   * Retrieves commit history log.
   */
  public async log(dir: string, depth = 20): Promise<GitCommitRecord[]> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    try {
      const commits = await git.log({
        fs: gitFsAdapter,
        dir: norm,
        depth,
      });

      return commits.map((c) => ({
        oid: c.oid,
        message: c.commit.message,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
          timestamp: c.commit.author.timestamp,
          timezoneOffset: c.commit.author.timezoneOffset,
        },
        parent: c.commit.parent || [],
      }));
    } catch (error) {
      if ((error as { code?: string }).code === 'NotFoundError') return [];
      throw error;
    }
  }

  /**
   * Computes diff between HEAD and working directory.
   */
  public async diff(dir: string, targetFile?: string, mode: 'combined' | 'staged' | 'unstaged' = 'combined'): Promise<FileDiffResult[]> {
    const norm = vfs.normalizePath(dir);
    const git = await getGit();
    const summary = await this.status(norm);
    const candidates = mode === 'staged' ? summary.staged :
      mode === 'unstaged' ? [...summary.unstaged, ...summary.untracked] :
      [...summary.staged, ...summary.unstaged, ...summary.untracked];
    const paths = targetFile ? [repoPath(norm, targetFile)] : [...new Set(candidates.map((file) => file.filepath))];
    const commit = mode === 'unstaged' ? undefined :
      await git.resolveRef({ fs: gitFsAdapter, dir: norm, ref: 'HEAD' }).catch(() => undefined);
    const empty = new Uint8Array();
    const results: FileDiffResult[] = [];
    for (const filepath of paths) {
      const abs = vfs.resolve(norm, filepath);
      const index = mode === 'combined' ? undefined : await readIndexFile(norm, filepath);
      const head = commit ? await git.readBlob({ fs: gitFsAdapter, dir: norm, oid: commit, filepath })
        .then(({ blob }) => blob).catch((error: { code?: string }) => {
          if (error.code !== 'NotFoundError') throw error;
          return empty;
        }) : empty;
      const worktree = mode === 'staged' || !vfs.exists(abs) ? empty :
        vfs.lstat(abs).isSymbolicLink() ? new TextEncoder().encode(vfs.readlink(abs)) : vfs.readBytes(abs);
      const before = mode === 'unstaged' ? index?.bytes ?? empty : head;
      const after = mode === 'staged' ? index?.bytes ?? empty : worktree;
      if (before.length === after.length && before.every((byte, i) => after[i] === byte)) continue;
      const oldText = textOf(before);
      const newText = textOf(after);
      if (oldText === undefined || newText === undefined) {
        const isBinary = before.includes(0) || after.includes(0) || vfs.getNodeRaw(abs)?.isBinary === true;
        results.push({ filepath, additions: 0, deletions: 0, lines: [], isBinary,
          patch: `${isBinary ? 'Binary file' : 'Large or non-UTF-8 file'} ${filepath} differs (${before.length} → ${after.length} bytes)\n` });
      } else results.push(computeLineDiff(filepath, oldText, newText));
    }
    return results;
  }

  /**
   * Creates a new branch.
   */
  public async branch(dir: string, name: string): Promise<void> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    await git.branch({
      fs: gitFsAdapter,
      dir: norm,
      ref: name,
    });
  }

  /**
   * Lists all local branches.
   */
  public async listBranches(dir: string): Promise<string[]> {
    const git = await getGit();
    const norm = vfs.normalizePath(dir);
    return await git.listBranches({
      fs: gitFsAdapter,
      dir: norm,
    });
  }

  /**
   * Switches to branch or ref.
   */
  public async checkout(dir: string, ref: string): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const summary = await this.status(norm);
    if (summary.branch === ref) return;
    if (summary.staged.length || summary.unstaged.length) {
      throw new Error('Commit or restore tracked changes before switching branches');
    }
    await (await getGit()).checkout({
      fs: gitFsAdapter,
      dir: norm,
      ref,
    });
  }

  /**
   * Restores a working file to HEAD.
   */
  public async restore(dir: string, filepath: string): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const relative = repoPath(norm, filepath);
    const path = vfs.resolve(norm, relative);
    withoutSymlinks(path.slice(0, path.lastIndexOf('/')) || '/');
    const index = await readIndexFile(norm, relative);
    if (!index) throw new Error(`Path is not in the index: ${relative}`);
    vfs.atomicBatch(() => {
      if (vfs.exists(path)) vfs.unlink(path);
      vfs.mkdir(path.slice(0, path.lastIndexOf('/')) || '/', { recursive: true });
      if (index.mode === 0o120000) vfs.symlink(new TextDecoder().decode(index.bytes), path);
      else vfs.writeBytesSync(path, index.bytes, { permissions: index.mode & 0o777 });
    });
  }
}

export const gitService = new GitService();

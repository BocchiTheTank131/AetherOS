// AetherOS - Local Git Service Engine
import git from 'isomorphic-git';
import { gitFsAdapter } from './GitFileSystemAdapter';
import { vfs } from '../vfs/vfs';
import { computeLineDiff, type FileDiffResult } from './GitDiff';

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
    const norm = vfs.normalizePath(dir);
    try {
      const branch = await git.currentBranch({
        fs: gitFsAdapter,
        dir: norm,
        fullname: false,
      });
      return branch || 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Computes status matrix for files in the repository.
   */
  public async status(dir: string): Promise<GitStatusSummary> {
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
      // Clean unmodified: [1, 1, 1]
      if (head === 1 && workdir === 1 && stage === 1) {
        continue;
      }

      // Untracked: [0, 2, 0]
      if (head === 0 && workdir === 2 && stage === 0) {
        untracked.push({ filepath, staged: false, status: 'untracked' });
        continue;
      }

      // Staged added: [0, 2, 2]
      if (head === 0 && workdir === 2 && stage === 2) {
        staged.push({ filepath, staged: true, status: 'added' });
        continue;
      }

      // Staged deleted: [1, 0, 0]
      if (head === 1 && workdir === 0 && stage === 0) {
        staged.push({ filepath, staged: true, status: 'deleted' });
        continue;
      }

      // Unstaged deleted in working tree: [1, 0, 1]
      if (head === 1 && workdir === 0 && stage === 1) {
        unstaged.push({ filepath, staged: false, status: 'deleted' });
        continue;
      }

      // Modified in working tree (unstaged): [1, 2, 1]
      if (head === 1 && workdir === 2 && stage === 1) {
        unstaged.push({ filepath, staged: false, status: 'modified' });
        continue;
      }

      // Staged modified: [1, 2, 2]
      if (head === 1 && workdir === 2 && stage === 2) {
        staged.push({ filepath, staged: true, status: 'modified' });
        continue;
      }

      // Staged but also modified in workdir: [1, 2, 3]
      if (head === 1 && workdir === 2 && stage === 3) {
        staged.push({ filepath, staged: true, status: 'modified' });
        unstaged.push({ filepath, staged: false, status: 'modified' });
        continue;
      }

      // Fallback
      if (stage > 0) {
        staged.push({ filepath, staged: true, status: 'modified' });
      } else {
        unstaged.push({ filepath, staged: false, status: 'modified' });
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
    const files = Array.isArray(filepath) ? filepath : [filepath];

    if (files.includes('.')) {
      const summary = await this.status(norm);
      const toAdd = [
        ...summary.untracked.map((u) => u.filepath),
        ...summary.unstaged.map((u) => u.filepath),
      ];
      for (const f of toAdd) {
        await git.add({ fs: gitFsAdapter, dir: norm, filepath: f });
      }
      return;
    }

    for (const f of files) {
      const cleanPath = f.replace(norm, '').replace(/^\/+/, '');
      await git.add({ fs: gitFsAdapter, dir: norm, filepath: cleanPath });
    }
  }

  /**
   * Stages removal of a file.
   */
  public async remove(dir: string, filepath: string): Promise<void> {
    const norm = vfs.normalizePath(dir);
    const cleanPath = filepath.replace(norm, '').replace(/^\/+/, '');
    await git.remove({ fs: gitFsAdapter, dir: norm, filepath: cleanPath });
  }

  /**
   * Commits staged changes.
   */
  public async commit(
    dir: string,
    message: string,
    author = { name: 'Aether Developer', email: 'dev@aetheros.internal' }
  ): Promise<string> {
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
    } catch {
      return [];
    }
  }

  /**
   * Computes diff between HEAD and working directory.
   */
  public async diff(dir: string, targetFile?: string): Promise<FileDiffResult[]> {
    const norm = vfs.normalizePath(dir);
    const summary = await this.status(norm);
    const candidateFiles = new Set<string>();

    if (targetFile) {
      candidateFiles.add(targetFile.replace(norm, '').replace(/^\/+/, ''));
    } else {
      for (const s of summary.staged) candidateFiles.add(s.filepath);
      for (const u of summary.unstaged) candidateFiles.add(u.filepath);
      for (const t of summary.untracked) candidateFiles.add(t.filepath);
    }

    const results: FileDiffResult[] = [];

    for (const relPath of candidateFiles) {
      const absPath = `${norm}/${relPath}`;
      let oldText = '';
      let newText = '';

      // Try reading HEAD version
      try {
        const commitOid = await git.resolveRef({ fs: gitFsAdapter, dir: norm, ref: 'HEAD' });
        const { blob } = await git.readBlob({
          fs: gitFsAdapter,
          dir: norm,
          oid: commitOid,
          filepath: relPath,
        });
        oldText = new TextDecoder().decode(blob);
      } catch {
        // File does not exist in HEAD (e.g. newly added or untracked)
        oldText = '';
      }

      // Read current working directory version
      try {
        if (vfs.exists(absPath)) {
          newText = vfs.readFile(absPath);
        }
      } catch {
        newText = '';
      }

      results.push(computeLineDiff(relPath, oldText, newText));
    }

    return results;
  }

  /**
   * Creates a new branch.
   */
  public async branch(dir: string, name: string): Promise<void> {
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
    await git.checkout({
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
    const cleanPath = filepath.replace(norm, '').replace(/^\/+/, '');
    await git.checkout({
      fs: gitFsAdapter,
      dir: norm,
      filepaths: [cleanPath],
      force: true,
    });
  }
}

export const gitService = new GitService();

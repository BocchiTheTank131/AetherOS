// AetherOS - Developer Project Manager
import { vfs } from '../vfs/vfs';
import { gitService } from '../git/GitService';
import type { ProjectConfig, ProjectInfo } from './types';

export class ProjectManager {
  public static readonly PROJECTS_DIR = '/home/aether/Projects';

  /**
   * Scans a directory to determine project metadata and language.
   */
  public async getProjectInfo(dir: string): Promise<ProjectInfo> {
    const norm = vfs.normalizePath(dir);
    const name = norm.split('/').pop() || 'project';
    const hasGit = await gitService.isRepo(norm);
    const hasManifest = vfs.exists(`${norm}/manifest.json`);
    const hasTsConfig = vfs.exists(`${norm}/tsconfig.json`);

    let language: 'typescript' | 'javascript' | 'python' | 'html' = 'javascript';
    let config: ProjectConfig | undefined;

    // Check aether.json
    const aetherConfigPath = `${norm}/aether.json`;
    if (vfs.exists(aetherConfigPath)) {
      try {
        config = JSON.parse(vfs.readFile(aetherConfigPath));
        if (config?.language) language = config.language;
      } catch {}
    } else if (hasTsConfig || vfs.exists(`${norm}/src/main.ts`) || vfs.exists(`${norm}/main.ts`)) {
      language = 'typescript';
    } else if (vfs.exists(`${norm}/main.py`) || vfs.exists(`${norm}/app.py`)) {
      language = 'python';
    } else if (vfs.exists(`${norm}/index.html`)) {
      language = 'html';
    }

    return {
      rootPath: norm,
      name: config?.name || name,
      language,
      hasGit,
      hasManifest,
      hasTsConfig,
      config,
    };
  }

  /**
   * Lists all existing projects in /home/aether/Projects.
   */
  public async listProjects(): Promise<ProjectInfo[]> {
    if (!vfs.exists(ProjectManager.PROJECTS_DIR)) {
      vfs.mkdir(ProjectManager.PROJECTS_DIR, { recursive: true });
      return [];
    }

    const entries = vfs.readdir(ProjectManager.PROJECTS_DIR);
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (entry.type === 'dir') {
        try {
          const info = await this.getProjectInfo(entry.path);
          projects.push(info);
        } catch {}
      }
    }

    return projects;
  }
}

export const projectManager = new ProjectManager();

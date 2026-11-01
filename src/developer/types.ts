// AetherOS - Developer Subsystem Types

export interface ProjectConfig {
  name: string;
  version: string;
  language: 'typescript' | 'javascript' | 'python' | 'html';
  entry?: string;
  outputDir?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export interface TaskDefinition {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface TaskExecution {
  taskId: string;
  pid: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  exitCode?: number;
  output: string[];
}

export interface ProjectInfo {
  rootPath: string;
  name: string;
  language: 'typescript' | 'javascript' | 'python' | 'html';
  hasGit: boolean;
  hasManifest: boolean;
  hasTsConfig: boolean;
  config?: ProjectConfig;
}

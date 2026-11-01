// AetherOS - Application Platform Registry
import React from 'react';
import type { AppDefinition, AppProps } from './types';
import { TerminalApp } from './terminal/TerminalApp';
import { FileManagerApp } from './fileManager/FileManagerApp';
import { TextEditorApp } from './textEditor/TextEditorApp';
import { CodeStudioApp } from './codeStudio/CodeStudioApp';
import { WebBrowserApp } from './webBrowser/WebBrowserApp';
import { SettingsApp } from './settings/SettingsApp';
import { SystemMonitorApp } from './systemMonitor/SystemMonitorApp';
import { SoftwareCenterApp } from './softwareCenter/SoftwareCenterApp';
import { CalculatorApp } from './calculator/CalculatorApp';
import { MediaPlayerApp } from './mediaPlayer/MediaPlayerApp';
import { ImageViewerApp } from './imageViewer/ImageViewerApp';
import { NotesApp } from './notes/NotesApp';
import { DocumentViewerApp } from './documentViewer/DocumentViewerApp';
import { LogViewerApp } from './logViewer/LogViewerApp';
import { MinesweeperApp } from './games/MinesweeperApp';
import { Game2048App } from './games/Game2048App';
import { PaintApp } from './paint/PaintApp';
import { WeatherApp } from './weather/WeatherApp';
import { AudioRecorderApp } from './audioRecorder/AudioRecorderApp';
import { packageManager } from '../pkg/packageManager';
import { dynamicAppRegistry, type InstalledAppRecord } from '../appPlatform/DynamicAppRegistry';
import { AppHost } from '../appPlatform/AppHost';

export class AppRegistry {
  private apps = new Map<string, AppDefinition>();

  constructor() {
    this.registerCoreApps();
  }

  private registerCoreApps() {
    const list: AppDefinition[] = [
      {
        id: 'terminal',
        name: 'Terminal',
        icon: 'Terminal',
        category: 'System',
        description: 'Advanced Linux-like aesh command shell',
        component: TerminalApp,
        defaultWidth: 780,
        defaultHeight: 500,
        minWidth: 420,
        minHeight: 280,
        executable: '/bin/aesh',
      },
      {
        id: 'file-manager',
        name: 'Files',
        icon: 'Folder',
        category: 'System',
        description: 'Explore and manage files, folders, and archives',
        component: FileManagerApp,
        defaultWidth: 840,
        defaultHeight: 520,
        minWidth: 500,
        minHeight: 320,
        executable: '/usr/bin/aether-fm',
      },
      {
        id: 'text-editor',
        name: 'Text Editor',
        icon: 'FileText',
        category: 'Accessories',
        description: 'Edit plain text, markdown, and config files',
        component: TextEditorApp,
        defaultWidth: 740,
        defaultHeight: 500,
        minWidth: 400,
        minHeight: 280,
        executable: '/usr/bin/gedit',
      },
      {
        id: 'code-studio',
        name: 'Code Studio',
        icon: 'Code2',
        category: 'Development',
        description: 'Multi-file web IDE with live sandbox preview',
        component: CodeStudioApp,
        defaultWidth: 920,
        defaultHeight: 600,
        minWidth: 600,
        minHeight: 380,
        executable: '/usr/bin/code',
      },
      {
        id: 'web-browser',
        name: 'Web Browser',
        icon: 'Globe',
        category: 'Internet',
        description: 'Browse the web and local documentation',
        component: WebBrowserApp,
        defaultWidth: 900,
        defaultHeight: 580,
        minWidth: 500,
        minHeight: 350,
        executable: '/usr/bin/browser',
      },
      {
        id: 'settings',
        name: 'Settings',
        icon: 'Settings',
        category: 'System',
        description: 'Customize desktop theme, wallpapers, and accounts',
        component: SettingsApp,
        defaultWidth: 760,
        defaultHeight: 520,
        minWidth: 500,
        minHeight: 350,
        singleton: true,
        executable: '/usr/bin/settings',
      },
      {
        id: 'system-monitor',
        name: 'System Monitor',
        icon: 'Activity',
        category: 'System',
        description: 'Inspect processes, CPU, memory, and services',
        component: SystemMonitorApp,
        defaultWidth: 720,
        defaultHeight: 480,
        minWidth: 460,
        minHeight: 300,
        singleton: true,
        executable: '/usr/bin/top',
      },
      {
        id: 'software-center',
        name: 'Software Center',
        icon: 'Package',
        category: 'System',
        description: 'Discover and install applications via aetherpkg',
        component: SoftwareCenterApp,
        defaultWidth: 820,
        defaultHeight: 540,
        minWidth: 520,
        minHeight: 340,
        singleton: true,
        executable: '/usr/bin/software-center',
      },
      {
        id: 'calculator',
        name: 'Calculator',
        icon: 'Calculator',
        category: 'Accessories',
        description: 'Standard and scientific calculation utility',
        component: CalculatorApp,
        defaultWidth: 340,
        defaultHeight: 460,
        minWidth: 300,
        minHeight: 400,
        executable: '/usr/bin/calc',
      },
      {
        id: 'media-player',
        name: 'Media Player',
        icon: 'PlayCircle',
        category: 'Media',
        description: 'Audio and video playback with synthesizer',
        component: MediaPlayerApp,
        defaultWidth: 420,
        defaultHeight: 480,
        minWidth: 360,
        minHeight: 400,
        executable: '/usr/bin/player',
      },
      {
        id: 'image-viewer',
        name: 'Image Viewer',
        icon: 'Image',
        category: 'Media',
        description: 'Inspect images, graphics, and vector artworks',
        component: ImageViewerApp,
        defaultWidth: 640,
        defaultHeight: 480,
        minWidth: 400,
        minHeight: 300,
        executable: '/usr/bin/eog',
      },
      {
        id: 'notes',
        name: 'Notes',
        icon: 'StickyNote',
        category: 'Accessories',
        description: 'Quick notes, categories, and checklist tasks',
        component: NotesApp,
        defaultWidth: 680,
        defaultHeight: 460,
        minWidth: 440,
        minHeight: 300,
        executable: '/usr/bin/notes',
      },
      {
        id: 'document-viewer',
        name: 'Document Viewer',
        icon: 'BookOpen',
        category: 'Accessories',
        description: 'Rich markdown and documentation reader',
        component: DocumentViewerApp,
        defaultWidth: 700,
        defaultHeight: 500,
        minWidth: 420,
        minHeight: 300,
        executable: '/usr/bin/evince',
      },
      {
        id: 'log-viewer',
        name: 'Logs',
        icon: 'ScrollText',
        category: 'System',
        description: 'Systemd journal & kernel dmesg ring buffer logs',
        component: LogViewerApp,
        defaultWidth: 740,
        defaultHeight: 480,
        minWidth: 480,
        minHeight: 300,
        executable: '/usr/bin/journalctl',
      },
      // Installed & installable packages
      {
        id: 'minesweeper',
        name: 'Minesweeper',
        icon: 'Bomb',
        category: 'Games',
        description: 'Classic puzzle game of logic and deduction',
        component: MinesweeperApp,
        defaultWidth: 360,
        defaultHeight: 440,
        minWidth: 320,
        minHeight: 400,
        executable: '/usr/games/minesweeper',
      },
      {
        id: 'game2048',
        name: '2048',
        icon: 'Grid',
        category: 'Games',
        description: 'Slide and merge tiles to reach 2048',
        component: Game2048App,
        defaultWidth: 360,
        defaultHeight: 460,
        minWidth: 320,
        minHeight: 420,
        executable: '/usr/games/2048',
      },
      {
        id: 'paint',
        name: 'Paint Studio',
        icon: 'Palette',
        category: 'Media',
        description: 'Canvas sketcher, drawing, and export to PNG',
        component: PaintApp,
        defaultWidth: 740,
        defaultHeight: 500,
        minWidth: 480,
        minHeight: 320,
        executable: '/usr/bin/paint',
      },
      {
        id: 'weather',
        name: 'Meteor Weather',
        icon: 'CloudRain',
        category: 'Utilities',
        description: 'Live atmospheric conditions and forecasts',
        component: WeatherApp,
        defaultWidth: 400,
        defaultHeight: 480,
        minWidth: 340,
        minHeight: 400,
        executable: '/usr/bin/weather',
      },
      {
        id: 'audio-recorder',
        name: 'Sound Studio',
        icon: 'Mic',
        category: 'Media',
        description: 'Record voice memos directly to /home/aether/Music',
        component: AudioRecorderApp,
        defaultWidth: 440,
        defaultHeight: 460,
        minWidth: 360,
        minHeight: 400,
        executable: '/usr/bin/recorder',
      },
    ];

    for (const app of list) {
      this.apps.set(app.id, app);
    }
  }

  private createDynamicDef(rec: InstalledAppRecord): AppDefinition {
    return {
      id: rec.id,
      name: rec.name,
      icon: rec.icon || 'Package',
      category: 'Utilities',
      description: rec.description,
      component: (props: AppProps) => React.createElement(AppHost, { ...props, appId: rec.id }),
      defaultWidth: rec.manifest.window?.defaultWidth || 700,
      defaultHeight: rec.manifest.window?.defaultHeight || 480,
      minWidth: rec.manifest.window?.minWidth || 360,
      minHeight: rec.manifest.window?.minHeight || 280,
      isExternal: true,
      version: rec.version,
      author: rec.author,
      packageId: rec.packageId,
      executable: `${rec.installDir}/${rec.entry}`,
    };
  }

  public get(id: string): AppDefinition | undefined {
    if (this.apps.has(id)) {
      return this.apps.get(id);
    }
    const dyn = dynamicAppRegistry.get(id);
    if (dyn) {
      return this.createDynamicDef(dyn);
    }
    return undefined;
  }

  public getApp(id: string): AppDefinition | undefined {
    return this.get(id);
  }

  public getAll(): AppDefinition[] {
    const installed = packageManager.getInstalled().map((p) => p.appId);
    const builtIns = Array.from(this.apps.values()).filter((app) => {
      // Core built-in apps are always available
      if (
        [
          'terminal',
          'file-manager',
          'text-editor',
          'code-studio',
          'web-browser',
          'settings',
          'system-monitor',
          'software-center',
          'calculator',
          'media-player',
          'image-viewer',
          'notes',
          'document-viewer',
          'log-viewer',
        ].includes(app.id)
      ) {
        return true;
      }
      return installed.includes(app.id);
    });

    const dynamics = dynamicAppRegistry.getAll().map((rec) => this.createDynamicDef(rec));
    return [...builtIns, ...dynamics];
  }

  public getByCategory(category: string): AppDefinition[] {
    return this.getAll().filter((a) => a.category === category);
  }

  public subscribe(listener: () => void): () => void {
    return dynamicAppRegistry.subscribe(listener);
  }
}

export const appRegistry = new AppRegistry();

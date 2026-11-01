// AetherOS - Application Platform Permission Definitions
export type PermissionScope =
  | 'storage:appdata'
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network:fetch'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'notifications'
  | 'media:microphone'
  | 'media:camera'
  | 'audio:playback'
  | 'filepicker:open'
  | 'filepicker:save'
  | 'interapp:message';

export const VALID_PERMISSION_SCOPES: readonly PermissionScope[] = [
  'storage:appdata',
  'filesystem:read',
  'filesystem:write',
  'network:fetch',
  'clipboard:read',
  'clipboard:write',
  'notifications',
  'media:microphone',
  'media:camera',
  'audio:playback',
  'filepicker:open',
  'filepicker:save',
  'interapp:message',
] as const;

export type PermissionGrantState = 'granted' | 'denied' | 'prompt';

export interface PermissionDetails {
  scope: PermissionScope;
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export const PERMISSION_METADATA: Record<PermissionScope, PermissionDetails> = {
  'storage:appdata': {
    scope: 'storage:appdata',
    name: 'Application Data Storage',
    description: 'Store and retrieve private application settings and state.',
    risk: 'low',
  },
  'audio:playback': {
    scope: 'audio:playback',
    name: 'Audio Playback',
    description: 'Play synthesized or recorded audio sounds.',
    risk: 'low',
  },
  'notifications': {
    scope: 'notifications',
    name: 'System Notifications',
    description: 'Display desktop alerts and toast notifications.',
    risk: 'medium',
  },
  'filepicker:open': {
    scope: 'filepicker:open',
    name: 'Open File Dialog',
    description: 'Prompt user to select and open a specific file from AetherFS.',
    risk: 'medium',
  },
  'filepicker:save': {
    scope: 'filepicker:save',
    name: 'Save File Dialog',
    description: 'Prompt user to save an exported file into AetherFS.',
    risk: 'medium',
  },
  'filesystem:read': {
    scope: 'filesystem:read',
    name: 'Filesystem Read Access',
    description: 'Read files and directories across the virtual filesystem.',
    risk: 'high',
  },
  'filesystem:write': {
    scope: 'filesystem:write',
    name: 'Filesystem Write Access',
    description: 'Create, modify, and delete files across the virtual filesystem.',
    risk: 'high',
  },
  'network:fetch': {
    scope: 'network:fetch',
    name: 'Network Access',
    description: 'Make network HTTP requests to external web services.',
    risk: 'high',
  },
  'clipboard:read': {
    scope: 'clipboard:read',
    name: 'Clipboard Read',
    description: 'Read text and data from the operating system clipboard.',
    risk: 'high',
  },
  'clipboard:write': {
    scope: 'clipboard:write',
    name: 'Clipboard Write',
    description: 'Copy text and data to the operating system clipboard.',
    risk: 'medium',
  },
  'media:microphone': {
    scope: 'media:microphone',
    name: 'Microphone Access',
    description: 'Record audio through your device microphone.',
    risk: 'high',
  },
  'media:camera': {
    scope: 'media:camera',
    name: 'Camera Access',
    description: 'Capture video through your device camera.',
    risk: 'high',
  },
  'interapp:message': {
    scope: 'interapp:message',
    name: 'Inter-Application Messaging',
    description: 'Communicate with other running applications.',
    risk: 'medium',
  },
};

export interface AppPermissionGrants {
  [scope: string]: PermissionGrantState;
}

export interface AppPermissionRecord {
  appId: string;
  requestedScopes: PermissionScope[];
  grants: AppPermissionGrants;
  lastUsed?: Record<string, string>; // ISO timestamp
  updatedAt: string;
}

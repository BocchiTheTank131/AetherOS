// AetherOS - Package Manager (aetherpkg) Types

export interface AetherPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'Accessories' | 'Development' | 'Games' | 'Media' | 'Utilities' | 'System' | 'Internet';
  icon: string; // Lucide icon identifier or image/path
  sizeKb: number;
  permissions: string[];
  installed: boolean;
  appId: string;
  isExternal?: boolean;
  installDir?: string;
  source?: 'built-in' | 'repository' | 'local';
}

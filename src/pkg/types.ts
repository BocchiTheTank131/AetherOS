// AetherOS - Package Manager (aetherpkg) Types

export interface AetherPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'Accessories' | 'Development' | 'Games' | 'Media' | 'Utilities';
  icon: string; // Lucide icon identifier
  sizeKb: number;
  permissions: string[];
  installed: boolean;
  appId: string;
}

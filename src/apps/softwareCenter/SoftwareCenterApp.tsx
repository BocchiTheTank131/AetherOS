// AetherOS - Software Center (aetherpkg GUI Frontend)
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { packageManager } from '../../pkg/packageManager';
import type { AetherPackage } from '../../pkg/types';
import { useSystem } from '../../core/context';
import {
  Package,
  Search,
  Download,
  Trash2,
  Shield,
  Palette,
  CloudRain,
  Mic,
  Bomb,
  Grid,
} from 'lucide-react';

export const SoftwareCenterApp: React.FC<AppProps> = () => {
  const { addNotification } = useSystem();
  const [packages, setPackages] = useState<AetherPackage[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'explore' | 'installed'>('explore');
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);

  const loadPackages = () => {
    setPackages(packageManager.getAll());
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleInstall = async (pkg: AetherPackage) => {
    setBusyPackageId(pkg.id);
    await new Promise((r) => setTimeout(r, 600)); // realistic unpacking delay
    packageManager.install(pkg.id);
    loadPackages();
    setBusyPackageId(null);
    addNotification({
      title: 'Software Center',
      message: `${pkg.name} has been successfully installed.`,
      level: 'success',
    });
  };

  const handleRemove = async (pkg: AetherPackage) => {
    if (!confirm(`Are you sure you want to uninstall ${pkg.name}?`)) return;
    setBusyPackageId(pkg.id);
    await new Promise((r) => setTimeout(r, 400));
    packageManager.remove(pkg.id);
    loadPackages();
    setBusyPackageId(null);
    addNotification({
      title: 'Software Center',
      message: `${pkg.name} has been uninstalled.`,
      level: 'info',
    });
  };

  const getPackageIcon = (iconName: string) => {
    switch (iconName) {
      case 'Bomb':
        return <Bomb className="w-8 h-8 text-amber-400" />;
      case 'Grid':
        return <Grid className="w-8 h-8 text-indigo-400" />;
      case 'Palette':
        return <Palette className="w-8 h-8 text-pink-400" />;
      case 'CloudRain':
        return <CloudRain className="w-8 h-8 text-cyan-400" />;
      case 'Mic':
        return <Mic className="w-8 h-8 text-purple-400" />;
      default:
        return <Package className="w-8 h-8 text-blue-400" />;
    }
  };

  const categories = ['All', 'Games', 'Media', 'Utilities', 'Development'];

  const filteredPackages = packages.filter((p) => {
    if (activeTab === 'installed' && !p.installed) return false;
    if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#111827] text-gray-200 select-none overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 bg-[#1f2937] border-b border-gray-700/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-white text-sm">
            <Package className="w-5 h-5 text-cyan-400" />
            <span>Software Center</span>
          </div>

          <div className="flex bg-[#111827] rounded-lg p-0.5 border border-gray-700 text-xs">
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'explore' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Explore
            </button>
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'installed' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Installed ({packages.filter((p) => p.installed).length})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" />
          <input
            type="text"
            placeholder="Search software..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111827] border border-gray-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Categories Filter Strip */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#161f2e] border-b border-gray-700/60 text-xs overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                : 'text-gray-400 hover:bg-gray-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Package List Grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPackages.map((pkg) => {
            const isBusy = busyPackageId === pkg.id;
            return (
              <div
                key={pkg.id}
                className="bg-[#1e293b] border border-gray-700/70 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-gray-600 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-800/80 rounded-xl border border-gray-700/60">
                        {getPackageIcon(pkg.icon)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm leading-tight">{pkg.name}</h3>
                        <span className="text-[11px] text-gray-400 font-mono">
                          v{pkg.version} • {pkg.sizeKb} KB
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-300 border border-gray-700">
                      {pkg.category}
                    </span>
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed mb-3">
                    {pkg.description}
                  </p>

                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Permissions: {pkg.permissions.join(', ')}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-700/50 flex justify-end">
                  {pkg.installed ? (
                    <button
                      onClick={() => handleRemove(pkg)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs font-semibold border border-red-500/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'Removing...' : 'Uninstall'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(pkg)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'Installing...' : 'Install'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

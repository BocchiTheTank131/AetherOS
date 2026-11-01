// AetherOS - Software Center 2.0 (aetherpkg GUI Frontend)
import React, { useState, useEffect, useRef } from 'react';
import type { AppProps } from '../types';
import { packageManager } from '../../pkg/packageManager';
import type { AetherPackage } from '../../pkg/types';
import { useSystem } from '../../core/context';
import { systemEventBus } from '../../core/eventBus';
import { dialogService } from '../../core/dialog';
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
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export const SoftwareCenterApp: React.FC<AppProps> = () => {
  const { addNotification } = useSystem();
  const [packages, setPackages] = useState<AetherPackage[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'explore' | 'installed'>('explore');
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [installModal, setInstallModal] = useState<{
    visible: boolean;
    stage: string;
    isError?: boolean;
    errorMsg?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPackages = () => {
    setPackages(packageManager.getAll());
  };

  useEffect(() => {
    loadPackages();
    const unsub1 = systemEventBus.on('package:installed', () => loadPackages());
    const unsub2 = systemEventBus.on('package:removed', () => loadPackages());
    const unsub3 = systemEventBus.on('package:updated', () => loadPackages());
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  const handleInstall = async (pkg: AetherPackage) => {
    setBusyPackageId(pkg.id);
    const success = packageManager.install(pkg.id);
    loadPackages();
    setBusyPackageId(null);
    if (success) {
      addNotification({
        title: 'Software Center',
        message: `${pkg.name} (${pkg.version}) has been activated.`,
        level: 'success',
      });
    } else {
      addNotification({
        title: 'Software Center',
        message: `Failed to activate ${pkg.name}.`,
        level: 'error',
      });
    }
  };

  const handleRemove = async (pkg: AetherPackage) => {
    const isCore = [
      'terminal',
      'file-manager',
      'code-studio',
      'text-editor',
      'settings',
      'software-center',
    ].includes(pkg.appId);

    if (isCore) {
      dialogService.alert({
        title: 'Core Package Protected',
        message: `Cannot uninstall core system package: ${pkg.name}`,
        level: 'warning',
      });
      return;
    }

    const purge = await dialogService.confirm({
      title: 'Uninstall Package',
      message: `Do you want to completely purge user data and settings for "${pkg.name}"?\n\nSelect "Purge Data" to erase all associated app storage, or "Keep Data" to retain your files.`,
      confirmText: 'Purge Data',
      cancelText: 'Keep Data',
      danger: true,
    });

    setBusyPackageId(pkg.id);
    const res = await packageManager.uninstallPackage(pkg.id, { purgeData: purge });
    loadPackages();
    setBusyPackageId(null);

    if (res.success) {
      addNotification({
        title: 'Software Center',
        message: `${pkg.name} has been uninstalled.`,
        level: 'info',
      });
    } else {
      addNotification({
        title: 'Software Center',
        message: `Failed to uninstall ${pkg.name}: ${res.error}`,
        level: 'error',
      });
    }
  };

  // Upload and Install .aepkg archive from Host File Dialog
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInstallModal({
      visible: true,
      stage: 'Reading archive from device...',
    });

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);

        const res = await packageManager.installArchive(bytes, {
          source: 'local',
          onProgress: (stage) => {
            setInstallModal({
              visible: true,
              stage,
            });
          },
        });

        if (res.success) {
          setInstallModal({
            visible: true,
            stage: `Successfully installed ${res.packageId} (v${res.version})!`,
          });
          loadPackages();
          setTimeout(() => setInstallModal(null), 1800);
          addNotification({
            title: 'Package Installed',
            message: `${res.packageId} is now ready to use.`,
            level: 'success',
          });
        } else {
          setInstallModal({
            visible: true,
            stage: 'Installation failed',
            isError: true,
            errorMsg: res.error,
          });
        }
      } catch (err) {
        setInstallModal({
          visible: true,
          stage: 'Installation failed',
          isError: true,
          errorMsg: (err as Error).message,
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const getPackageIcon = (iconName: string) => {
    if (iconName && (iconName.startsWith('data:') || iconName.includes('/'))) {
      return <img src={iconName} className="w-8 h-8 object-contain rounded" alt="" />;
    }
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
        p.id.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#111827] text-gray-200 select-none overflow-hidden relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".aepkg,application/zip"
        className="hidden"
      />

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

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-xs text-cyan-300 font-medium transition-colors"
            title="Install package from local .aepkg archive file"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Install .aepkg File</span>
          </button>
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
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-300 border border-gray-700">
                        {pkg.category}
                      </span>
                      {pkg.isExternal && (
                        <span className="px-1.5 py-0.2 text-[9px] rounded font-medium bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                          External App
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed mb-3">
                    {pkg.description}
                  </p>

                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3">
                    <Shield className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="truncate">
                      Permissions: {pkg.permissions.length > 0 ? pkg.permissions.join(', ') : 'None requested'}
                    </span>
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
                      <span>{isBusy ? 'Processing...' : 'Uninstall'}</span>
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

      {/* Real Installation Progress Modal */}
      {installModal && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1f2937] border border-gray-700 rounded-xl p-5 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            {installModal.isError ? (
              <AlertTriangle className="w-10 h-10 text-red-400 mb-2" />
            ) : installModal.stage.includes('Successfully') ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
            ) : (
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-2" />
            )}

            <h3 className="font-bold text-white text-sm mb-1">
              {installModal.isError ? 'Installation Failed' : 'Package Installation'}
            </h3>

            <p className="text-xs text-gray-300 mb-3">{installModal.stage}</p>

            {installModal.errorMsg && (
              <p className="text-[11px] font-mono text-red-300 bg-red-950/60 p-2 rounded border border-red-800/40 text-left w-full mb-3 overflow-auto max-h-24">
                {installModal.errorMsg}
              </p>
            )}

            {installModal.isError && (
              <button
                onClick={() => setInstallModal(null)}
                className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-white"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

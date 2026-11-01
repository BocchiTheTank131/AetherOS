// AetherOS - System Monitor Application
import React, { useState, useEffect, useRef } from 'react';
import type { AppProps } from '../types';
import { virtualKernel } from '../../core/kernel';
import { performanceService, type PerformanceSample } from '../../core/performanceService';
import type { Process } from '../../core/types';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { Activity, Cpu, HardDrive, Server, XCircle, Search } from 'lucide-react';

export const SystemMonitorApp: React.FC<AppProps> = () => {
  const { closeWindow } = useSystem();
  const [activeTab, setActiveTab] = useState<'processes' | 'performance' | 'services'>('processes');
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [latestSample, setLatestSample] = useState<PerformanceSample | null>(null);

  // Performance history buffers
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(30).fill(0));
  const [memHistory, setMemHistory] = useState<number[]>(Array(30).fill(0));

  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const memCanvasRef = useRef<HTMLCanvasElement>(null);

  // Subscribe to Centralized Performance Monitoring Service
  useEffect(() => {
    const unsub = performanceService.subscribe((sample) => {
      setLatestSample(sample);
      setProcesses(virtualKernel.getProcesses());
      setCpuHistory((prev) => [...prev.slice(1), sample.cpuPercent]);
      setMemHistory((prev) => [...prev.slice(1), sample.memoryPercent]);
    }, { immediate: false });

    return () => unsub();
  }, []);

  // Render CPU Canvas Chart
  useEffect(() => {
    if (activeTab !== 'performance' || !cpuCanvasRef.current) return;
    const canvas = cpuCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw CPU Line
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = w / (cpuHistory.length - 1);
    cpuHistory.forEach((val, idx) => {
      const x = idx * step;
      const y = h - (val / 100) * (h - 10) - 5;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill gradient
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
    grad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }, [cpuHistory, activeTab]);

  // Render Memory Canvas Chart
  useEffect(() => {
    if (activeTab !== 'performance' || !memCanvasRef.current) return;
    const canvas = memCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw Mem Line
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = w / (memHistory.length - 1);
    memHistory.forEach((val, idx) => {
      const x = idx * step;
      const y = h - (val / 100) * (h - 10) - 5;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill gradient
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
    grad.addColorStop(1, 'rgba(168, 85, 247, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }, [memHistory, activeTab]);

  const handleKill = async () => {
    if (!selectedPid) return;
    const target = processes.find((p) => p.pid === selectedPid);
    if (!target) return;

    if (target.pid <= 2) {
      dialogService.alert({
        title: 'System Protection',
        message: 'Cannot terminate critical kernel process (PID ' + target.pid + ').',
        level: 'error',
      });
      return;
    }

    const confirmed = await dialogService.confirm({
      title: 'End Process',
      message: `Are you sure you want to terminate process "${target.name}" (PID ${target.pid})?`,
      confirmText: 'End Process',
      danger: true,
    });
    if (!confirmed) return;

    // Terminate process
    virtualKernel.kill(target.pid, 'SIGKILL');
    // If it corresponds to a window, close it
    if (target.windowId) {
      closeWindow(target.windowId);
    }
    setSelectedPid(null);
  };

  const filteredProcs = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.command.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const mem = latestSample
    ? {
        usedKb: latestSample.usedMemoryKb,
        totalKb: latestSample.totalMemoryKb,
        percent: latestSample.memoryPercent,
        source: latestSample.source,
      }
    : virtualKernel.getTotalMemoryUsage();
  const currentCpu = latestSample ? latestSample.cpuPercent : virtualKernel.getAverageCpuUsage();

  const services = [
    { name: 'vfs.service', desc: 'Virtual Filesystem & IndexedDB Engine', status: 'active' },
    { name: 'kernel.service', desc: 'AetherCore Process & Signal Manager', status: 'active' },
    { name: 'logger.service', desc: 'Structured System Journal & dmesg', status: 'active' },
    { name: 'audio.service', desc: 'Web Audio API Desktop Sound Synthesizer', status: 'active' },
    { name: 'aetherpkg.service', desc: 'Package Manager Database Daemon', status: 'active' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#111827] text-gray-200 text-xs select-none overflow-hidden">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1f2937] border-b border-gray-700/60">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('processes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'processes' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Processes</span>
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'performance' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Performance</span>
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'services' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Services</span>
          </button>
        </div>

        {activeTab === 'processes' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter processes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#111827] border border-gray-700 rounded-lg pl-7 pr-2 py-1 text-xs text-white outline-none w-36"
              />
            </div>
            {selectedPid && (
              <button
                onClick={handleKill}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>End Process</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Tab View */}
      <div className="flex-1 overflow-hidden">
        {/* PROCESSES VIEW */}
        {activeTab === 'processes' && (
          <div className="h-full flex flex-col">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-3 py-2 bg-[#161f2e] border-b border-gray-700 text-gray-400 font-semibold">
              <span className="col-span-4">Process Name</span>
              <span className="col-span-2">PID</span>
              <span className="col-span-2">User</span>
              <span className="col-span-2">CPU %</span>
              <span className="col-span-2">Memory</span>
            </div>

            {/* Table Rows */}
            <div className="flex-1 overflow-y-auto">
              {filteredProcs.map((proc) => {
                const isSelected = proc.pid === selectedPid;
                return (
                  <div
                    key={proc.pid}
                    onClick={() => setSelectedPid(proc.pid)}
                    className={`grid grid-cols-12 items-center px-3 py-2 border-b border-gray-800 cursor-pointer ${
                      isSelected ? 'bg-cyan-500/20 text-cyan-200' : 'hover:bg-gray-800/50 text-gray-300'
                    }`}
                  >
                    <div className="col-span-4 flex items-center gap-2 truncate">
                      <Activity className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="truncate font-medium">{proc.name}</span>
                    </div>
                    <span className="col-span-2 font-mono text-gray-400">{proc.pid}</span>
                    <span className="col-span-2 text-gray-400">{proc.user}</span>
                    <span className="col-span-2 font-mono text-cyan-400">{proc.cpuPercent}%</span>
                    <span className="col-span-2 font-mono text-purple-300">
                      {(proc.memoryKb / 1024).toFixed(1)} MB
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PERFORMANCE VIEW */}
        {activeTab === 'performance' && (
          <div className="h-full p-4 overflow-y-auto space-y-4">
            {/* CPU Card */}
            <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="font-semibold text-white">CPU Utilization</span>
                    <span className="text-[10px] text-gray-400 ml-2">(Active Virtual Workloads)</span>
                  </div>
                </div>
                <span className="font-mono text-lg font-bold text-cyan-400">{currentCpu}%</span>
              </div>
              <canvas
                ref={cpuCanvasRef}
                width={500}
                height={120}
                className="w-full h-28 bg-[#111827] rounded-lg border border-gray-800"
              />
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>30 seconds ago</span>
                <span>Current</span>
              </div>
            </div>

            {/* Memory Card */}
            <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="font-semibold text-white">Memory Consumption</span>
                    <span className="text-[10px] text-gray-400 ml-2">
                      ({mem.source === 'performance.memory' ? 'Host Browser JS Heap' : 'Virtual Allocations'})
                    </span>
                  </div>
                </div>
                <span className="font-mono text-lg font-bold text-purple-400">
                  {Math.round(mem.usedKb / 1024)} MB / {Math.round(mem.totalKb / 1024)} MB ({mem.percent}%)
                </span>
              </div>
              <canvas
                ref={memCanvasRef}
                width={500}
                height={120}
                className="w-full h-28 bg-[#111827] rounded-lg border border-gray-800"
              />
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>30 seconds ago</span>
                <span>Current</span>
              </div>
            </div>
          </div>
        )}

        {/* SERVICES VIEW */}
        {activeTab === 'services' && (
          <div className="h-full p-4 overflow-y-auto">
            <div className="bg-[#1f2937] rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-3 bg-[#161f2e] border-b border-gray-700 font-semibold text-gray-300">
                AetherCore Background Services
              </div>
              <div className="divide-y divide-gray-800">
                {services.map((s) => (
                  <div key={s.name} className="flex items-center justify-between p-3">
                    <div>
                      <h4 className="font-mono font-medium text-white">{s.name}</h4>
                      <p className="text-[11px] text-gray-400">{s.desc}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      active (running)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161f2e] border-t border-gray-700/60 text-[11px] text-gray-400">
        <div className="flex items-center gap-3">
          <span>Processes: {processes.length} total</span>
          <span>Workers: {latestSample?.activeWorkers ?? 0} active</span>
        </div>
        <span>Uptime: {virtualKernel.getFormattedUptime()}</span>
      </div>
    </div>
  );
};

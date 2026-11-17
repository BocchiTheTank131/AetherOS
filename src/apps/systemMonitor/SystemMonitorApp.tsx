// AetherOS - System Monitor Application
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type { AppProps } from '../types';
import { virtualKernel } from '../../core/kernel';
import { performanceService, type PerformanceSample } from '../../core/performanceService';
import type { Process } from '../../core/types';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { Activity, Cpu, HardDrive, Server, XCircle, Search } from 'lucide-react';

function PerformanceChart({ data, metric }: { data: number[]; metric: 'CPU' | 'Memory' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { colorMode, theme: { accentHex } } = useSystem();
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      const { clientWidth: width, clientHeight: height } = canvas;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.scale(ratio, ratio);
      const tint = getComputedStyle(canvas).color;
      ctx.strokeStyle = tint;
      ctx.globalAlpha = .16;
      for (const level of [0, .25, .5, .75, 1]) {
        const y = 7 + (height - 14) * level;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = 4 + (width - 8) * index / Math.max(1, data.length - 1);
        const y = height - 7 - (height - 14) * Math.max(0, Math.min(value, 100)) / 100;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineTo(width - 4, height - 7);
      ctx.lineTo(4, height - 7);
      ctx.fillStyle = tint;
      ctx.globalAlpha = .12;
      ctx.fill();
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    return () => resize.disconnect();
  }, [data, colorMode, accentHex]);
  return <canvas ref={canvasRef} className={`monitor-chart ${metric === 'CPU' ? 'text-accent' : 'text-iris'}`} aria-label={`${metric} usage over the last 30 seconds`} role="img" />;
}

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
    <div className="flex flex-col h-full bg-canvas text-ink text-xs select-none overflow-hidden">
      {/* Header Tabs */}
      <div className="monitor-toolbar">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('processes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'processes' ? 'bg-selection text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Processes</span>
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'performance' ? 'bg-selection text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Performance</span>
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'services' ? 'bg-selection text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Services</span>
          </button>
        </div>

        {activeTab === 'processes' && (
          <div className="flex items-center gap-2">
            <div className="monitor-search">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-muted" />
              <input
                type="text"
                placeholder="Filter processes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-canvas border border-line rounded-lg pl-7 pr-2 py-1 text-xs text-ink outline-none w-36"
              />
            </div>
            {selectedPid && (
              <button
                onClick={handleKill}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-on-action rounded-lg text-xs font-semibold"
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
            <div className="grid grid-cols-12 px-3 py-2 bg-side border-b border-line text-muted font-semibold">
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
                    className={`grid grid-cols-12 items-center px-3 py-2 border-b border-line cursor-pointer ${
                      isSelected ? 'bg-selection text-accent' : 'hover:bg-hover text-secondary'
                    }`}
                  >
                    <div className="col-span-4 flex items-center gap-2 truncate">
                      <Activity className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <span className="truncate font-medium">{proc.name}</span>
                    </div>
                    <span className="col-span-2 font-mono text-muted">{proc.pid}</span>
                    <span className="col-span-2 text-muted">{proc.user}</span>
                    <span className="col-span-2 font-mono text-accent">{proc.cpuPercent}%</span>
                    <span className="col-span-2 font-mono text-iris">
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
          <div className="monitor-graphs">
            <section className="ui-card monitor-graph">
              <header>
                <h2 className="flex items-center gap-2 font-semibold"><Cpu size={17} className="text-accent" /> CPU utilization</h2>
                <strong className="text-accent">{currentCpu}%</strong>
              </header>
              <PerformanceChart data={cpuHistory} metric="CPU" />
              <div className="flex justify-between text-xs text-muted"><span>30 seconds ago</span><span>Now</span></div>
            </section>
            <section className="ui-card monitor-graph">
              <header>
                <h2 className="flex items-center gap-2 font-semibold"><HardDrive size={17} className="text-iris" /> Memory usage</h2>
                <strong className="text-iris">{mem.percent}%</strong>
              </header>
              <p className="text-muted">{Math.round(mem.usedKb / 1024)} MB of {Math.round(mem.totalKb / 1024)} MB · {mem.source === 'performance.memory' ? 'Browser heap' : 'Virtual allocations'}</p>
              <PerformanceChart data={memHistory} metric="Memory" />
              <div className="flex justify-between text-xs text-muted"><span>30 seconds ago</span><span>Now</span></div>
            </section>
          </div>
        )}

        {/* SERVICES VIEW */}
        {activeTab === 'services' && (
          <div className="h-full p-4 overflow-y-auto">
            <div className="bg-raised rounded-xl border border-line overflow-hidden">
              <div className="p-3 bg-side border-b border-line font-semibold text-secondary">
                AetherCore Background Services
              </div>
              <div className="divide-y divide-line">
                {services.map((s) => (
                  <div key={s.name} className="flex items-center justify-between p-3">
                    <div>
                      <h4 className="font-mono font-medium text-ink">{s.name}</h4>
                      <p className="text-[11px] text-muted">{s.desc}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-positive/20 text-positive border border-positive/30">
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
      <div className="flex items-center justify-between px-3 py-1 bg-side border-t border-line text-[11px] text-muted">
        <div className="flex items-center gap-3">
          <span>Processes: {processes.length} total</span>
          <span>Workers: {latestSample?.activeWorkers ?? 0} active</span>
        </div>
        <span>Uptime: {virtualKernel.getFormattedUptime()}</span>
      </div>
    </div>
  );
};

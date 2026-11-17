// AetherOS - Realistic Animated Boot Screen & Systemd Startup Logs
import React, { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { AETHER_VERSION } from '../../core/version';

interface BootScreenProps {
  onComplete: () => void;
}

const BOOT_STEPS = [
  `AetherCore Kernel version ${AETHER_VERSION.kernel} (v${AETHER_VERSION.version}) loading...`,
  'Checking virtual filesystem integrity (AetherFS 2.0 fsck)... clean',
  'Mounting persistent IndexedDB virtual filesystem on /...',
  'Mounting virtual pseudo-filesystem /proc with PID status tables...',
  'Creating device nodes in /dev (null, zero, urandom)...',
  'Starting systemd-journald system logger...',
  'Starting aether-sound.service (Web Audio API Synthesizer)...',
  'Loading aetherpkg package repository database...',
  'Setting hostname to aetheros...',
  'Initializing user session for aether (UID: 1000)...',
  'Starting Aether Desktop Compositor (AetherWM)...',
  'Reached target Graphical Desktop Interface.',
];

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    let currentIdx = 0;
    let trailingTimeout: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      if (currentIdx < BOOT_STEPS.length) {
        const step = BOOT_STEPS[currentIdx];
        setLogs((prev) => [...prev, step]);
        setProgress(Math.round(((currentIdx + 1) / BOOT_STEPS.length) * 100));
        currentIdx++;
      } else {
        clearInterval(interval);
        trailingTimeout = setTimeout(() => {
          onComplete();
        }, 600);
      }
    }, 180);

    return () => {
      clearInterval(interval);
      if (trailingTimeout) {
        clearTimeout(trailingTimeout);
      }
    };
  }, [onComplete]);

  return (
    <div className="boot-screen wallpaper-screen">
      <div className="boot-card ui-material ui-panel">
        <div className="boot-logo"><span className="aether-mark" aria-hidden="true" /></div>
        <h1>AetherOS</h1>
        <p>Starting your desktop</p>
        <progress value={progress} max={100} aria-label="Startup progress" />
        <button className="ui-button" aria-expanded={showLogs} onClick={() => setShowLogs((prev) => !prev)}>
          <Terminal size={15} />{showLogs ? 'Hide boot console' : 'Show boot console'}
        </button>
        {showLogs && <div className="boot-console selectable-text" tabIndex={0}>
          {logs.map((log) => <div key={log}><span className="text-positive">[ OK ]</span> {log}</div>)}
        </div>}
      </div>
    </div>
  );
};

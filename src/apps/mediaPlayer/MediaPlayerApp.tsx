// AetherOS - Media Player Application (Audio & Video)
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  ListMusic,
} from 'lucide-react';

interface Track {
  title: string;
  artist: string;
  duration: string;
  frequency: number;
}

const DEFAULT_TRACKS: Track[] = [
  { title: 'Quantum Drift', artist: 'Aether Sounds', duration: '3:24', frequency: 432 },
  { title: 'Subtle Atmosphere', artist: 'Linux Ambient', duration: '4:12', frequency: 528 },
  { title: 'Cybernetic Horizon', artist: 'Vapor Core', duration: '2:55', frequency: 396 },
];

export const MediaPlayerApp: React.FC<AppProps> = ({ initialProps }) => {
  const [tracks] = useState<Track[]>(() => {
    const filePath = (initialProps?.filePath as string) || '';
    if (filePath) {
      const fileName = filePath.split('/').pop() || 'Local Audio';
      return [
        { title: fileName, artist: 'Local Media', duration: '3:45', frequency: 440 },
        ...DEFAULT_TRACKS,
      ];
    }
    return DEFAULT_TRACKS;
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const track = tracks[currentTrackIdx] || tracks[0];

  const stopAudio = useCallback(() => {
    if (oscRef.current) {
      try {
        oscRef.current.stop();
        oscRef.current.disconnect();
      } catch {}
      oscRef.current = null;
    }
  }, []);

  const playSynthesizedAmbient = useCallback(() => {
    stopAudio();
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(track.frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(isMuted ? 0 : volume * 0.15, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      oscRef.current = osc;
      gainRef.current = gain;
    } catch {}
  }, [stopAudio, track.frequency, isMuted, volume]);

  useEffect(() => {
    if (isPlaying) {
      playSynthesizedAmbient();
    } else {
      stopAudio();
    }
    return () => stopAudio();
  }, [isPlaying, currentTrackIdx, playSynthesizedAmbient, stopAudio]);

  // Dynamic volume adjustment while playing
  useEffect(() => {
    if (gainRef.current && audioContextRef.current) {
      const targetGain = isMuted ? 0 : volume * 0.15;
      gainRef.current.gain.linearRampToValueAtTime(targetGain, audioContextRef.current.currentTime + 0.05);
    }
  }, [volume, isMuted]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopAudio]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying) {
      timer = setInterval(() => {
        setProgress((prev) => (prev >= 100 ? 0 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div className="flex flex-col h-full bg-[#121520] text-white p-4 select-none justify-between">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-800 text-xs text-gray-400">
        <span className="font-semibold text-cyan-400">Aether Media Player</span>
        <span>Aether Synthesizer Audio</span>
      </div>

      {/* Album Art / Visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center my-4">
        <div className="w-36 h-36 rounded-2xl bg-gradient-to-tr from-cyan-600 to-purple-600 flex items-center justify-center shadow-xl shadow-cyan-500/10 mb-4 relative overflow-hidden group">
          <Music className={`w-16 h-16 text-white ${isPlaying ? 'animate-pulse' : ''}`} />
          {/* Subtle animated sound wave bars */}
          {isPlaying && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center items-end gap-1 h-6">
              {[40, 80, 60, 100, 50, 90, 70, 30].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-white/80 rounded-full animate-bounce"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <h2 className="text-base font-bold text-white text-center">{track.title}</h2>
        <p className="text-xs text-gray-400 text-center">{track.artist}</p>
      </div>

      {/* Progress Scrubber */}
      <div className="space-y-1 mb-2">
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            setProgress(pct);
          }}
          className="h-1.5 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
        >
          <div
            className="h-full bg-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 font-mono">
          <span>0:{String(Math.floor(progress * 1.8)).padStart(2, '0')}</span>
          <span>{track.duration}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMuted((m) => !m)}
            className="p-1.5 text-gray-400 hover:text-white rounded"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              setIsMuted(false);
            }}
            className="w-16 accent-cyan-400 h-1 bg-gray-700 rounded cursor-pointer"
          />
        </div>

        {/* Play / Next / Prev */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCurrentTrackIdx((idx) => (idx === 0 ? tracks.length - 1 : idx - 1));
              setProgress(0);
            }}
            className="p-1.5 text-gray-400 hover:text-white rounded"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center font-bold shadow-lg transition-transform hover:scale-105"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
          </button>

          <button
            onClick={() => {
              setCurrentTrackIdx((idx) => (idx + 1) % tracks.length);
              setProgress(0);
            }}
            className="p-1.5 text-gray-400 hover:text-white rounded"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => {
            setCurrentTrackIdx((idx) => (idx + 1) % tracks.length);
            setProgress(0);
          }}
          className="p-1.5 text-gray-400 hover:text-cyan-400 rounded"
          title="Playlist"
        >
          <ListMusic className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

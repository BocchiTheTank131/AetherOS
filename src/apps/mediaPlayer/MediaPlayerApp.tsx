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

  const [minutes, seconds] = track.duration.split(':').map(Number);
  const duration = minutes * 60 + seconds;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setProgress((prev) => (prev >= 100 ? 0 : Math.min(100, prev + 100 / duration))), 1000);
    return () => clearInterval(timer);
  }, [isPlaying, duration]);

  const elapsed = Math.round(duration * progress / 100);

  return (
    <div className="media-app flex flex-col h-full bg-canvas text-ink p-4 select-none justify-between overflow-auto">
      {/* Album Art / Visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center my-4">
        <div className="media-art"><Music size={57} strokeWidth={1.25} /></div>

        <h2 className="text-base font-bold text-ink text-center">{track.title}</h2>
        <p className="text-xs text-muted text-center">{track.artist}</p>
      </div>

      {/* Progress Scrubber */}
      <div className="space-y-1 mb-2">
        <input type="range" min={0} max={100} value={progress} aria-label="Playback position"
          className="w-full" onChange={(event) => setProgress(Number(event.target.value))} />
        <div className="flex justify-between text-[10px] text-muted font-mono">
          <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          <span>{track.duration}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="flex items-center gap-1">
          <button
            aria-label={isMuted ? 'Unmute playback' : 'Mute playback'}
            onClick={() => setIsMuted((m) => !m)}
            className="p-1.5 text-muted hover:text-ink rounded"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-danger" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label="Playback volume"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              setIsMuted(false);
            }}
            className="w-16 accent-action h-1 bg-control rounded cursor-pointer"
          />
        </div>

        {/* Play / Next / Prev */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCurrentTrackIdx((idx) => (idx === 0 ? tracks.length - 1 : idx - 1));
              setProgress(0);
            }}
            className="p-1.5 text-muted hover:text-ink rounded"
          >
            <SkipBack className="w-4 h-4" /><span className="sr-only">Previous track</span>
          </button>

          <button
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => setIsPlaying((p) => !p)}
            className="w-10 h-10 rounded-full bg-action hover:bg-action text-on-action flex items-center justify-center font-bold shadow-lg transition-transform hover:scale-105"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              setCurrentTrackIdx((idx) => (idx + 1) % tracks.length);
              setProgress(0);
            }}
            className="p-1.5 text-muted hover:text-ink rounded"
          >
            <SkipForward className="w-4 h-4" /><span className="sr-only">Next track</span>
          </button>
        </div>

        <button
          onClick={() => {
            setCurrentTrackIdx((idx) => (idx + 1) % tracks.length);
            setProgress(0);
          }}
          className="p-1.5 text-muted hover:text-accent rounded"
          title="Playlist"
        >
          <ListMusic className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

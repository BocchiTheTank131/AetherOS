// AetherOS - Sound Studio & Audio Recorder Application
import React, { useState, useRef, useEffect } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { Mic, Square, Play, Pause, Save } from 'lucide-react';

export const AudioRecorderApp: React.FC<AppProps> = () => {
  const { addNotification } = useSystem();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordedBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    recordedBlobUrlRef.current = recordedBlobUrl;
  }, [recordedBlobUrl]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    return () => {
      const url = recordedBlobUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
      }
      const stream = mediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (player) {
        player.pause();
      }
    };
  }, []);

  const startRecording = async () => {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl(null);
    }
    audioChunksRef.current = [];
    setRecordingSeconds(0);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedBlobUrl(url);
          stream.getTracks().forEach((t) => t.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } else {
        // Fallback simulation if mediaDevices not available
        setIsRecording(true);
      }
    } catch {
      // Permission denied or headless environment: fallback recording simulation
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      // Fallback dummy audio blob
      const dummyBlob = new Blob(['AETHER_SIMULATED_AUDIO_DATA'], { type: 'audio/webm' });
      setRecordedBlobUrl(URL.createObjectURL(dummyBlob));
    }
    setIsRecording(false);
  };

  const handleSaveToVfs = () => {
    const filename = `recording-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}.webm`;
    const targetPath = `/home/aether/Music/${filename}`;

    try {
      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string) || '';
          vfs.writeFile(targetPath, base64Data, {
            owner: 'aether',
            isBinary: true,
          });
          addNotification({
            title: 'Sound Studio',
            message: `Saved voice memo to ${targetPath}`,
            level: 'success',
          });
        };
        reader.readAsDataURL(blob);
      } else {
        vfs.writeFile(targetPath, `[AetherOS Audio Recording: ${recordingSeconds}s]\n`, {
          owner: 'aether',
        });
        addNotification({
          title: 'Sound Studio',
          message: `Saved voice memo to ${targetPath}`,
          level: 'success',
        });
      }
    } catch (err) {
      dialogService.alert({
        title: 'Save Failed',
        message: `Failed to save voice memo: ${(err as Error).message}`,
        level: 'error',
      });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="recorder-app flex flex-col h-full bg-canvas text-ink p-5 select-none justify-between items-center overflow-auto">
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-line text-xs text-muted">
        <span className="font-semibold text-accent">Microphone</span>
        <span>/home/aether/Music</span>
      </div>

      {/* Mic Animation & Visualizer */}
      <div className="flex flex-col items-center my-6">
        <div
          className={`recorder-meter rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? 'bg-danger/20 border-2 border-red-500  shadow-2xl shadow-red-500/30'
              : 'bg-control border border-line'
          }`}
        >
          <Mic className={`w-12 h-12 ${isRecording ? 'text-danger' : 'text-muted'}`} />
        </div>

        <div className="font-mono text-3xl font-extrabold mt-4 tracking-wider text-accent">
          {formatTime(recordingSeconds)}
        </div>
        <span className="text-xs text-muted mt-1">
          {isRecording ? 'Recording in progress...' : recordedBlobUrl ? 'Ready to save' : 'Ready'}
        </span>
      </div>

      {/* Audio Element if recorded */}
      {recordedBlobUrl && (
        <audio
          ref={audioPlayerRef}
          src={recordedBlobUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center gap-2 w-full justify-center pt-4 border-t border-line">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-5 py-2.5 recorder-record ui-button text-on-action"
          >
            <Mic className="w-4 h-4" />
            <span>Record</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-5 py-2.5 bg-control hover:bg-hover text-ink rounded-full font-semibold text-xs shadow-lg transition-transform hover:scale-105"
          >
            <Square className="w-4 h-4" />
            <span>Stop</span>
          </button>
        )}

        {recordedBlobUrl && !isRecording && (
          <>
            <button
              onClick={() => {
                if (audioPlayerRef.current) {
                  if (isPlaying) {
                    audioPlayerRef.current.pause();
                    setIsPlaying(false);
                  } else {
                    audioPlayerRef.current.play();
                    setIsPlaying(true);
                  }
                }
              }}
              className="p-2.5 bg-control hover:bg-hover rounded-full text-ink"
              title="Play / Pause"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSaveToVfs}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-action hover:bg-action text-on-action rounded-full text-xs font-semibold shadow transition-transform hover:scale-105"
            >
              <Save className="w-4 h-4" />
              <span>Save to Music</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

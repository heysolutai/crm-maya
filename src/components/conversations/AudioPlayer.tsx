import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  isClient?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, isClient = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number>();
  const audioContextRef = useRef<AudioContext>();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Process audio and extract waveform data once
  useEffect(() => {
    const SAMPLES = 48;

    // Fallback determinístico baseado no src — garante barras visíveis mesmo se
    // o decode falhar (CORS, formato não suportado, etc)
    const fakeWaveform = () => {
      let seed = 0;
      for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) | 0;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      return Array.from({ length: SAMPLES }, () => 0.25 + rand() * 0.75);
    };

    const processAudio = async () => {
      try {
        const audioContext = new AudioContext();
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) throw new Error(`fetch failed (${response.status})`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / SAMPLES);
        const amplitudes: number[] = [];

        for (let i = 0; i < SAMPLES; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j]);
          }
          amplitudes.push(sum / blockSize);
        }

        const max = Math.max(...amplitudes) || 1;
        const normalized = amplitudes.map((amp) => Math.max(0.15, amp / max));

        setWaveformData(normalized);
        audioContextRef.current = audioContext;
      } catch (error) {
        console.warn('[AudioPlayer] decode falhou, usando waveform fallback:', error);
        setWaveformData(fakeWaveform());
      }
    };

    processAudio();
  }, [src]);

  // Draw static waveform with progress
  useEffect(() => {
    if (!canvasRef.current || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Cores: mensagens incoming usam primary/muted; outgoing (fundo verde) usam branco
    const getColor = (variable: string): string => {
      const style = getComputedStyle(document.documentElement);
      const hslValue = style.getPropertyValue(variable).trim();
      return `hsl(${hslValue})`;
    };

    const playedColor = isClient ? getColor('--primary') : '#ffffff';
    const unplayedColor = isClient
      ? 'hsla(0, 0%, 50%, 0.35)'
      : 'rgba(255, 255, 255, 0.35)';

    const draw = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);

      const barCount = waveformData.length;
      const barWidth = 2.5;
      const gap = 2;
      const totalWidth = barCount * (barWidth + gap);
      const startX = Math.max(0, (width - totalWidth) / 2);
      const progress = duration > 0 ? currentTime / duration : 0;

      for (let i = 0; i < barCount; i++) {
        const amplitude = waveformData[i];
        const barHeight = Math.max(3, amplitude * height * 0.85);
        const x = startX + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        const isPlayed = (i / barCount) < progress;
        ctx.fillStyle = isPlayed ? playedColor : unplayedColor;

        // Barras arredondadas
        const radius = barWidth / 2;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, y + barHeight - radius);
        ctx.quadraticCurveTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight);
        ctx.lineTo(x + radius, y + barHeight);
        ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
      }
    };

    const animate = () => {
      draw();
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [waveformData, currentTime, duration, isClient]);

  const togglePlayPause = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLElement>) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = percentage * duration;
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" />

      <Button
        onClick={togglePlayPause}
        size="icon"
        variant="ghost"
        className={cn(
          'rounded-full h-9 w-9 flex-shrink-0',
          isClient ? 'hover:bg-primary/10' : 'hover:bg-white/10 text-white'
        )}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>

      <canvas
        ref={canvasRef}
        onClick={handleSeek}
        className="flex-1 h-10 cursor-pointer"
        style={{ height: '40px' }}
      />

      <span
        className={cn(
          'text-[11px] font-mono flex-shrink-0 min-w-[40px] text-right',
          isClient ? 'text-muted-foreground' : 'text-white/70'
        )}
      >
        {formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
};

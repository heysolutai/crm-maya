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
    const processAudio = async () => {
      try {
        const audioContext = new AudioContext();
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Extract amplitude data
        const rawData = audioBuffer.getChannelData(0);
        const samples = 40; // Number of bars in waveform
        const blockSize = Math.floor(rawData.length / samples);
        const amplitudes: number[] = [];
        
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j]);
          }
          amplitudes.push(sum / blockSize);
        }
        
        // Normalize amplitudes
        const max = Math.max(...amplitudes);
        const normalized = amplitudes.map(amp => amp / max);
        
        setWaveformData(normalized);
        audioContextRef.current = audioContext;
      } catch (error) {
        console.error('Error processing audio:', error);
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

    // Get computed colors
    const getColor = (variable: string): string => {
      const style = getComputedStyle(document.documentElement);
      const hslValue = style.getPropertyValue(variable).trim();
      return `hsl(${hslValue})`;
    };

    const primaryColor = getColor('--primary');
    const accentColor = getColor('--accent');
    const mutedColor = getColor('--muted-foreground');

    const draw = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);

      const barCount = waveformData.length;
      const barWidth = 2;
      const gap = 2;
      const totalWidth = barCount * (barWidth + gap);
      const startX = (width - totalWidth) / 2;
      const progress = duration > 0 ? currentTime / duration : 0;

      for (let i = 0; i < barCount; i++) {
        const amplitude = waveformData[i];
        const barHeight = Math.max(4, amplitude * height * 0.6);
        const x = startX + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Change color based on progress
        const isPlayed = (i / barCount) < progress;
        const color = isPlayed 
          ? (isClient ? primaryColor : accentColor)
          : mutedColor.replace('hsl(', 'hsla(').replace(')', ' / 0.3)');
        
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth, barHeight);
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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audioRef.current.currentTime = percentage * duration;
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 min-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <Button
        onClick={togglePlayPause}
        size="icon"
        variant="ghost"
        className={cn(
          "rounded-full h-10 w-10 flex-shrink-0",
          isClient ? "hover:bg-primary/10" : "hover:bg-accent/10"
        )}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>

      <div className="flex-1 space-y-1">
        <canvas
          ref={canvasRef}
          className="w-full h-8"
          style={{ width: '100%', height: '32px' }}
        />
        
        <div
          className="relative h-1 bg-muted rounded-full cursor-pointer group"
          onClick={handleSeek}
        >
          <div
            className={cn(
              "absolute h-full rounded-full transition-all",
              isClient ? "bg-primary" : "bg-accent"
            )}
            style={{ width: `${progress}%` }}
          />
          <div
            className={cn(
              "absolute h-3 w-3 rounded-full -top-1 transition-all opacity-0 group-hover:opacity-100",
              isClient ? "bg-primary" : "bg-accent"
            )}
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
      </div>

      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 min-w-[45px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
};

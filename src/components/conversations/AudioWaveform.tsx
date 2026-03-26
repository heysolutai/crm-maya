import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  mediaStream: MediaStream;
  isRecording: boolean;
  className?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  mediaStream,
  isRecording,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number>();
  const audioContextRef = useRef<AudioContext>();
  const analyserRef = useRef<AnalyserNode>();

  useEffect(() => {
    if (!mediaStream || !canvasRef.current || !isRecording) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup Web Audio API
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Get computed colors from CSS variables
    const getColor = (variable: string): string => {
      const style = getComputedStyle(document.documentElement);
      const hslValue = style.getPropertyValue(variable).trim();
      return `hsl(${hslValue})`;
    };

    const primaryColor = getColor('--primary');
    const accentColor = getColor('--accent');

    // Draw waveform
    const draw = () => {
      if (!isRecording) return;
      
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);

      const barCount = 40;
      const barWidth = 3;
      const gap = 2;
      const totalWidth = barCount * (barWidth + gap);
      const startX = (width - totalWidth) / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(4, value * height * 0.8);
        
        const x = startX + i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Gradient from primary to accent
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, primaryColor);
        gradient.addColorStop(1, accentColor);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [mediaStream, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

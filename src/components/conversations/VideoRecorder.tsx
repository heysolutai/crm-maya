import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Square, Trash2, Send, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { VideoRecorderUtil } from '@/utils/videoRecorder';

interface VideoRecorderProps {
  onSendVideo: (videoBlob: Blob, mimeType: string, duration: number) => void;
  onCancel: () => void;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ onSendVideo, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recorded, setRecorded] = useState<{ blob: Blob; mimeType: string; url: string } | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isSending, setIsSending] = useState(false);

  const recorderRef = useRef<VideoRecorderUtil>(new VideoRecorderUtil());
  const previewRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current.cancelRecording();
      if (recorded?.url) URL.revokeObjectURL(recorded.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    try {
      const stream = await recorderRef.current.startRecording(facing);
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.muted = true; // evita feedback no monitor
        await previewRef.current.play().catch(() => undefined);
      }
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar camera');
      onCancel();
    }
  };

  const stopRecording = async () => {
    try {
      const result = await recorderRef.current.stopRecording();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      if (previewRef.current) {
        previewRef.current.srcObject = null;
      }
      const url = URL.createObjectURL(result.blob);
      setRecorded({ blob: result.blob, mimeType: result.mimeType, url });
    } catch {
      toast.error('Erro ao parar gravacao');
    }
  };

  const cancelAll = () => {
    recorderRef.current.cancelRecording();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    setIsRecording(false);
    setRecordingTime(0);
    onCancel();
  };

  const handleSend = () => {
    if (recorded && !isSending) {
      setIsSending(true);
      onSendVideo(recorded.blob, recorded.mimeType, recordingTime);
    }
  };

  const switchCamera = async () => {
    if (!isRecording) return;
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    recorderRef.current.cancelRecording();
    setIsRecording(false);
    setRecordingTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // re-inicia com a nova camera
    try {
      const stream = await recorderRef.current.startRecording(next);
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => undefined);
      }
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alternar camera');
      onCancel();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg">
      <div className="relative w-full bg-black rounded overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
        {recorded ? (
          <video
            src={recorded.url}
            controls
            playsInline
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
        ) : (
          <video
            ref={previewRef}
            playsInline
            autoPlay
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {isRecording && (
          <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 rounded bg-black/60 text-white text-xs font-mono">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            REC {formatTime(recordingTime)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {isRecording && (
          <>
            <Button onClick={switchCamera} variant="ghost" size="icon" title="Alternar camera">
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button onClick={stopRecording} variant="default" size="icon" title="Parar gravacao">
              <Square className="h-5 w-5" />
            </Button>
            <Button onClick={cancelAll} variant="ghost" size="icon" title="Cancelar">
              <Trash2 className="h-5 w-5" />
            </Button>
          </>
        )}

        {recorded && (
          <>
            <span className="text-sm text-muted-foreground mr-auto">{formatTime(recordingTime)}</span>
            <Button onClick={handleSend} disabled={isSending} size="icon" title="Enviar">
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
            <Button onClick={cancelAll} variant="ghost" size="icon" disabled={isSending} title="Descartar">
              <Trash2 className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AudioRecorderUtil } from '@/utils/audioRecorder';
import { AudioWaveform } from './AudioWaveform';

interface AudioRecorderProps {
  onSendAudio: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSendAudio, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isSending, setIsSending] = useState(false);
  const recorderRef = useRef<AudioRecorderUtil>(new AudioRecorderUtil());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Iniciar gravação automaticamente ao montar
    startRecording();
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current.cancelRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await recorderRef.current.startRecording();
      setMediaStream(stream);
      setIsRecording(true);
      setRecordingTime(0);
      
      // Timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao iniciar gravação');
    }
  };

  const stopRecording = async () => {
    try {
      const blob = await recorderRef.current.stopRecording();
      setAudioBlob(blob);
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (error) {
      toast.error('Erro ao parar gravação');
    }
  };

  const cancelRecording = () => {
    recorderRef.current.cancelRecording();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setAudioBlob(null);
    setRecordingTime(0);
    onCancel();
  };

  const handleSend = () => {
    if (audioBlob && !isSending) {
      setIsSending(true);
      onSendAudio(audioBlob, recordingTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
      {isRecording && (
        <>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-lg font-mono flex-shrink-0 min-w-[45px]">{formatTime(recordingTime)}</span>
            {mediaStream && (
              <AudioWaveform 
                mediaStream={mediaStream}
                isRecording={isRecording}
                className="flex-1 h-12"
              />
            )}
          </div>
          <Button onClick={stopRecording} variant="default" size="icon">
            <Square className="h-5 w-5" />
          </Button>
          <Button onClick={cancelRecording} variant="ghost" size="icon">
            <Trash2 className="h-5 w-5" />
          </Button>
        </>
      )}

      {!isRecording && audioBlob && (
        <>
          <div className="flex items-center gap-3 flex-1">
            <audio src={URL.createObjectURL(audioBlob)} controls className="flex-1" />
            <span className="text-sm text-muted-foreground">{formatTime(recordingTime)}</span>
          </div>
          <Button onClick={handleSend} variant="default" size="icon" disabled={isSending}>
            {isSending ? (
              <div className="h-5 w-5 border-2 border-background border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
          <Button onClick={cancelRecording} variant="ghost" size="icon" disabled={isSending}>
            <Trash2 className="h-5 w-5" />
          </Button>
        </>
      )}
    </div>
  );
};

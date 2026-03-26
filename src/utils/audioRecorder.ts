export class AudioRecorderUtil {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(): Promise<MediaStream> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      // Usar formato compatível com WhatsApp (opus em webm ou mp4)
      const options = { mimeType: 'audio/webm;codecs=opus' };
      
      // Fallback para outros formatos se webm não for suportado
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/mp4';
      }
      
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Coletar dados a cada 100ms
      return this.stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw new Error('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.audioChunks = [];
    this.mediaRecorder = null;
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }
}

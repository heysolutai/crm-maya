// Gravacao de video via MediaRecorder. Mira o caminho do AudioRecorderUtil
// pra manter a UX consistente entre microfone e camera.

export class VideoRecorderUtil {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private resolvedMimeType: string = 'video/webm';

  async startRecording(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
    try {
      // Em desktop facingMode e ignorado pelo browser. No mobile, 'environment'
      // pega camera traseira (preferida pra gravar coisas externas, igual WhatsApp).
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Tenta MP4 (H.264) primeiro pra compatibilidade com WhatsApp.
      // Cai pra WebM (VP9/VP8) se o browser nao suportar MP4 gravacao.
      const candidates = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const supported = candidates.find(t => MediaRecorder.isTypeSupported(t));
      if (!supported) {
        throw new Error('Navegador nao suporta gravacao de video');
      }
      this.resolvedMimeType = supported;

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: supported });
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };

      this.mediaRecorder.start(250); // chunks a cada 250ms
      return this.stream;
    } catch (error) {
      this.cleanup();
      console.error('Erro ao acessar camera:', error);
      const msg = error instanceof Error ? error.message : 'Falha ao iniciar camera';
      throw new Error(`Nao foi possivel acessar a camera. ${msg}`);
    }
  }

  stopRecording(): Promise<{ blob: Blob; mimeType: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.resolvedMimeType });
        const mimeType = this.resolvedMimeType;
        this.cleanup();
        resolve({ blob, mimeType });
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

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.chunks = [];
    this.mediaRecorder = null;
  }
}

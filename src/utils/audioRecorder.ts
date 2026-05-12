export class AudioRecorderUtil {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(): Promise<MediaStream> {
    // Guards de ambiente — falham cedo com mensagem clara em vez do
    // catch generico abaixo esconder a causa real.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error(
        'Acesso ao microfone requer HTTPS. O navegador bloqueia gravacao em conexoes nao seguras. Configure SSL no servidor ou acesse via localhost.'
      );
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Gravacao de audio nao disponivel neste navegador. Use Chrome, Firefox, Edge ou Safari atualizados.'
      );
    }

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
      console.error('[AudioRecorder] getUserMedia error:', error);

      // Traduz os DOMException padrao do browser pra mensagem clara
      if (error instanceof DOMException || (error as any)?.name) {
        const name = (error as any).name;
        switch (name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            throw new Error(
              'Permissao de microfone negada. Clique no cadeado da URL e libere o acesso ao microfone.'
            );
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            throw new Error(
              'Nenhum microfone encontrado. Conecte um microfone e tente novamente.'
            );
          case 'NotReadableError':
          case 'TrackStartError':
            throw new Error(
              'Microfone em uso por outro aplicativo (Zoom, Meet, etc). Feche e tente de novo.'
            );
          case 'OverconstrainedError':
          case 'ConstraintNotSatisfiedError':
            throw new Error('Microfone nao compatibel com as configuracoes solicitadas.');
          case 'SecurityError':
            throw new Error('Bloqueado por politica de seguranca. Use HTTPS.');
        }
      }

      throw new Error('Nao foi possivel acessar o microfone. Verifique as permissoes.');
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

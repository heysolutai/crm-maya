'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DAYS = 7;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function wasDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    const diff = Date.now() - ts;
    return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'chrome' | 'ios' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return; // Ja instalado
    if (wasDismissedRecently()) return;

    // iOS: Safari nao dispara beforeinstallprompt, mostramos instrucoes manuais
    if (isIOS()) {
      setPlatform('ios');
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }

    // Android/Desktop Chrome: captura o evento
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform('chrome');
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Se o app for instalado, some
    const installed = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      }
    } catch {
      // ignore
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed z-[60] left-4 right-4 md:left-auto md:right-6 md:w-[360px]',
        'animate-in slide-in-from-bottom-4 fade-in duration-300'
      )}
      style={{
        bottom: 'calc(6rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="rounded-2xl border border-border bg-card shadow-[0_20px_40px_rgba(0,0,0,0.3)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Instalar Wyarp</p>
            {platform === 'chrome' ? (
              <p className="text-xs text-muted-foreground mt-1">
                Use o app direto na tela inicial, sem abrir o navegador.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                Toque em <Share className="h-3 w-3 inline" /> no Safari e depois em{' '}
                <strong>Adicionar à Tela de Início</strong>.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {platform === 'chrome' && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1" onClick={handleInstall}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Instalar agora
            </Button>
            <Button size="sm" variant="outline" onClick={handleDismiss}>
              Depois
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

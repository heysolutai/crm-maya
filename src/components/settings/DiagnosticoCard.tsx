'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Stethoscope, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DiagnosticoMidia {
  quebradas: number;
  porTipo: Record<string, number>;
  /** Audios que existem no storage mas em formato que Safari/iOS nao tocam. */
  audiosNaoMp3: number;
}

/**
 * Diagnostico de midia na interface: conta o que nao toca e conserta com um
 * clique. Antes so existia como endpoint.
 */
export function DiagnosticoCard() {
  const { toast } = useToast();
  const [midia, setMidia] = useState<DiagnosticoMidia | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);

  const chamar = async <T,>(chave: string, url: string, init?: RequestInit): Promise<T | null> => {
    setCarregando(chave);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na requisição');
      return data as T;
    } catch (e) {
      toast({
        title: 'Erro',
        description: e instanceof Error ? e.message : 'Erro inesperado',
        variant: 'destructive',
      });
      return null;
    } finally {
      setCarregando(null);
    }
  };

  const diagnosticar = async () => {
    const d = await chamar<DiagnosticoMidia>('diag', '/api/messages/repair-media');
    if (d) setMidia(d);
  };

  const reparar = async () => {
    const r = await chamar<{ reenfileiradas: number; semReferencia: number }>('reparar', '/api/messages/repair-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    });
    if (!r) return;
    toast({
      title: `${r.reenfileiradas} mídia(s) reenviada(s) pro download`,
      description:
        r.semReferencia > 0
          ? `${r.semReferencia} não têm referência no WhatsApp e não podem ser recuperadas.`
          : 'O worker baixa e sobe cada uma; a conversa atualiza sozinha.',
    });
    diagnosticar();
  };

  const converterAudios = async () => {
    let total = 0;
    let restantes = 0;
    for (let rodada = 0; rodada < 25; rodada++) {
      const r = await chamar<{ convertidos: number; falhas: number; restantes: number; erros?: string[] }>(
        'audios',
        '/api/messages/repair-media',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcodeAudio: true, limit: 20 }),
        }
      );
      if (!r) return;
      total += r.convertidos;
      restantes = r.restantes;
      if (r.erros?.length && r.convertidos === 0) {
        toast({ title: 'Conversão parou', description: r.erros[0], variant: 'destructive' });
        break;
      }
      if (r.restantes === 0 || (r.convertidos === 0 && r.falhas > 0)) break;
    }
    toast({
      title: `${total} áudio(s) convertido(s) para MP3`,
      description:
        restantes > 0
          ? `${restantes} ainda na fila: clique de novo pra continuar.`
          : 'Todos os áudios agora tocam em qualquer navegador.',
    });
    diagnosticar();
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Diagnóstico de mídia</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Áudio ou imagem que não abre.</strong> Duas causas
        diferentes: arquivo que não chegou ao armazenamento (Reparar), e áudio guardado em
        OGG/Opus, que Safari e iPhone não reproduzem (Converter para MP3).
      </p>

      {midia && (
        <div className="rounded-md border p-3 text-xs space-y-1.5">
          <p>
            <span className="font-medium">{midia.quebradas}</span> mídia(s) sem arquivo
            {Object.keys(midia.porTipo).length > 0 && (
              <span className="text-muted-foreground">
                {' '}
                ({Object.entries(midia.porTipo).map(([t, n]) => `${t}: ${n}`).join(', ')})
              </span>
            )}
          </p>
          <p>
            <span className="font-medium">{midia.audiosNaoMp3}</span> áudio(s) em formato que
            Safari/iPhone não tocam
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={diagnosticar} disabled={!!carregando}>
          {carregando === 'diag' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Stethoscope className="h-4 w-4 mr-2" />}
          Diagnosticar
        </Button>
        {midia && midia.quebradas > 0 && (
          <Button size="sm" onClick={reparar} disabled={!!carregando}>
            {carregando === 'reparar' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            Reparar {midia.quebradas} mídia(s)
          </Button>
        )}
        {midia && midia.audiosNaoMp3 > 0 && (
          <Button size="sm" variant="secondary" onClick={converterAudios} disabled={!!carregando}>
            {carregando === 'audios' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            Converter {midia.audiosNaoMp3} áudio(s) para MP3
          </Button>
        )}
      </div>
    </div>
  );
}

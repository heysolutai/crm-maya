'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInputBR } from '@/components/ui/date-input-br';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useDeleteEvent,
  useSaveEvent,
  useUploadEventPhoto,
  type EventItem,
} from '@/hooks/useEvents';

const MAX_PHOTOS = 8;
const MAX_QUESTIONS = 10;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = novo evento */
  event: EventItem | null;
}

interface Form {
  name: string;
  description: string;
  eventDate: string;
  priceInfo: string;
  capacity: string;
  imageUrls: string[];
  extraFields: string[];
}

function formFrom(event: EventItem | null): Form {
  return {
    name: event?.name ?? '',
    description: event?.description ?? '',
    eventDate: event?.eventDate ? event.eventDate.slice(0, 10) : '',
    priceInfo: event?.priceInfo ?? '',
    capacity: event?.capacity ? String(event.capacity) : '',
    imageUrls: event?.imageUrls ?? [],
    extraFields: event?.extraFields ?? [],
  };
}

export function EventEditor({ open, onOpenChange, event }: Props) {
  const save = useSaveEvent();
  const remove = useDeleteEvent();
  const upload = useUploadEventPhoto();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Form>(() => formFrom(event));
  const [novaPergunta, setNovaPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(formFrom(event));
      setNovaPergunta('');
    }
  }, [open, event]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const enviarFotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const vagas = MAX_PHOTOS - form.imageUrls.length;
    const lista = Array.from(files).slice(0, Math.max(vagas, 0));
    if (files.length > lista.length) toast.info(`Cabem até ${MAX_PHOTOS} fotos.`);
    setEnviando(true);
    const novas: string[] = [];
    for (const file of lista) {
      try {
        novas.push(await upload.mutateAsync(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a foto.');
      }
    }
    if (novas.length) setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, ...novas].slice(0, MAX_PHOTOS) }));
    setEnviando(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const mover = (index: number, delta: number) => {
    setForm((f) => {
      const alvo = index + delta;
      if (alvo < 0 || alvo >= f.imageUrls.length) return f;
      const urls = [...f.imageUrls];
      [urls[index], urls[alvo]] = [urls[alvo], urls[index]];
      return { ...f, imageUrls: urls };
    });
  };

  const adicionarPergunta = () => {
    const texto = novaPergunta.trim().slice(0, 100);
    if (!texto) return;
    if (form.extraFields.length >= MAX_QUESTIONS) {
      toast.info(`Cabem até ${MAX_QUESTIONS} perguntas.`);
      return;
    }
    set('extraFields', [...form.extraFields, texto]);
    setNovaPergunta('');
  };

  const salvar = () => {
    if (!form.name.trim()) {
      toast.error('Dê um nome ao evento.');
      return;
    }
    const vagas = form.capacity.trim() ? Number.parseInt(form.capacity, 10) : null;
    if (vagas !== null && (!Number.isFinite(vagas) || vagas < 1)) {
      toast.error('Confira o número de vagas.');
      return;
    }
    // A pergunta digitada e não adicionada ainda não se perde.
    const extra = novaPergunta.trim() ? [...form.extraFields, novaPergunta.trim().slice(0, 100)] : form.extraFields;

    save.mutate(
      {
        id: event?.id,
        data: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          priceInfo: form.priceInfo.trim() || null,
          eventDate: form.eventDate || null,
          capacity: vagas,
          imageUrls: form.imageUrls,
          extraFields: extra.slice(0, MAX_QUESTIONS),
        },
      },
      {
        onSuccess: () => {
          toast.success('Evento salvo');
          onOpenChange(false);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const excluir = () => {
    if (!event) return;
    remove.mutate(event.id, {
      onSuccess: () => {
        toast.success('Evento excluído');
        setConfirmarExcluir(false);
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const ocupado = save.isPending || enviando;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{event ? 'Editar evento' : 'Novo evento'}</DialogTitle>
            <DialogDescription>
              A IA usa estas informações para contar do evento aos clientes e anotar quem quer ir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="ev-nome">
                Nome do evento <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ev-nome"
                value={form.name}
                maxLength={200}
                placeholder="Ex.: Noite do Vinho"
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Descrição</Label>
              <Textarea
                id="ev-desc"
                rows={4}
                value={form.description}
                maxLength={4000}
                placeholder="Ex.: Jantar com 4 vinhos, música ao vivo e menu especial do chef. Começa às 20h."
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-data">Data</Label>
                <DateInputBR id="ev-data" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-vagas">Vagas</Label>
                <Input
                  id="ev-vagas"
                  inputMode="numeric"
                  value={form.capacity}
                  placeholder="Deixe vazio se não tem limite"
                  onChange={(e) => set('capacity', e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-preco">Preço e condições</Label>
              <Input
                id="ev-preco"
                value={form.priceInfo}
                maxLength={500}
                placeholder="Ex.: R$ 120 por pessoa, bebidas à parte"
                onChange={(e) => set('priceInfo', e.target.value)}
              />
            </div>

            {/* Fotos */}
            <div className="space-y-2">
              <Label>
                Fotos <span className="font-normal text-muted-foreground">(até {MAX_PHOTOS})</span>
              </Label>
              {form.imageUrls.length > 0 && (
                <ul className="space-y-2">
                  {form.imageUrls.map((url, i) => (
                    <li key={url} className="flex items-center gap-3 rounded-md border p-2">
                      <img src={url} alt={`Foto ${i + 1}`} className="h-14 w-14 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                        {i === 0 ? 'Foto principal' : `Foto ${i + 1}`}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                        aria-label="Subir foto"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={i === form.imageUrls.length - 1}
                        onClick={() => mover(i, 1)}
                        aria-label="Descer foto"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set('imageUrls', form.imageUrls.filter((_, idx) => idx !== i))}
                        aria-label="Tirar foto"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => enviarFotos(e.target.files)}
              />
              {form.imageUrls.length < MAX_PHOTOS && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={enviando}
                  onClick={() => fileRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  {enviando ? 'Enviando...' : 'Adicionar fotos'}
                </Button>
              )}
            </div>

            {/* Perguntas */}
            <div className="space-y-2">
              <Label htmlFor="ev-pergunta">O que a IA deve perguntar para quem quer ir</Label>
              <p className="text-sm text-muted-foreground">
                A IA sempre pergunta nome e quantas pessoas. Aqui você adiciona o que mais quiser saber.
              </p>
              {form.extraFields.length > 0 && (
                <ul className="space-y-1.5">
                  {form.extraFields.map((q, i) => (
                    <li key={`${q}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 break-words">{q}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => set('extraFields', form.extraFields.filter((_, idx) => idx !== i))}
                        aria-label="Tirar pergunta"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  id="ev-pergunta"
                  value={novaPergunta}
                  maxLength={100}
                  placeholder="Ex.: Alguma alergia?"
                  onChange={(e) => setNovaPergunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarPergunta();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={adicionarPergunta} disabled={!novaPergunta.trim()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:space-x-0">
            {event ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmarExcluir(true)}
                disabled={ocupado}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancelar
              </Button>
              <Button type="button" onClick={salvar} disabled={ocupado}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmarExcluir}
        onOpenChange={setConfirmarExcluir}
        title="Excluir este evento?"
        description={
          event && event.registrationsCount > 0
            ? `Este evento tem ${event.registrationsCount} inscrito${event.registrationsCount > 1 ? 's' : ''}. Se você excluir, a lista de inscritos dele também some. Para só parar de divulgar, desligue o evento na lista.`
            : 'O evento será apagado e a IA deixa de falar dele.'
        }
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={excluir}
      />
    </>
  );
}

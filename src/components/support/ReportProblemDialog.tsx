import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ImagePlus, X, Loader2, AlertTriangle } from 'lucide-react';
import { useSupportTickets } from '@/hooks/useSupportTickets';

interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'medium', label: 'Média', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'high', label: 'Alta', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'critical', label: 'Crítica', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
];

export function ReportProblemDialog({ open, onOpenChange }: ReportProblemDialogProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { submitTicket, isSubmitting } = useSupportTickets();

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (images.length + imageFiles.length > 5) return;

    setImages(prev => [...prev, ...imageFiles]);
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setPriority('medium');
    setImages([]);
    setPreviews([]);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim() || images.length === 0) return;
    try {
      await submitTicket({ subject, description, images, priority });
      resetForm();
      onOpenChange(false);
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Relatar Problema
          </DialogTitle>
          <DialogDescription>
            Descreva o problema encontrado. É obrigatório anexar pelo menos uma captura de tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Assunto</Label>
            <Input
              id="ticket-subject"
              placeholder="Resumo do problema..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-description">Descrição</Label>
            <Textarea
              id="ticket-description"
              placeholder="Descreva o problema em detalhes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Prioridade</Label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${p.color} ${
                    priority === p.value ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-105' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Capturas de tela <span className="text-destructive">*</span> (mín. 1, máx. 5)</Label>
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative h-20 w-20 rounded-md border border-border overflow-hidden group">
                  <img src={src} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <ImagePlus className="h-6 w-6" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !subject.trim() || !description.trim() || images.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

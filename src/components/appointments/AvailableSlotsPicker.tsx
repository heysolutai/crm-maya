import { useEffect, useState } from 'react';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  reason?: string;
}

interface AvailableSlotsPickerProps {
  date: Date;
  durationMinutes?: number;
  assignedTo?: string;
  onSelectSlot: (slotStart: string) => void;
  selectedSlot?: string;
}

export function AvailableSlotsPicker({
  date,
  durationMinutes = 60,
  assignedTo,
  onSelectSlot,
  selectedSlot,
}: AvailableSlotsPickerProps) {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveCompanyId || !date) return;

    const fetchSlots = async () => {
      setLoading(true);
      setError(null);

      try {
        const dateStr = format(date, 'yyyy-MM-dd');
        // Ensure durationMinutes is a valid number (fallback to 60 if NaN or invalid)
        const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 
          ? durationMinutes : 60;
        const body: Record<string, string> = {
          company_id: effectiveCompanyId,
          date: dateStr,
          duration_minutes: safeDuration.toString(),
        };

        if (assignedTo) {
          body.assigned_to = assignedTo;
        }

        const { data, error: functionError } = await invokeFn('get-available-slots', body);

        if (functionError) {
          if (functionError.includes('401') || functionError.includes('Unauthorized')) {
            throw new Error('Sessão expirada. Faça login novamente.');
          }
          throw new Error(functionError);
        }

        setSlots(data.available_slots || []);
      } catch (err: any) {
        console.error('Error fetching slots:', err);
        setError(err.message || 'Erro ao buscar horários disponíveis');
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [effectiveCompanyId, date, durationMinutes, assignedTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4 text-destructive">
        {error}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        Nenhum horário disponível para esta data
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="grid grid-cols-2 gap-2">
        {slots.map((slot) => {
          const slotTime = new Date(slot.start);
          const timeStr = format(slotTime, 'HH:mm', { locale: ptBR });
          const isSelected = selectedSlot === slot.start;

          return (
            <Button
              key={slot.start}
              variant={isSelected ? 'default' : slot.available ? 'outline' : 'ghost'}
              className={`h-auto py-3 ${
                !slot.available
                  ? 'opacity-50 cursor-not-allowed'
                  : isSelected
                  ? 'ring-2 ring-primary'
                  : 'hover:bg-accent'
              }`}
              disabled={!slot.available}
              onClick={() => slot.available && onSelectSlot(slot.start)}
            >
              <div className="flex flex-col items-center">
                <span className="font-semibold">{timeStr}</span>
                {!slot.available && slot.reason && (
                  <span className="text-xs text-muted-foreground mt-1">
                    {slot.reason}
                  </span>
                )}
              </div>
            </Button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

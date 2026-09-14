'use client';

import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Campo de data em dd/MM/yyyy (ou dd/MM/yyyy HH:mm), sempre.
 *
 * O <input type="date"> nativo mostra o formato do idioma do NAVEGADOR
 * (mm/dd/yyyy em ingles) e nao ha como forcar pt-BR por codigo. Como data no
 * padrao brasileiro e regra da casa, o campo e nosso: texto com mascara e um
 * calendario em portugues.
 *
 * Contrato de valor igual ao do input nativo, pra trocar sem mexer nos
 * handlers: `value` e `onChange(e.target.value)` em ISO ("yyyy-MM-dd", ou
 * "yyyy-MM-ddTHH:mm" com `withTime`). Vazio = "".
 */
export interface DateInputBRProps {
  id?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  /** ISO minimo ("yyyy-MM-dd"): datas antes ficam desabilitadas no calendario. */
  min?: string;
  max?: string;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

const FORMATO_DATA = 'dd/MM/yyyy';
const FORMATO_DATA_HORA = 'dd/MM/yyyy HH:mm';
const ISO_DATA = 'yyyy-MM-dd';
const ISO_DATA_HORA = "yyyy-MM-dd'T'HH:mm";

function isoParaDate(iso: string, withTime: boolean): Date | null {
  if (!iso) return null;
  const d = parse(iso, withTime ? ISO_DATA_HORA : ISO_DATA, new Date());
  if (isValid(d)) return d;
  // Aceita ISO completo (com segundos/fuso) vindo do banco.
  const d2 = new Date(iso);
  return isValid(d2) ? d2 : null;
}

function isoParaTexto(iso: string, withTime: boolean): string {
  const d = isoParaDate(iso, withTime);
  return d ? format(d, withTime ? FORMATO_DATA_HORA : FORMATO_DATA) : '';
}

/** Aplica a mascara enquanto digita: so digitos, com / e : nos lugares certos. */
function mascarar(bruto: string, withTime: boolean): string {
  const digitos = bruto.replace(/\D/g, '').slice(0, withTime ? 12 : 8);
  const partes = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)];
  let texto = partes.filter((p, i) => p || i === 0).join('/');
  if (digitos.length < 2) texto = digitos;
  else if (digitos.length < 4) texto = `${partes[0]}/${partes[1]}`;
  else texto = `${partes[0]}/${partes[1]}/${partes[2]}`;
  if (withTime && digitos.length > 8) {
    texto += ` ${digitos.slice(8, 10)}`;
    if (digitos.length > 10) texto += `:${digitos.slice(10, 12)}`;
  }
  return texto;
}

function textoParaIso(texto: string, withTime: boolean): string | null {
  const completo = withTime ? texto.length === 16 : texto.length === 10;
  if (!completo) return null;
  const d = parse(texto, withTime ? FORMATO_DATA_HORA : FORMATO_DATA, new Date());
  if (!isValid(d)) return null;
  return format(d, withTime ? ISO_DATA_HORA : ISO_DATA);
}

export function DateInputBR({
  id,
  value,
  onChange,
  min,
  max,
  withTime = false,
  placeholder,
  className,
  disabled,
  required,
}: DateInputBRProps) {
  const [texto, setTexto] = React.useState(() => isoParaTexto(value, withTime));
  const [aberto, setAberto] = React.useState(false);

  // Valor mudou por fora (limpar filtro, carregar registro): reflete no texto.
  React.useEffect(() => {
    setTexto(isoParaTexto(value, withTime));
  }, [value, withTime]);

  const emitir = (iso: string) => onChange({ target: { value: iso } });

  const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novo = mascarar(e.target.value, withTime);
    setTexto(novo);
    if (novo === '') {
      emitir('');
      return;
    }
    const iso = textoParaIso(novo, withTime);
    if (iso) emitir(iso);
  };

  const aoSair = () => {
    // Texto incompleto ou invalido ao sair do campo: volta pro ultimo valor valido.
    if (texto && !textoParaIso(texto, withTime)) setTexto(isoParaTexto(value, withTime));
  };

  const selecionado = isoParaDate(value, withTime) ?? undefined;
  const minDate = min ? isoParaDate(min, false) : null;
  const maxDate = max ? isoParaDate(max, false) : null;

  const aoEscolherNoCalendario = (dia: Date | undefined) => {
    if (!dia) return;
    if (withTime) {
      // Mantem a hora ja digitada; sem hora, assume 09:00.
      const atual = isoParaDate(value, true);
      dia.setHours(atual ? atual.getHours() : 9, atual ? atual.getMinutes() : 0, 0, 0);
    }
    emitir(format(dia, withTime ? ISO_DATA_HORA : ISO_DATA));
    setAberto(false);
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        id={id}
        value={texto}
        onChange={aoDigitar}
        onBlur={aoSair}
        placeholder={placeholder ?? (withTime ? 'dd/mm/aaaa hh:mm' : 'dd/mm/aaaa')}
        inputMode="numeric"
        disabled={disabled}
        required={required}
        className="pr-9"
      />
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0 h-full w-9 text-muted-foreground hover:text-foreground"
            aria-label="Abrir calendário"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selecionado}
            defaultMonth={selecionado}
            onSelect={aoEscolherNoCalendario}
            disabled={(d) => (!!minDate && d < minDate) || (!!maxDate && d > maxDate)}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatMessageTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(parsedDate.getTime())) return '';
  
  if (isToday(parsedDate)) {
    return format(parsedDate, 'HH:mm', { locale: ptBR });
  }
  
  // Padrao da casa: qualquer data aparece completa, dd/MM/yyyy.
  return format(parsedDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const now = new Date();
  const msgDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(msgDate.getTime())) return '';
  
  if (isToday(msgDate)) {
    const diffMinutes = Math.floor((now.getTime() - msgDate.getTime()) / (1000 * 60));
    if (diffMinutes < 2) return 'Agora';
    if (diffMinutes < 60) return `Há ${diffMinutes}min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return 'Há 1h';
    if (diffHours < 24) return `Há ${diffHours}h`;
  }
  
  // Padrao da casa: fora de hoje, a data aparece completa, dd/MM/yyyy.
  return format(msgDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

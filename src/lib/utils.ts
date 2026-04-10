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
  
  if (isYesterday(parsedDate)) {
    return `Ontem ${format(parsedDate, 'HH:mm', { locale: ptBR })}`;
  }
  
  if (isThisYear(parsedDate)) {
    return format(parsedDate, "dd/MM 'às' HH:mm", { locale: ptBR });
  }
  
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
  
  if (isYesterday(msgDate)) {
    return `Ontem às ${format(msgDate, 'HH:mm', { locale: ptBR })}`;
  }
  
  const daysDiff = Math.floor((now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    const dayName = format(msgDate, 'EEEE', { locale: ptBR });
    const time = format(msgDate, 'HH:mm', { locale: ptBR });
    return `${dayName} às ${time}`;
  }
  
  if (isThisYear(msgDate)) {
    return format(msgDate, "dd/MM 'às' HH:mm", { locale: ptBR });
  }
  
  return format(msgDate, "dd/MM/yy 'às' HH:mm", { locale: ptBR });
}

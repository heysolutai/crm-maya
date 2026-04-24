import { memo } from 'react';
import { StickyNote } from 'lucide-react';
import { formatMessageTime } from '@/lib/utils';

export interface NoteItem {
  id: string;
  note: string;
  created_at: string | null;
  creator?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface NoteBubbleProps {
  note: NoteItem;
}

export const NoteBubble = memo(function NoteBubble({ note }: NoteBubbleProps) {
  const authorName = note.creator?.full_name?.trim();
  const time = note.created_at ? formatMessageTime(note.created_at) : '';

  return (
    <div className="flex justify-center my-2 px-4">
      <div className="max-w-[75%] bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/60 rounded-md px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 mb-0.5">
          <StickyNote className="h-3 w-3" />
          <span>Nota interna{authorName ? ` — ${authorName}` : ''}</span>
          {time && <span className="ml-auto opacity-70">{time}</span>}
        </div>
        <p className="text-sm text-amber-950 dark:text-amber-100 whitespace-pre-wrap break-words">
          {note.note}
        </p>
      </div>
    </div>
  );
});

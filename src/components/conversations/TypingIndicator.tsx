import type { TypingAgent } from './types';

interface TypingIndicatorProps {
  typingAgents: TypingAgent[];
}

export function TypingIndicator({ typingAgents }: TypingIndicatorProps) {
  if (typingAgents.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t bg-muted/30">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex gap-1">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
        </div>
        <span>
          {typingAgents.length === 1
            ? `${typingAgents[0].userName} está digitando...`
            : `${typingAgents.length} agentes estão digitando...`}
        </span>
      </div>
    </div>
  );
}

import { useAuth } from "@/hooks/useAuth";
import type { Reaction } from "@/hooks/useMessageReactions";

interface MessageReactionsProps {
  messageId: string;
  reactions?: Reaction[];
  onRemoveReaction?: (messageId: string) => void;
}

export const MessageReactions = ({ messageId, reactions, onRemoveReaction }: MessageReactionsProps) => {
  const { user } = useAuth();

  if (!reactions || reactions.length === 0) return null;

  // Agrupar reações por emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        count: 0,
        users: [],
        hasUserReacted: false,
      };
    }
    acc[reaction.emoji].count++;
    acc[reaction.emoji].users.push(reaction.users?.full_name || 'Usuário');
    if (reaction.user_id === user?.id) {
      acc[reaction.emoji].hasUserReacted = true;
    }
    return acc;
  }, {} as Record<string, { count: number; users: string[]; hasUserReacted: boolean }>);

  type ReactionGroup = { count: number; users: string[]; hasUserReacted: boolean };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(groupedReactions).map(([emoji, data]: [string, ReactionGroup]) => (
        <button
          key={emoji}
          onClick={() => {
            if (data.hasUserReacted && onRemoveReaction) {
              onRemoveReaction(messageId);
            }
          }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
            data.hasUserReacted
              ? 'bg-primary/10 border-2 border-primary'
              : 'bg-muted border border-border'
          } hover:scale-110 transition-transform cursor-pointer`}
          title={data.users.join(', ')}
        >
          <span className="text-sm">{emoji}</span>
          <span className="text-xs font-medium">{data.count}</span>
        </button>
      ))}
    </div>
  );
};

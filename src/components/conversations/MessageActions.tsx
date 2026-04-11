import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Reply, Trash2, Copy, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ReactionPicker } from "./ReactionPicker";

interface MessageActionsProps {
  messageId: string;
  messageText: string;
  onReply: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onForward?: () => void;
  isClient?: boolean;
}

export const MessageActions = ({
  messageText,
  onReply,
  onDelete,
  onReact,
  onForward,
}: MessageActionsProps) => {
  const handleCopy = () => {
    if (!messageText) return;
    navigator.clipboard.writeText(messageText);
    toast({
      title: "Texto copiado",
      description: "O texto da mensagem foi copiado para a área de transferência.",
    });
  };

  return (
    <div className="flex items-center gap-1">
      <ReactionPicker onReactionSelect={onReact} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-60 hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onReply}>
            <Reply className="h-4 w-4 mr-2" />
            Responder
          </DropdownMenuItem>
          {onForward && (
            <DropdownMenuItem onClick={onForward}>
              <Forward className="h-4 w-4 mr-2" />
              Encaminhar
            </DropdownMenuItem>
          )}
          {messageText && (
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Apagar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const ReactionPicker = ({ onReactionSelect }: ReactionPickerProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReactionSelect(emoji)}
              className="text-2xl hover:scale-125 transition-transform p-1 rounded hover:bg-accent"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

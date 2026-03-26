import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

interface ClientTagManagerProps {
  tags: string[];
  onChange: (newTags: string[]) => void;
}

const PREDEFINED_TAGS = [
  "VIP",
  "Interessado",
  "Follow-up",
  "Urgente",
  "Qualificado",
  "Negociação",
  "Aguardando",
];

export function ClientTagManager({ tags, onChange }: ClientTagManagerProps) {
  const [newTag, setNewTag] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);

  const handleAddTag = (tag: string) => {
    if (tag.trim() && !tags.includes(tag.trim())) {
      onChange([...tags, tag.trim()]);
      setNewTag("");
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="space-y-3">
      {/* Current Tags */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        {!isAddingTag && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingTag(true)}
            className="h-6"
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {/* Add Tag Form */}
      {isAddingTag && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Nome da tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTag(newTag);
                if (e.key === "Escape") setIsAddingTag(false);
              }}
              autoFocus
              className="h-8"
            />
            <Button 
              onClick={() => handleAddTag(newTag)} 
              size="sm"
              disabled={!newTag.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => {
                setIsAddingTag(false);
                setNewTag("");
              }} 
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Predefined Tags */}
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_TAGS.filter(tag => !tags.includes(tag)).map((tag) => (
              <Button
                key={tag}
                variant="outline"
                size="sm"
                onClick={() => handleAddTag(tag)}
                className="h-6 text-xs"
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

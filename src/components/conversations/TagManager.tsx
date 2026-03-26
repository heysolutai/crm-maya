import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

interface TagManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentTags: string[];
  onAddTag: (params: { conversationId: string; tag: string }) => void;
  onRemoveTag: (params: { conversationId: string; tag: string }) => void;
}

const PREDEFINED_TAGS = [
  { name: "Interessado", color: "bg-green-500" },
  { name: "Aguardando Resposta", color: "bg-yellow-500" },
  { name: "Orçamento Enviado", color: "bg-blue-500" },
  { name: "Follow-up", color: "bg-purple-500" },
  { name: "Urgente", color: "bg-red-500" },
  { name: "Qualificado", color: "bg-gray-500" },
  { name: "Negociação", color: "bg-orange-500" },
];

export function TagManager({
  open,
  onOpenChange,
  conversationId,
  currentTags,
  onAddTag,
  onRemoveTag,
}: TagManagerProps) {
  const [newTag, setNewTag] = useState("");

  const handleAddCustomTag = () => {
    if (newTag.trim() && !currentTags.includes(newTag.trim())) {
      onAddTag({ conversationId, tag: newTag.trim() });
      setNewTag("");
    }
  };

  const handleAddPredefinedTag = (tagName: string) => {
    if (!currentTags.includes(tagName)) {
      onAddTag({ conversationId, tag: tagName });
    }
  };

  const handleRemoveTag = (tag: string) => {
    onRemoveTag({ conversationId, tag });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Etiquetas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Tags */}
          <div>
            <h4 className="text-sm font-medium mb-2">Etiquetas atuais</h4>
            {currentTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {currentTags.map((tag) => (
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma etiqueta adicionada</p>
            )}
          </div>

          {/* Add Custom Tag */}
          <div>
            <h4 className="text-sm font-medium mb-2">Criar nova etiqueta</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Nome da etiqueta"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
              />
              <Button onClick={handleAddCustomTag} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Predefined Tags */}
          <div>
            <h4 className="text-sm font-medium mb-2">Etiquetas sugeridas</h4>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map((tag) => (
                <Button
                  key={tag.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddPredefinedTag(tag.name)}
                  disabled={currentTags.includes(tag.name)}
                  className="gap-2"
                >
                  <span className={`h-2 w-2 rounded-full ${tag.color}`} />
                  {tag.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

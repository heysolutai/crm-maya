import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAiAgents, type AiAgent } from '@/hooks/useAiAgents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import { Bot, Plus, Trash2, Loader2, Pencil } from 'lucide-react';

export default function AiAgents() {
  const router = useRouter();
  const {
    aiAgents,
    isLoading,
    createAiAgent,
    updateAiAgent,
    deleteAiAgent,
    isCreating,
    isUpdating,
    isDeleting,
  } = useAiAgents();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiAgent | null>(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createAiAgent(
      { name: newName.trim() },
      {
        onSuccess: (agent: AiAgent) => {
          setCreateOpen(false);
          setNewName('');
          router.push(`/app/ai-agents/${agent.id}`);
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editTarget || !editName.trim()) return;
    updateAiAgent(
      { id: editTarget.id, name: editName.trim() },
      {
        onSuccess: () => {
          setEditTarget(null);
          setEditName('');
        },
      }
    );
  };

  const openEdit = (agent: AiAgent) => {
    setEditTarget(agent);
    setEditName(agent.name);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-7 w-7" />
            Agentes IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure os agentes IA que respondem automaticamente nas caixas de entrada
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo agente IA
        </Button>
      </div>

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : aiAgents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Nenhum agente IA cadastrado"
          description="Crie um agente IA e vincule a uma ou mais caixas de entrada."
          actionLabel="Criar agente IA"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {aiAgents.map((agent) => (
            <Card
              key={agent.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group relative"
              onClick={() => router.push(`/app/ai-agents/${agent.id}`)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.is_active ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(agent);
                      }}
                      aria-label="Renomear agente IA"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ open: true, id: agent.id });
                      }}
                      aria-label="Remover agente IA"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: criar */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewName(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo agente IA</DialogTitle>
            <DialogDescription>
              Crie um agente IA reutilizável. Os prompts e configurações são editados na página do agente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ai-agent-name">Nome</Label>
            <Input
              id="ai-agent-name"
              placeholder="Ex: Atendimento Padrão"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: renomear */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) { setEditTarget(null); setEditName(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear agente IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ai-agent-edit-name">Nome</Label>
            <Input
              id="ai-agent-edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={!editName.trim() || isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })
        }
        title="Remover agente IA"
        description="O agente será removido. As caixas de entrada que o usavam ficarão sem agente IA até serem reconfiguradas."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm.id) {
            deleteAiAgent(deleteConfirm.id);
            setDeleteConfirm({ open: false, id: null });
          }
        }}
      />
    </div>
  );
}

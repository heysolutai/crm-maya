import { useState, useEffect, useMemo } from "react";
import { useClients } from "@/hooks/useClients";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Search, X, Plus } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { DroppableStageColumn } from "@/components/crm/DroppableStageColumn";
import DraggableClientCard from "@/components/crm/DraggableClientCard";
import { ClientDetailSheet } from "@/components/crm/ClientDetailSheet";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ClientWithStage {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  stage_id?: string;
  tags?: string[];
  created_at?: string;
  source?: string;
  next_appointment?: string;
  total_appointments?: number;
  total_sales?: number;
  total_revenue?: number;
}

export default function CRM() {
  const { clients, loading: loadingClients, moveClientToStage, createClient, updateClient, deleteClient, fetchClients } = useClients();
  const { stages, loading: loadingStages } = useFunnelStages();
  const [clientsByStage, setClientsByStage] = useState<Record<string, ClientWithStage[]>>({});
  const [activeClient, setActiveClient] = useState<ClientWithStage | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithStage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; clientId: string | null }>({
    open: false,
    clientId: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
  );

  useEffect(() => {
    if (!clients || !stages) return;

    const grouped: Record<string, ClientWithStage[]> = {};
    stages.forEach((stage) => {
      grouped[stage.id] = [];
    });

    clients.forEach((client) => {
      const stageId = (client as any).stage_id || stages[0]?.id;
      if (stageId && grouped[stageId]) {
        grouped[stageId].push(client as ClientWithStage);
      }
    });

    setClientsByStage(grouped);
  }, [clients, stages]);

  const filteredClientsByStage = useMemo(() => {
    if (!searchTerm.trim()) return clientsByStage;
    
    const term = searchTerm.toLowerCase();
    const filtered: Record<string, ClientWithStage[]> = {};
    
    Object.entries(clientsByStage).forEach(([stageId, stageClients]) => {
      filtered[stageId] = stageClients.filter(client => 
        client.first_name?.toLowerCase().includes(term) ||
        client.last_name?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.includes(term) ||
        client.tags?.some(tag => tag.toLowerCase().includes(term))
      );
    });
    
    return filtered;
  }, [clientsByStage, searchTerm]);

  const handleDragStart = (event: DragStartEvent) => {
    const clientId = event.active.id as string;
    const client = clients?.find((c) => c.id === clientId);
    if (client) {
      setActiveClient(client as ClientWithStage);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveClient(null);

    if (!over || active.id === over.id) return;

    const clientId = active.id as string;
    const targetStageId = over.id as string;

    try {
      await moveClientToStage(clientId, targetStageId);

      toast({
        title: "Cliente movido",
        description: "Cliente movido para novo stage com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao mover cliente",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loadingStages || loadingClients) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const handleCreateClient = async (data: any) => {
    await createClient(data);
    fetchClients();
  };

  const handleEditClientFromMenu = (client: ClientWithStage) => {
    setEditingClient(client);
  };

  const handleUpdateClient = async (data: any) => {
    if (editingClient) {
      await updateClient(editingClient.id, data);
      fetchClients();
      setEditingClient(null);
    }
  };

  const handleDeleteClient = async () => {
    if (deleteConfirm.clientId) {
      await deleteClient(deleteConfirm.clientId);
      fetchClients();
      setDeleteConfirm({ open: false, clientId: null });
    }
  };

  const handleMoveClient = async (clientId: string, stageId: string) => {
    try {
      await moveClientToStage(clientId, stageId);
      toast({
        title: "Cliente movido",
        description: "Cliente movido para novo stage com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao mover cliente",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM - Funil de Vendas</h1>
          <p className="text-muted-foreground">Gerencie seu pipeline de vendas</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <DroppableStageColumn
              key={stage.id}
              stage={stage}
              stages={stages}
              clients={filteredClientsByStage[stage.id] || []}
              onClientClick={(id) => setSelectedClientId(id)}
              onEditClient={handleEditClientFromMenu}
              onDeleteClient={(id) => setDeleteConfirm({ open: true, clientId: id })}
              onMoveClient={handleMoveClient}
            />
          ))}
        </div>

        <DragOverlay 
          dropAnimation={null} 
          style={{ 
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {activeClient && <DraggableClientCard client={activeClient} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <ClientDetailSheet
        clientId={selectedClientId}
        isOpen={selectedClientId !== null}
        onClose={() => setSelectedClientId(null)}
      />

      <ClientFormDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        stages={stages}
        onSave={handleCreateClient}
      />

      <ClientFormDialog
        isOpen={editingClient !== null}
        onClose={() => setEditingClient(null)}
        client={editingClient}
        stages={stages}
        onSave={handleUpdateClient}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, clientId: open ? deleteConfirm.clientId : null })}
        title="Excluir Cliente"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteClient}
      />

      {stages.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhuma stage configurada. Configure seu funil em Configurações.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

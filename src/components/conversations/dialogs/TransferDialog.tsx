import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getInitials, type TeamMember } from '../types';
import type { Department } from '@/hooks/useDepartments';

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[] | undefined;
  departments: Department[] | undefined;
  onlineUserIds: string[];
  queueCounts?: Record<string, number>;
  onTransfer: (userId: string) => void;
  onTransferToDepartment: (departmentId: string) => void;
}

export function TransferDialog({
  open,
  onOpenChange,
  teamMembers,
  departments,
  onlineUserIds,
  onTransfer,
  onTransferToDepartment,
  queueCounts = {},
}: TransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Conversa</DialogTitle>
          <DialogDescription>
            Selecione um agente ou departamento
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="agents">
          <TabsList className="w-full">
            <TabsTrigger value="agents" className="flex-1">Agentes</TabsTrigger>
            <TabsTrigger value="departments" className="flex-1">Departamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {teamMembers
                ?.filter(member => member.is_active)
                .sort((a, b) => {
                  const aOnline = onlineUserIds.includes(a.id) ? 0 : 1;
                  const bOnline = onlineUserIds.includes(b.id) ? 0 : 1;
                  return aOnline - bOnline;
                })
                .map((member) => {
                  const isOnline = onlineUserIds.includes(member.id);
                  return (
                    <Button
                      key={member.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        onTransfer(member.id);
                        onOpenChange(false);
                      }}
                    >
                      <div className="relative mr-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                            isOnline ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {isOnline ? 'Online' : 'Offline'}
                        </div>
                      </div>
                    </Button>
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="departments" className="mt-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {departments && departments.length > 0 ? (
                departments.map((dept) => {
                  const memberIds = dept.department_members?.map(m => m.user_id) || [];
                  const onlineCount = memberIds.filter(id => onlineUserIds.includes(id)).length;
                  const totalMembers = memberIds.length;

                  return (
                    <Button
                      key={dept.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        onTransferToDepartment(dept.id);
                        onOpenChange(false);
                      }}
                    >
                      <div
                        className="h-3 w-3 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: dept.color }}
                      />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{dept.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {onlineCount}/{totalMembers} online
                        </div>
                      </div>
                      {onlineCount === 0 ? (
                        <Badge variant="secondary" className="text-xs ml-2">
                          Fila{(queueCounts[dept.id] || 0) > 0 ? ` (${queueCounts[dept.id]})` : ''}
                        </Badge>
                      ) : (queueCounts[dept.id] || 0) > 0 ? (
                        <Badge variant="outline" className="text-xs ml-2 text-yellow-600 border-yellow-500/50">
                          {queueCounts[dept.id]} aguardando
                        </Badge>
                      ) : null}
                    </Button>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum departamento cadastrado
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

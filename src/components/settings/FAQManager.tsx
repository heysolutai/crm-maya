import { useState, useRef } from 'react';
import { useFAQs, FAQ, CreateFAQData } from '@/hooks/useFAQs';
import { useFAQUpload, ProcessingStatus } from '@/hooks/useFAQUpload';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Progress } from '@/components/ui/progress';
import { Plus, Trash2, Pencil, GripVertical, RefreshCw, Loader2, Database, HelpCircle, Upload, CheckCircle, XCircle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FAQManagerProps {
  companyId: string | undefined;
}

interface SortableFAQItemProps {
  faq: FAQ;
  onEdit: (faq: FAQ) => void;
  onDelete: (id: string) => void;
  isSelected: boolean;
  onSelectChange: (id: string, selected: boolean) => void;
}

function SortableFAQItem({ faq, onEdit, onDelete, isSelected, onSelectChange }: SortableFAQItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: faq.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-card"
    >
      <div className="flex items-start gap-3">
        <button
          className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        
        <div className="flex items-center mt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange(faq.id, !!checked)}
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium truncate">{faq.question}</span>
            {faq.category && (
              <Badge variant="secondary" className="shrink-0">{faq.category}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{faq.answer}</p>
          {faq.keywords && faq.keywords.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {faq.keywords.map((keyword, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">{keyword}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onEdit(faq)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(faq.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FAQManager({ companyId }: FAQManagerProps) {
  const {
    faqs,
    isLoading,
    createFAQ,
    updateFAQ,
    deleteFAQ,
    deleteManyFAQs,
    reorderFAQs,
    syncToKnowledgeBase,
    isCreating,
    isUpdating,
    isDeletingMany,
    isSyncing,
  } = useFAQs(companyId);

  const { configurations } = useAIConfigurations(companyId);
  const activeConfig = configurations?.find(c => c.is_active);
  const knowledgeName = activeConfig?.knowledge;

  const { 
    uploadFAQFile, 
    isUploading, 
    isProcessing,
    processingStatus,
    uploadProgress, 
    resetStatus 
  } = useFAQUpload(companyId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [deleteManyConfirm, setDeleteManyConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState<CreateFAQData>({
    question: '',
    answer: '',
    keywords: [],
    category: '',
  });

  const handleSelectChange = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === faqs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(faqs.map(f => f.id)));
    }
  };

  const handleDeleteSelected = () => {
    deleteManyFAQs(Array.from(selectedIds));
    setSelectedIds(new Set());
    setDeleteManyConfirm(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadFAQFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  const [keywordsInput, setKeywordsInput] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = faqs.findIndex((f) => f.id === active.id);
      const newIndex = faqs.findIndex((f) => f.id === over.id);
      const newOrder = arrayMove(faqs, oldIndex, newIndex);
      reorderFAQs(newOrder.map((f) => f.id));
    }
  };

  const resetForm = () => {
    setFormData({ question: '', answer: '', keywords: [], category: '' });
    setKeywordsInput('');
  };

  const openEditDialog = (faq: FAQ) => {
    setEditingFAQ(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords || [],
      category: faq.category || '',
    });
    setKeywordsInput(faq.keywords?.join(', ') || '');
  };

  const handleSubmit = () => {
    const keywords = keywordsInput
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (editingFAQ) {
      updateFAQ({
        id: editingFAQ.id,
        updates: { ...formData, keywords },
      });
      setEditingFAQ(null);
    } else {
      createFAQ({ ...formData, keywords });
      setIsCreateDialogOpen(false);
    }
    resetForm();
  };

  const handleDelete = () => {
    if (deleteConfirm.id) {
      deleteFAQ(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Perguntas Frequentes (FAQ)
              </CardTitle>
              <CardDescription>
                Configure perguntas e respostas para a IA responder automaticamente
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".csv,.xlsx,.xls,.json,.txt,.pdf"
                onChange={handleFileUpload}
              />

              {/* Sync Button */}
              <Button
                variant="outline"
                onClick={() => syncToKnowledgeBase()}
                disabled={isSyncing || faqs.length === 0}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar
              </Button>
              
              {/* Upload Button */}
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar Arquivo
              </Button>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar FAQ
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nova FAQ</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="question">Pergunta *</Label>
                    <Input
                      id="question"
                      placeholder="Ex: Qual o horário de funcionamento?"
                      value={formData.question}
                      onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="answer">Resposta *</Label>
                    <Textarea
                      id="answer"
                      placeholder="Digite a resposta que a IA deve dar..."
                      rows={4}
                      value={formData.answer}
                      onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria (opcional)</Label>
                    <Input
                      id="category"
                      placeholder="Ex: Horários, Pagamentos, Agendamentos"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="keywords">Palavras-chave (opcional)</Label>
                    <Input
                      id="keywords"
                      placeholder="Ex: horário, funcionamento, aberto (separadas por vírgula)"
                      value={keywordsInput}
                      onChange={(e) => setKeywordsInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Separe as palavras-chave por vírgula
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSubmit}
                    disabled={!formData.question || !formData.answer || isCreating}
                  >
                    {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar FAQ
                  </Button>
                </DialogFooter>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Upload/Processing Status Card */}
          {(isUploading || isProcessing || processingStatus === 'success' || processingStatus === 'error') && (
            <Card className="mt-4 border-primary/20 bg-muted/30">
              <CardContent className="pt-4 pb-4">
                {/* Estado: Enviando */}
                {isUploading && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <div className="flex-1">
                        <span className="font-medium">Enviando arquivo...</span>
                        <p className="text-sm text-muted-foreground">
                          Aguarde enquanto fazemos o upload do seu arquivo
                        </p>
                      </div>
                      <span className="text-sm font-medium">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}

                {/* Estado: Processando */}
                {isProcessing && !isUploading && (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                    <div>
                      <span className="font-medium">Aguarde um minuto...</span>
                      <p className="text-sm text-muted-foreground">
                        Estamos processando suas perguntas e respostas
                      </p>
                    </div>
                  </div>
                )}

                {/* Estado: Sucesso */}
                {processingStatus === 'success' && !isProcessing && !isUploading && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <span className="font-medium text-green-700 dark:text-green-400">Concluído!</span>
                        <p className="text-sm text-muted-foreground">
                          Suas FAQs foram processadas. Sincronize para atualizar a IA.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          syncToKnowledgeBase();
                          resetStatus();
                        }}
                        disabled={isSyncing}
                      >
                        {isSyncing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sincronizar Agora
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={resetStatus}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Estado: Erro */}
                {processingStatus === 'error' && !isProcessing && !isUploading && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <XCircle className="h-5 w-5 text-destructive" />
                      <div>
                        <span className="font-medium text-destructive">Erro ao processar</span>
                        <p className="text-sm text-muted-foreground">
                          Não foi possível processar o arquivo. Tente novamente.
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={resetStatus}
                    >
                      Fechar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Knowledge Base Status */}
          {knowledgeName && (
            <div className="flex items-center gap-2 mt-2">
              <Database className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                Knowledge Base: <Badge variant="outline">{knowledgeName}</Badge>
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Checkbox
                checked={selectedIds.size === faqs.length}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm font-medium">
                {selectedIds.size} selecionada(s)
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteManyConfirm(true)}
                disabled={isDeletingMany}
              >
                {isDeletingMany ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Excluir Selecionadas
              </Button>
            </div>
          )}

          {faqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma FAQ cadastrada</p>
              <p className="text-sm">Adicione perguntas e respostas para a IA usar</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={faqs.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                  {faqs.map((faq) => (
                    <SortableFAQItem
                      key={faq.id}
                      faq={faq}
                      onEdit={openEditDialog}
                      onDelete={(id) => setDeleteConfirm({ open: true, id })}
                      isSelected={selectedIds.has(faq.id)}
                      onSelectChange={handleSelectChange}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingFAQ} onOpenChange={(open) => !open && setEditingFAQ(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar FAQ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-question">Pergunta *</Label>
              <Input
                id="edit-question"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-answer">Resposta *</Label>
              <Textarea
                id="edit-answer"
                rows={4}
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoria</Label>
              <Input
                id="edit-category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-keywords">Palavras-chave</Label>
              <Input
                id="edit-keywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!formData.question || !formData.answer || isUpdating}
            >
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Single Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir FAQ"
        description="Tem certeza que deseja excluir esta FAQ? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Delete Many Confirmation */}
      <ConfirmDialog
        open={deleteManyConfirm}
        onOpenChange={setDeleteManyConfirm}
        title="Excluir FAQs Selecionadas"
        description={`Tem certeza que deseja excluir ${selectedIds.size} FAQ(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir Todas"
        onConfirm={handleDeleteSelected}
        variant="destructive"
        isLoading={isDeletingMany}
      />
    </>
  );
}

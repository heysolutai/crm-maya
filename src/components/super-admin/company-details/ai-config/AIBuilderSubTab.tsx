import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Sparkles } from 'lucide-react';
import { AIBuilderChatDialog } from './AIBuilderChatDialog';

interface AIBuilderSubTabProps {
  companyId: string;
}

export function AIBuilderSubTab({ companyId }: AIBuilderSubTabProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Criar Agente IA
          </CardTitle>
          <CardDescription>
            Crie um agente de IA personalizado respondendo perguntas em um chat interativo. 
            O assistente vai te guiar por todas as configurações necessárias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setOpen(true)} size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Iniciar Criação do Agente
          </Button>
        </CardContent>
      </Card>

      <AIBuilderChatDialog open={open} onOpenChange={setOpen} companyId={companyId} />
    </>
  );
}

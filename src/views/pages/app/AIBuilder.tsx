import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, User, Target, Workflow, BookOpen, Clock, Sparkles, Loader2, AlertCircle, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAIBuilder } from '@/hooks/useAIBuilder';
import { Separator } from '@/components/ui/separator';

const PROMPT_SECTIONS = [
  {
    key: 'papel',
    label: 'Papel (Persona)',
    icon: User,
    description: 'Defina quem é o agente: nome, personalidade, tom de voz, como ele se apresenta.',
    placeholder: `Exemplo:
Você é a Sofia, assistente virtual da Cantina da Nonna.
Você é simpática, prestativa e objetiva.
Sempre se apresente pelo nome na primeira interação.
Use linguagem casual mas profissional.
Trate o cliente por "você".`,
    rows: 8,
  },
  {
    key: 'objetivo',
    label: 'Objetivo',
    icon: Target,
    description: 'Qual é a missão principal do agente? O que ele deve buscar em cada conversa?',
    placeholder: `Exemplo:
Seu objetivo principal é transformar conversas em reservas.
Sempre entenda o que o cliente procura (data, horário, número de pessoas, ocasião).
Se o cliente demonstrar interesse, colete nome e telefone e confirme a reserva.
Nunca deixe uma conversa sem um próximo passo definido.`,
    rows: 6,
  },
  {
    key: 'funcao',
    label: 'Função',
    icon: Bot,
    description: 'O que o agente faz na prática? Quais ações ele pode executar?',
    placeholder: `Exemplo:
- Responder dúvidas sobre o cardápio e preços
- Fazer, alterar e cancelar reservas
- Enviar o cardápio
- Coletar dados do cliente (nome, telefone)
- Transferir para atendente humano quando necessário
- Enviar a localização do restaurante`,
    rows: 8,
  },
  {
    key: 'funil',
    label: 'Funil de Atendimento',
    icon: Workflow,
    description: 'Defina as etapas do funil: como o agente conduz a conversa do início ao fechamento.',
    placeholder: `Exemplo:
ETAPA 1 - BOAS-VINDAS:
Cumprimente o cliente, pergunte como pode ajudar.

ETAPA 2 - QUALIFICAÇÃO:
Entenda o que o cliente precisa. Faça perguntas como:
- "Para quantas pessoas seria a reserva?"
- "Qual dia e horário você prefere?"

ETAPA 3 - APRESENTAÇÃO:
Apresente as opções disponíveis (salão, varanda, menu do dia).
Destaque pratos especiais e diferenciais da casa.

ETAPA 4 - FECHAMENTO:
Confirme a reserva com data, horário e número de pessoas.
Colete dados para contato.

ETAPA 5 - PÓS-VISITA:
Agradeça a visita e peça uma avaliação.`,
    rows: 16,
  },
  {
    key: 'regras',
    label: 'Regras de Negócio',
    icon: BookOpen,
    description: 'Regras que o agente DEVE seguir. Limites, restrições, políticas do restaurante.',
    placeholder: `Exemplo:
- NUNCA invente pratos ou preços que não estão no cardápio
- Reservas para grupos acima de 12 pessoas: transferir para o gerente
- Sempre confirme disponibilidade antes de prometer a mesa
- Se o cliente reclamar, peça desculpas e ofereça transferência para o gerente
- Formas de pagamento: PIX, cartão de crédito e débito, vale-refeição
- Taxa de serviço opcional de 10%`,
    rows: 10,
  },
  {
    key: 'regras_horarios',
    label: 'Regras de Horários',
    icon: Clock,
    description: 'Horários de funcionamento, regras para fora do expediente, agendamentos.',
    placeholder: `Exemplo:
HORÁRIO DE FUNCIONAMENTO:
- Terça a Sexta: 11:30 às 15:00 e 18:30 às 23:00
- Sábado e Domingo: 11:30 às 23:30
- Segunda: Fechado

FORA DO HORÁRIO:
- Informe o horário de funcionamento
- Colete nome e telefone do cliente
- Diga que a equipe retorna no próximo horário de atendimento

RESERVAS:
- Horários para reserva: 12:00 às 14:00 e 19:00 às 22:00
- Antecedência mínima: 2 horas
- Tolerância de atraso: 15 minutos`,
    rows: 12,
  },
  {
    key: 'boas_vindas',
    label: 'Mensagem de Boas-vindas',
    icon: Sparkles,
    description: 'A primeira mensagem que o agente envia quando um novo cliente inicia conversa.',
    placeholder: `Exemplo:
Olá! 👋 Sou a Sofia, assistente virtual da Cantina da Nonna!

Posso te ajudar com reservas, cardápio e qualquer dúvida sobre o restaurante. 😊

Como posso te ajudar hoje?`,
    rows: 6,
  },
];

export default function AIBuilder() {
  const { webhookUrl, isLoadingWebhook, isSubmitting, submitToWebhook } = useAIBuilder();

  const [sections, setSections] = useState<Record<string, string>>({
    papel: '',
    objetivo: '',
    funcao: '',
    funil: '',
    regras: '',
    regras_horarios: '',
    boas_vindas: '',
  });

  const [companyName, setCompanyName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [segment, setSegment] = useState('');

  const updateSection = (key: string, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
  };

  const filledSections = Object.values(sections).filter((v) => v.trim()).length;
  const isValid = companyName && agentName && filledSections >= 1;

  const handleSubmit = async () => {
    if (!isValid) return;
    await submitToWebhook({
      company_name: companyName,
      agent_name: agentName,
      segment,
      products_services: '',
      agent_objective: '',
      tone: '',
      use_emojis: true,
      business_hours: '',
      payment_methods: '',
      differentials: '',
      specific_rules: '',
      welcome_message: '',
      extra_info: '',
      ...sections,
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          Criar Agente IA
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure cada seção do prompt do agente. Quanto mais detalhado, melhor o resultado.
        </p>
      </div>

      {!isLoadingWebhook && !webhookUrl && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Webhook N8N não configurado para este restaurante. Configure o campo <strong>n8n_webhook_url</strong> nas configurações de IA.
          </AlertDescription>
        </Alert>
      )}

      {/* Identificação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identificação</CardTitle>
          <CardDescription>Dados básicos para contextualizar o agente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Nome do restaurante *</Label>
              <Input placeholder="Ex: Cantina da Nonna" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome do agente *</Label>
              <Input placeholder="Ex: Sofia" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input placeholder="Ex: Italiana, Pizzaria, Bistrô" value={segment} onChange={(e) => setSegment(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Prompt Sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Seções do Prompt</h2>
          <span className="text-sm text-muted-foreground">{filledSections}/{PROMPT_SECTIONS.length} preenchidas</span>
        </div>

        {PROMPT_SECTIONS.map((section) => {
          const Icon = section.icon;
          const hasContent = sections[section.key]?.trim();
          return (
            <Card key={section.key} className={hasContent ? 'border-primary/30' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className={`h-4 w-4 ${hasContent ? 'text-primary' : 'text-muted-foreground'}`} />
                  {section.label}
                  {hasContent && <span className="text-xs text-primary font-normal">✓ preenchido</span>}
                </CardTitle>
                <CardDescription className="text-xs">{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder={section.placeholder}
                  rows={section.rows}
                  value={sections[section.key]}
                  onChange={(e) => updateSection(section.key, e.target.value)}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pb-8">
        <p className="text-sm text-muted-foreground">
          Os dados serão enviados ao N8N para geração do agente.
        </p>
        <Button size="lg" onClick={handleSubmit} disabled={!isValid || isSubmitting || !webhookUrl} className="gap-2">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSubmitting ? 'Enviando...' : 'Enviar para Geração'}
        </Button>
      </div>
    </div>
  );
}

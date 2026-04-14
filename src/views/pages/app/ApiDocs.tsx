'use client';

import { useState } from 'react';
import { ApiEndpointCard } from '@/components/api-docs/ApiEndpointCard';
import { ApiSection } from '@/components/api-docs/ApiSection';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  MessageSquare,
  Phone,
  Users,
  Bot,
  Shield,
  BarChart3,
  HelpCircle,
  KeyRound,
  AlertTriangle,
  Copy,
  Check,
  BookOpen,
  Zap,
  Settings,
} from 'lucide-react';

export default function ApiDocs() {
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.com';

  const [copied, setCopied] = useState(false);
  const copyBaseUrl = async () => {
    try {
      await navigator.clipboard.writeText(baseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const navSections = [
    {
      title: 'Geral',
      items: [
        { id: 'autenticacao', label: 'Autenticação', icon: KeyRound },
        { id: 'codigos-erro', label: 'Códigos de Erro', icon: AlertTriangle },
      ],
    },
    {
      title: 'Endpoints',
      items: [
        { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
        { id: 'messages', label: 'Mensagens', icon: MessageSquare },
        { id: 'appointments', label: 'Agendamentos', icon: Calendar },
        { id: 'faq', label: 'FAQ / Knowledge', icon: HelpCircle },
        { id: 'ai', label: 'IA / Configuração', icon: Bot },
        { id: 'calendar', label: 'Google Calendar', icon: Calendar },
        { id: 'reports', label: 'Relatórios', icon: BarChart3 },
        { id: 'company', label: 'Empresa / Usuários', icon: Users },
        { id: 'admin', label: 'Admin', icon: Shield },
      ],
    },
  ];

  const errorCodes = [
    { code: 400, description: 'Dados inválidos no body ou query params' },
    { code: 401, description: 'Não autenticado — Token ausente ou inválido' },
    { code: 403, description: 'Sem permissão para este recurso' },
    { code: 404, description: 'Recurso não encontrado' },
    { code: 422, description: 'Erro de validação nos dados enviados' },
    { code: 429, description: 'Rate limit excedido — muitas requisições' },
    { code: 500, description: 'Erro interno do servidor' },
    { code: 503, description: 'Serviço indisponível ou não configurado' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border/50 bg-card/50 hidden lg:block sticky top-0 h-screen">
          <ScrollArea className="h-full py-6 px-4">
            <div className="flex items-center gap-2 px-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-none">
                  <span className="text-foreground">API</span>{' '}
                  <span className="text-red-400">Docs</span>
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Maya CRM — v2.0</p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {navSections.map((section) => (
                <div key={section.title}>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">
                    {section.title}
                  </h4>
                  <nav className="space-y-0.5">
                    {section.items.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <item.icon className="h-3.5 w-3.5 text-red-400/70" />
                        <span className="truncate">{item.label}</span>
                      </a>
                    ))}
                  </nav>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-12 space-y-12">
            {/* Hero */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
                <Zap className="h-3.5 w-3.5" />
                REST API
              </div>
              <h1 className="text-5xl font-bold tracking-tight">
                <span className="text-foreground">API </span>
                <span className="text-red-400">Documentation</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Referência completa da API REST do Maya CRM. Todas as respostas são em JSON.
                Autenticação via Bearer Token (session) ou x-api-key conforme indicado em cada endpoint.
              </p>

              {/* Base URL */}
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-4 py-3 max-w-2xl">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Base URL:
                </span>
                <code className="flex-1 text-sm font-mono text-red-400 truncate">{baseUrl}</code>
                <button
                  type="button"
                  onClick={copyBaseUrl}
                  className="shrink-0 h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
                  title="Copiar"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* Autenticação */}
            <section id="autenticacao" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="text-2xl font-bold">Autenticação</h2>
              </div>
              <p className="text-muted-foreground">
                Rotas protegidas exigem autenticação via sessão NextAuth (cookies) ou API Key no header.
              </p>
              <div className="rounded-lg border border-border/50 bg-card/40 p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <KeyRound className="h-4 w-4 text-red-400" />
                    <h4 className="font-semibold text-sm">Header obrigatório</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Inclua o token no header de todas as requisições autenticadas:
                  </p>
                  <pre className="rounded-md bg-background/80 border border-border/50 p-3 text-xs font-mono text-foreground/90 overflow-x-auto">
{`Authorization: Bearer <seu_token>
Accept: application/json`}
                  </pre>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-background/50 border border-border/50 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">
                      Bearer Token
                    </span>
                    <code className="font-mono text-foreground/90">
                      Authorization: Bearer &lt;token&gt;
                    </code>
                  </div>
                  <div className="rounded-md bg-background/50 border border-border/50 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">
                      API Key
                    </span>
                    <code className="font-mono text-foreground/90">
                      x-api-key: &lt;chave&gt;
                    </code>
                  </div>
                </div>
              </div>
            </section>

            {/* Códigos de Erro */}
            <section id="codigos-erro" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="text-2xl font-bold">Códigos de Erro</h2>
              </div>
              <p className="text-muted-foreground">
                Respostas de erro seguem um formato padrão:{' '}
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                  {`{ "error": "mensagem" }`}
                </code>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {errorCodes.map((err) => (
                  <div
                    key={err.code}
                    className="rounded-lg border border-border/50 bg-card/40 p-4"
                  >
                    <div className="text-3xl font-bold text-amber-400 mb-1">{err.code}</div>
                    <div className="text-xs text-muted-foreground leading-snug">
                      {err.description}
                    </div>
                  </div>
                ))}
              </div>
            </section>


            {/* ==================== WHATSAPP ==================== */}
            <ApiSection
              id="whatsapp"
              title="WhatsApp"
              icon={Phone}
              description="Endpoints para envio de mensagens, mídia, áudio, reações e gerenciamento de instâncias WhatsApp."
            >
              <div className="mb-6 bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-primary">🔑</span> Autenticação WhatsApp
                </h4>
                <p className="text-sm text-muted-foreground">
                  Todos os endpoints de WhatsApp requerem <code className="bg-background px-2 py-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
                  Use <code>phone</code> ou <code>conversationId</code> para identificar o destinatário.
                </p>
              </div>

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/send-text"
                name="Enviar Mensagem de Texto"
                description="Envia uma mensagem de texto via WhatsApp. Identifica o destinatário por phone ou conversationId."
                authentication="bearer"
                bodyParameters={[
                  { name: 'phone', type: 'string', required: false, description: 'Número do destinatário (obrigatório se não enviar conversationId)' },
                  { name: 'conversationId', type: 'UUID', required: false, description: 'ID da conversa (obrigatório se não enviar phone)' },
                  { name: 'message', type: 'string', required: true, description: 'Texto da mensagem' },
                  { name: 'fromAI', type: 'boolean', required: false, description: 'Se a mensagem foi gerada por IA (padrão: false)' },
                  { name: 'replyToMessageId', type: 'UUID', required: false, description: 'ID da mensagem para responder (quote)' },
                  { name: 'linkPreview', type: 'boolean', required: false, description: 'Exibir preview de link' },
                  { name: 'linkPreviewTitle', type: 'string', required: false, description: 'Título do preview' },
                  { name: 'linkPreviewDescription', type: 'string', required: false, description: 'Descrição do preview' },
                  { name: 'linkPreviewImage', type: 'string', required: false, description: 'URL da imagem do preview' },
                  { name: 'delay', type: 'number', required: false, description: 'Delay em ms antes de enviar' },
                  { name: 'track_source', type: 'string', required: false, description: 'Origem do tracking (ex: campaign)' },
                  { name: 'track_id', type: 'string', required: false, description: 'ID do tracking' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/send-text" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5511999999999",
    "message": "Olá! Como posso ajudar?",
    "fromAI": false
  }'`}
                exampleResponse={`{
  "success": true,
  "message_id": "uuid-da-mensagem",
  "conversation_id": "uuid-da-conversa",
  "sender_type": "agent"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido ou não fornecido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'phone ou conversationId e message são obrigatórios' },
                  { code: 'INSTANCE_NOT_FOUND', status: 500, message: 'Instância WhatsApp não encontrada para a empresa' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/send-media"
                name="Enviar Mídia"
                description="Envia imagem, vídeo, documento, áudio ou sticker via WhatsApp."
                authentication="bearer"
                bodyParameters={[
                  { name: 'phone', type: 'string', required: false, description: 'Número do destinatário (ou conversationId)' },
                  { name: 'conversationId', type: 'UUID', required: false, description: 'ID da conversa' },
                  { name: 'file', type: 'string', required: true, description: 'URL, base64 ou path do Supabase Storage' },
                  { name: 'type', type: 'enum', required: true, description: 'image, video, document, audio, ptt, myaudio, sticker' },
                  { name: 'text', type: 'string', required: false, description: 'Legenda da mídia' },
                  { name: 'docName', type: 'string', required: false, description: 'Nome do documento (para type=document)' },
                  { name: 'fileSize', type: 'number', required: false, description: 'Tamanho do arquivo em bytes' },
                  { name: 'mimeType', type: 'string', required: false, description: 'MIME type do arquivo' },
                  { name: 'fromAI', type: 'boolean', required: false, description: 'Se foi gerada por IA' },
                  { name: 'replyToMessageId', type: 'UUID', required: false, description: 'ID da mensagem para responder' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/send-media" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5511999999999",
    "file": "https://storage.supabase.co/.../imagem.jpg",
    "type": "image",
    "text": "Confira nosso catálogo!"
  }'`}
                exampleResponse={`{
  "success": true,
  "message_id": "uuid-da-mensagem",
  "conversation_id": "uuid-da-conversa",
  "sender_type": "agent",
  "media_type": "image"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'file e type são obrigatórios' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/send-audio"
                name="Enviar Áudio Gravado"
                description="Envia áudio gravado pelo agente (base64) via WhatsApp. O áudio é salvo no Supabase Storage."
                authentication="bearer"
                bodyParameters={[
                  { name: 'phone', type: 'string', required: false, description: 'Número do destinatário (ou conversationId)' },
                  { name: 'conversationId', type: 'UUID', required: false, description: 'ID da conversa' },
                  { name: 'audioBase64', type: 'string', required: true, description: 'Áudio em base64 (data:audio/ogg;base64,...)' },
                  { name: 'duration', type: 'number', required: false, description: 'Duração em ms' },
                  { name: 'mimeType', type: 'string', required: false, description: 'MIME type (padrão: audio/ogg)' },
                  { name: 'fromAI', type: 'boolean', required: false, description: 'Se foi gerado por IA' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/send-audio" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversationId": "uuid-da-conversa",
    "audioBase64": "data:audio/ogg;base64,SGVsbG8=",
    "duration": 5000
  }'`}
                exampleResponse={`{
  "success": true,
  "message_id": "uuid-da-mensagem",
  "conversation_id": "uuid-da-conversa",
  "audio_url": "https://storage.supabase.co/.../audio.ogg",
  "webhook_sent": false
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_AUDIO', status: 400, message: 'audioBase64 é obrigatório' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/send-reaction"
                name="Enviar Reação"
                description="Envia uma reação (emoji) a uma mensagem específica."
                authentication="bearer"
                bodyParameters={[
                  { name: 'messageId', type: 'UUID', required: true, description: 'ID da mensagem no banco para reagir' },
                  { name: 'emoji', type: 'string', required: false, description: 'Emoji da reação (vazio para remover)' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/send-reaction" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messageId": "uuid-da-mensagem",
    "emoji": "👍"
  }'`}
                exampleResponse={`{
  "success": true,
  "message": "Reaction sent successfully"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_MESSAGE_ID', status: 400, message: 'messageId é obrigatório' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/presence"
                name="Indicador de Presença (Digitando...)"
                description="Mostra o indicador 'digitando...' para o cliente no WhatsApp."
                authentication="bearer"
                bodyParameters={[
                  { name: 'conversationId', type: 'UUID', required: true, description: 'ID da conversa' },
                  { name: 'presence', type: 'string', required: false, description: 'Tipo: composing (padrão), recording, available' },
                  { name: 'delay', type: 'number', required: false, description: 'Duração em ms (padrão: 30000)' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/presence" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversationId": "uuid-da-conversa",
    "presence": "composing",
    "delay": 5000
  }'`}
                exampleResponse={`{ "success": true }`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_CONVERSATION', status: 400, message: 'conversationId é obrigatório' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/send-agent"
                name="Enviar Mensagem do Agente"
                description="Endpoint simplificado para agentes humanos enviarem mensagens. Pausa a IA automaticamente para o cliente."
                authentication="bearer"
                bodyParameters={[
                  { name: 'conversationId', type: 'UUID', required: true, description: 'ID da conversa' },
                  { name: 'messageText', type: 'string', required: true, description: 'Texto da mensagem' },
                ]}
                exampleRequest={`curl -X POST "/api/whatsapp/send-agent" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversationId": "uuid-da-conversa",
    "messageText": "Olá, sou o João da equipe de suporte!"
  }'`}
                exampleResponse={`{
  "success": true,
  "message_id": "uuid-da-mensagem",
  "webhook_sent": false
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'conversationId e messageText são obrigatórios' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/whatsapp/connect"
                name="Gerenciar Instâncias WhatsApp"
                description="Conectar, reconectar, desconectar, deletar ou atualizar instâncias WhatsApp (UazAPI)."
                authentication="bearer"
                bodyParameters={[
                  { name: 'action', type: 'enum', required: true, description: 'connect, reconnect, disconnect, delete, update' },
                  { name: 'company_id', type: 'UUID', required: true, description: 'ID da empresa' },
                  { name: 'instance_id', type: 'UUID', required: false, description: 'ID da instância (obrigatório exceto para connect)' },
                ]}
                exampleRequest={`// Conectar nova instância
curl -X POST "/api/whatsapp/connect" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "connect",
    "company_id": "uuid-da-empresa"
  }'

// Reconectar instância existente
curl -X POST "/api/whatsapp/connect" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "reconnect",
    "company_id": "uuid-da-empresa",
    "instance_id": "uuid-da-instancia"
  }'`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid-da-instancia",
    "instance_name": "empresa-abc123",
    "status": "connecting"
  },
  "message": "Instance created",
  "show_qr_modal": true,
  "already_connected": false
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_ACTION', status: 400, message: 'action e company_id são obrigatórios' },
                  { code: 'INSTANCE_NOT_FOUND', status: 404, message: 'Instância não encontrada' },
                  { code: 'API_ERROR', status: 500, message: 'Erro ao comunicar com UazAPI' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== MENSAGENS ==================== */}
            <ApiSection
              id="messages"
              title="Mensagens"
              icon={MessageSquare}
              description="Webhook de recebimento, transferência de conversas e transcrição de áudio."
            >
              <ApiEndpointCard
                method="POST"
                path="/api/webhooks/whatsapp"
                name="Webhook de Mensagens (UazAPI)"
                description="Endpoint webhook que recebe mensagens do WhatsApp via UazAPI. Processa texto, mídia, áudio (com transcrição), status de mensagens e eventos de grupo. Cria clientes e conversas automaticamente."
                authentication="none"
                bodyParameters={[
                  { name: '(payload UazAPI)', type: 'object', required: true, description: 'Payload completo da UazAPI com dados da mensagem, instância e metadados' },
                ]}
                exampleRequest={`// Este endpoint é chamado automaticamente pela UazAPI
// Configure a URL do webhook na instância WhatsApp:
// ${process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.com'}/api/webhooks/whatsapp

// Payload enviado pela UazAPI (exemplo):
{
  "event": "messages.upsert",
  "instance": "empresa-abc123",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "ABC123..."
    },
    "message": {
      "conversation": "Olá, gostaria de informações"
    },
    "messageTimestamp": 1711000000
  }
}`}
                exampleResponse={`{
  "success": true,
  "processed": true
}`}
                errors={[
                  { code: 'INSTANCE_NOT_FOUND', status: 200, message: 'Instância não encontrada (retorna success para não reenviar)' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/messaging/transfer"
                name="Transferir Conversa"
                description="Transfere uma conversa para outro agente, manualmente ou via round-robin automático."
                authentication="bearer"
                bodyParameters={[
                  { name: 'conversation_id', type: 'UUID', required: true, description: 'ID da conversa a transferir' },
                  { name: 'target_user_id', type: 'UUID', required: false, description: 'ID do agente destino (obrigatório no modo manual)' },
                  { name: 'mode', type: 'enum', required: false, description: 'manual (padrão) ou round-robin' },
                ]}
                exampleRequest={`// Transferência manual
curl -X POST "/api/messaging/transfer" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation_id": "uuid-da-conversa",
    "target_user_id": "uuid-do-agente",
    "mode": "manual"
  }'

// Round-robin automático
curl -X POST "/api/messaging/transfer" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation_id": "uuid-da-conversa",
    "mode": "round-robin"
  }'`}
                exampleResponse={`{
  "success": true,
  "conversation_id": "uuid-da-conversa",
  "transferred_to": {
    "user_id": "uuid-do-agente",
    "full_name": "João Silva",
    "email": "joao@empresa.com"
  },
  "mode": "manual"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_CONVERSATION', status: 400, message: 'conversation_id é obrigatório' },
                  { code: 'MISSING_TARGET', status: 400, message: 'target_user_id obrigatório no modo manual' },
                  { code: 'NO_AGENTS', status: 404, message: 'Nenhum agente disponível para round-robin' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/conversations/:id/transfer"
                name="Transferir Conversa para Departamento"
                description="Transfere uma conversa para um departamento. Opcionalmente, atribui a um agente específico que seja membro desse departamento. Marca a conversa com status 'transferred', grava uma nota de transferência no histórico e registra auditoria."
                authentication="bearer"
                pathParameters={[
                  { name: 'id', type: 'UUID', required: true, description: 'ID da conversa a transferir' },
                ]}
                bodyParameters={[
                  { name: 'departmentId', type: 'UUID', required: true, description: 'ID do departamento destino — deve pertencer à mesma empresa e estar ativo' },
                  { name: 'assignedTo', type: 'UUID', required: false, description: 'ID do agente destino — se informado, precisa ser membro do departamento' },
                  { name: 'note', type: 'string', required: false, description: 'Nota opcional (máx 1000 chars) registrada no histórico da conversa' },
                ]}
                exampleRequest={`// Transferência apenas para o departamento (sem agente específico)
curl -X POST "/api/conversations/8f1a9b72-3c04-4a88-9bde-1c2d3e4f5678/transfer" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "departmentId": "dept-uuid-aqui"
  }'

// Transferência para departamento + agente específico + nota
curl -X POST "/api/conversations/8f1a9b72-3c04-4a88-9bde-1c2d3e4f5678/transfer" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "departmentId": "dept-uuid-aqui",
    "assignedTo": "agent-uuid-aqui",
    "note": "Cliente precisa de atendimento técnico especializado"
  }'`}
                exampleResponse={`{
  "success": true,
  "conversation": {
    "id": "8f1a9b72-3c04-4a88-9bde-1c2d3e4f5678",
    "departmentId": "dept-uuid-aqui",
    "transferredTo": "agent-uuid-aqui",
    "status": "transferred",
    "department": {
      "id": "dept-uuid-aqui",
      "name": "Suporte Técnico",
      "color": "#3b82f6"
    }
  }
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 403, message: 'Empresa não encontrada ou token inválido' },
                  { code: 'INVALID_ID', status: 400, message: 'ID de conversa não é um UUID válido' },
                  { code: 'VALIDATION_ERROR', status: 400, message: 'departmentId inválido ou ausente' },
                  { code: 'CONVERSATION_NOT_FOUND', status: 404, message: 'Conversa não encontrada nesta empresa' },
                  { code: 'INVALID_DEPARTMENT', status: 400, message: 'Departamento não pertence à empresa ou está inativo' },
                  { code: 'AGENT_NOT_IN_DEPARTMENT', status: 400, message: 'Agente informado não é membro deste departamento' },
                  { code: 'INVALID_AGENT', status: 400, message: 'Agente não pertence à empresa ou está inativo' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/conversations"
                name="Listar Conversas por Departamento"
                description="Lista conversas de uma empresa, com filtro opcional por departamento. Útil para ver todas as conversas já direcionadas a um departamento específico após transferência."
                authentication="bearer"
                queryParameters={[
                  { name: 'departmentId', type: 'UUID', required: false, description: 'Filtra conversas direcionadas a este departamento' },
                  { name: 'status', type: 'enum', required: false, description: 'active, waiting, closed ou transferred' },
                  { name: 'assignedTo', type: 'UUID', required: false, description: 'Filtra por agente atribuído' },
                  { name: 'companyId', type: 'UUID', required: false, description: 'Apenas super_admin em impersonation — usa o companyId da sessão por padrão' },
                ]}
                exampleRequest={`// Listar todas as conversas do departamento de Suporte
curl "/api/conversations?departmentId=dept-uuid-aqui" \\
  -H "Authorization: Bearer <token>"

// Listar conversas transferidas (todas as que passaram por algum departamento)
curl "/api/conversations?status=transferred" \\
  -H "Authorization: Bearer <token>"`}
                exampleResponse={`[
  {
    "id": "conv-uuid",
    "clientId": "client-uuid",
    "channel": "whatsapp",
    "status": "transferred",
    "departmentId": "dept-uuid",
    "transferredTo": "agent-uuid",
    "department": {
      "id": "dept-uuid",
      "name": "Suporte Técnico",
      "color": "#3b82f6"
    },
    "createdAt": "2026-04-14T10:23:00.000Z"
  }
]`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_COMPANY', status: 400, message: 'companyId não resolvido' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/departments"
                name="Listar Departamentos"
                description="Lista todos os departamentos ativos da empresa, com seus membros. Use o campo id do retorno para informar no departmentId ao transferir uma conversa."
                authentication="bearer"
                queryParameters={[
                  { name: 'companyId', type: 'UUID', required: false, description: 'Apenas super_admin em impersonation — usa o companyId da sessão por padrão' },
                ]}
                exampleRequest={`curl "/api/departments" \\
  -H "Authorization: Bearer <token>"`}
                exampleResponse={`[
  {
    "id": "dept-uuid-1",
    "companyId": "company-uuid",
    "name": "Suporte Técnico",
    "description": "Atendimento pós-venda",
    "color": "#3b82f6",
    "isActive": true,
    "members": [
      {
        "id": "member-uuid",
        "userId": "agent-uuid",
        "role": "member",
        "createdAt": "2026-01-10T14:30:00.000Z"
      }
    ]
  },
  {
    "id": "dept-uuid-2",
    "name": "Comercial",
    "color": "#10b981",
    "isActive": true,
    "members": []
  }
]`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_COMPANY', status: 400, message: 'companyId não resolvido' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/departments/next-agent"
                name="Consultar Próximo Agente (Peek Round-Robin)"
                description="Consulta qual seria o próximo agente a receber um cliente no round-robin, SEM consumir o turno (não atualiza o estado). Útil para a IA verificar disponibilidade de agenda antes de efetivar a transferência. Espelha a mesma lógica de ordenação e papéis do endpoint de transferência."
                authentication="bearer"
                queryParameters={[
                  { name: 'department_id', type: 'UUID', required: false, description: 'Se informado, faz peek do round-robin do departamento (apenas agentes online membros do depto). Se omitido, faz peek global da empresa (todos os agentes ativos, ignora online).' },
                  { name: 'include_schedule', type: 'string', required: false, description: 'Use "1" para incluir a agenda (DoctorSchedule) do próximo agente na resposta — economiza uma chamada extra a /api/schedules.' },
                ]}
                exampleRequest={`// Peek do round-robin do departamento de vendas, já trazendo a agenda
curl -X GET "/api/departments/next-agent?department_id=dept-vendas-uuid&include_schedule=1" \\
  -H "Authorization: Bearer <token>"

// Peek global (sem departamento)
curl -X GET "/api/departments/next-agent" \\
  -H "Authorization: Bearer <token>"`}
                exampleResponse={`{
  "next_agent": {
    "user_id": "agent-uuid",
    "full_name": "João Vendedor",
    "email": "joao@empresa.com",
    "is_online": true
  },
  "schedule": {
    "id": "schedule-uuid",
    "name": "Agenda João"
  },
  "total_candidates": 3,
  "queue_order": [
    { "user_id": "agent-uuid", "full_name": "João Vendedor", "position": 1 },
    { "user_id": "agent-uuid-2", "full_name": "Maria Vendedora", "position": 2 },
    { "user_id": "agent-uuid-3", "full_name": "Pedro Vendedor", "position": 3 }
  ],
  "mode": "department",
  "message": "Proximo agente: João Vendedor (3 candidato(s))."
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 403, message: 'Empresa não encontrada' },
                  { code: 'DEPARTMENT_NOT_FOUND', status: 404, message: 'Departamento não encontrado ou inativo' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/messaging/transcribe"
                name="Transcrever Áudio"
                description="Transcreve o áudio de uma mensagem usando a OpenAI Whisper. Retorna cache se já foi transcrito."
                authentication="bearer"
                bodyParameters={[
                  { name: 'messageId', type: 'UUID', required: true, description: 'ID da mensagem com áudio' },
                ]}
                exampleRequest={`curl -X POST "/api/messaging/transcribe" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messageId": "uuid-da-mensagem"
  }'`}
                exampleResponse={`{
  "success": true,
  "transcription": "Olá, gostaria de saber mais sobre o produto...",
  "cached": false
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_MESSAGE', status: 400, message: 'messageId é obrigatório' },
                  { code: 'NO_AUDIO', status: 400, message: 'Mensagem não contém áudio' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== APPOINTMENTS ==================== */}
            <ApiSection
              id="appointments"
              title="Agendamentos"
              icon={Calendar}
              description="API completa para gerenciar agendamentos, consultar disponibilidade, criar, remarcar e cancelar."
            >
              <div className="mb-6 bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-primary">🔑</span> Autenticação de Agendamentos
                </h4>
                <p className="text-sm text-muted-foreground">
                  Todos os endpoints de agendamentos usam <code className="bg-background px-2 py-1 rounded">x-api-key</code>.
                  A API key identifica automaticamente a empresa.
                </p>
                <div className="bg-background p-3 rounded font-mono text-xs mt-2">
                  x-api-key: <span className="text-primary">sua-api-key-aqui</span>
                </div>
              </div>

              <ApiEndpointCard
                method="GET"
                path="/api/appointments/slots"
                name="Consultar Horários Disponíveis"
                description="Retorna os horários disponíveis para agendamento em uma data específica, considerando horário comercial e agendamentos existentes."
                authentication="api-key"
                queryParameters={[
                  { name: 'date', type: 'YYYY-MM-DD', required: true, description: 'Data para consulta de disponibilidade' },
                  { name: 'duration_minutes', type: 'integer', required: false, description: 'Duração em minutos (padrão: 60)' },
                  { name: 'assigned_to', type: 'UUID', required: false, description: 'ID do profissional específico' },
                ]}
                exampleRequest={`curl -X GET "/api/appointments/slots?date=2026-03-20&duration_minutes=60" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": {
    "date": "2026-03-20",
    "available_slots": ["08:00", "09:00", "10:00", "14:00", "15:00"],
    "message": "5 slots available"
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'MISSING_DATE', status: 400, message: 'Parâmetro date é obrigatório' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/appointments"
                name="Listar Agendamentos"
                description="Lista agendamentos da empresa com filtros por status, cliente, data e responsável."
                authentication="api-key"
                queryParameters={[
                  { name: 'status', type: 'enum', required: false, description: 'scheduled, confirmed, completed, cancelled, no_show' },
                  { name: 'client_id', type: 'UUID', required: false, description: 'Filtrar por cliente' },
                  { name: 'phone', type: 'string', required: false, description: 'Filtrar pelo telefone do cliente' },
                  { name: 'assigned_to', type: 'UUID', required: false, description: 'Filtrar por profissional' },
                  { name: 'date_from', type: 'YYYY-MM-DD', required: false, description: 'Data inicial' },
                  { name: 'date_to', type: 'YYYY-MM-DD', required: false, description: 'Data final' },
                ]}
                exampleRequest={`curl -X GET "/api/appointments?status=scheduled&date_from=2026-03-20" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": {
    "appointments": [
      {
        "id": "uuid",
        "title": "Consulta",
        "scheduled_for": "2026-03-20T14:00:00Z",
        "duration_minutes": 60,
        "status": "scheduled",
        "clients": {
          "first_name": "João",
          "last_name": "Silva"
        }
      }
    ],
    "message": "Found 1 appointment"
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/appointments"
                name="Criar Agendamento"
                description="Cria um novo agendamento com validação de conflitos e horário comercial. Sincroniza com Google Calendar se configurado."
                authentication="api-key"
                bodyParameters={[
                  { name: 'title', type: 'string', required: true, description: 'Título do agendamento' },
                  { name: 'scheduled_for', type: 'ISO 8601', required: true, description: 'Data e hora (ex: 2026-03-20T14:00:00Z)' },
                  { name: 'client_id', type: 'UUID', required: false, description: 'ID do cliente (obrigatório se não enviar phone)' },
                  { name: 'phone', type: 'string', required: false, description: 'Telefone do cliente (cria/busca automaticamente)' },
                  { name: 'duration_minutes', type: 'integer', required: false, description: 'Duração em minutos (padrão: 60)' },
                  { name: 'assigned_to', type: 'UUID', required: false, description: 'ID do profissional responsável' },
                  { name: 'location', type: 'string', required: false, description: 'Local do agendamento' },
                  { name: 'description', type: 'string', required: false, description: 'Descrição detalhada' },
                  { name: 'notes', type: 'string', required: false, description: 'Observações internas' },
                  { name: 'patient_name', type: 'string', required: false, description: 'Nome do paciente' },
                ]}
                exampleRequest={`curl -X POST "/api/appointments" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Consulta Dr. Silva",
    "scheduled_for": "2026-03-20T14:00:00Z",
    "phone": "5511999999999",
    "duration_minutes": 60,
    "location": "Sala 3"
  }'`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid-do-agendamento",
    "title": "Consulta Dr. Silva",
    "scheduled_for": "2026-03-20T14:00:00Z",
    "duration_minutes": 60,
    "status": "scheduled",
    "location": "Sala 3"
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'title e scheduled_for são obrigatórios' },
                  { code: 'CONFLICT', status: 409, message: 'Já existe agendamento para este horário' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/appointments/:id"
                name="Obter Detalhes do Agendamento"
                description="Retorna dados completos de um agendamento específico."
                authentication="api-key"
                exampleRequest={`curl -X GET "/api/appointments/uuid-do-agendamento" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Consulta",
    "scheduled_for": "2026-03-20T14:00:00Z",
    "duration_minutes": 60,
    "status": "scheduled",
    "location": "Sala 3",
    "notes": "Paciente solicitou atenção especial",
    "clients": {
      "first_name": "João",
      "last_name": "Silva",
      "phone": "5511999999999"
    }
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'NOT_FOUND', status: 404, message: 'Agendamento não encontrado' },
                ]}
              />

              <ApiEndpointCard
                method="PUT"
                path="/api/appointments/:id/reschedule"
                name="Remarcar Agendamento"
                description="Remarca agendamento para nova data/hora. Mantém histórico e sincroniza com Google Calendar."
                authentication="api-key"
                bodyParameters={[
                  { name: 'new_scheduled_for', type: 'ISO 8601', required: true, description: 'Nova data e hora' },
                  { name: 'new_duration_minutes', type: 'integer', required: false, description: 'Nova duração em minutos' },
                  { name: 'reason', type: 'string', required: false, description: 'Motivo da remarcação' },
                ]}
                exampleRequest={`curl -X PUT "/api/appointments/uuid-do-agendamento/reschedule" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "new_scheduled_for": "2026-03-25T10:00:00Z",
    "reason": "Cliente solicitou alteração"
  }'`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid",
    "scheduled_for": "2026-03-25T10:00:00Z",
    "status": "scheduled"
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'NOT_FOUND', status: 404, message: 'Agendamento não encontrado' },
                  { code: 'CANNOT_RESCHEDULE', status: 400, message: 'Agendamento já cancelado ou concluído' },
                ]}
              />

              <ApiEndpointCard
                method="DELETE"
                path="/api/appointments/:id"
                name="Cancelar Agendamento"
                description="Cancela um agendamento e remove do Google Calendar se sincronizado."
                authentication="api-key"
                queryParameters={[
                  { name: 'reason', type: 'string', required: false, description: 'Motivo do cancelamento' },
                ]}
                exampleRequest={`curl -X DELETE "/api/appointments/uuid-do-agendamento?reason=Cliente%20desistiu" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "cancelled"
  }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'NOT_FOUND', status: 404, message: 'Agendamento não encontrado' },
                  { code: 'ALREADY_CANCELLED', status: 400, message: 'Agendamento já cancelado' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== FAQ / KNOWLEDGE ==================== */}
            <ApiSection
              id="faq"
              title="FAQ / Knowledge Base"
              icon={HelpCircle}
              description="Gerenciar perguntas frequentes, upload de arquivos para transcrição e sincronização com base de conhecimento."
            >
              <div className="mb-6 bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-primary">🔑</span> Autenticação FAQ
                </h4>
                <p className="text-sm text-muted-foreground">
                  CRUD de FAQs usa <code className="bg-background px-2 py-1 rounded">x-api-key</code>.
                  Upload e Sync usam <code className="bg-background px-2 py-1 rounded">Bearer Token</code>.
                </p>
              </div>

              <ApiEndpointCard
                method="GET"
                path="/api/knowledge/faq"
                name="Listar FAQs"
                description="Lista todas as perguntas frequentes da empresa com filtros por categoria, status e busca textual."
                authentication="api-key"
                queryParameters={[
                  { name: 'category', type: 'string', required: false, description: 'Filtrar por categoria' },
                  { name: 'active', type: 'boolean', required: false, description: 'Filtrar por status ativo (true/false)' },
                  { name: 'search', type: 'string', required: false, description: 'Busca textual em pergunta e resposta' },
                ]}
                exampleRequest={`curl -X GET "/api/knowledge/faq?category=Horário&active=true" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "question": "Qual o horário de funcionamento?",
      "answer": "Segunda a sexta, 8h às 18h.",
      "category": "Horário",
      "keywords": ["horário", "funcionamento"],
      "is_active": true,
      "order_position": 1
    }
  ]
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/knowledge/faq"
                name="Criar FAQ"
                description="Cria uma ou múltiplas perguntas frequentes. Aceita objeto único ou array { faqs: [...] } para criação em lote."
                authentication="api-key"
                bodyParameters={[
                  { name: 'question', type: 'string', required: true, description: 'Texto da pergunta' },
                  { name: 'answer', type: 'string', required: false, description: 'Texto da resposta' },
                  { name: 'category', type: 'string', required: false, description: 'Categoria (ex: Horário, Pagamento)' },
                  { name: 'keywords', type: 'string[]', required: false, description: 'Palavras-chave para busca' },
                  { name: 'is_active', type: 'boolean', required: false, description: 'Ativo (padrão: true)' },
                ]}
                exampleRequest={`// Individual
curl -X POST "/api/knowledge/faq" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "question": "Aceitam cartão?",
    "answer": "Sim, todas as bandeiras.",
    "category": "Pagamento",
    "keywords": ["cartão", "pagamento"]
  }'

// Em lote
curl -X POST "/api/knowledge/faq" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "faqs": [
      { "question": "Pergunta 1", "answer": "Resposta 1" },
      { "question": "Pergunta 2", "answer": "Resposta 2" }
    ]
  }'`}
                exampleResponse={`{
  "success": true,
  "data": [{ "id": "uuid", "question": "...", "answer": "..." }],
  "count": 1
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'MISSING_QUESTION', status: 400, message: 'question é obrigatório' },
                ]}
              />

              <ApiEndpointCard
                method="PATCH"
                path="/api/knowledge/faq/:id"
                name="Atualizar FAQ"
                description="Atualiza campos de uma pergunta frequente. Envie apenas os campos que deseja alterar."
                authentication="api-key"
                bodyParameters={[
                  { name: 'question', type: 'string', required: false, description: 'Nova pergunta' },
                  { name: 'answer', type: 'string', required: false, description: 'Nova resposta' },
                  { name: 'category', type: 'string', required: false, description: 'Nova categoria' },
                  { name: 'keywords', type: 'string[]', required: false, description: 'Novas palavras-chave' },
                  { name: 'is_active', type: 'boolean', required: false, description: 'Ativar/desativar' },
                  { name: 'order_position', type: 'integer', required: false, description: 'Nova posição' },
                ]}
                exampleRequest={`curl -X PATCH "/api/knowledge/faq/uuid-da-faq" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "answer": "Novo horário: 8h às 20h",
    "keywords": ["horário", "aberto", "funcionamento"]
  }'`}
                exampleResponse={`{
  "success": true,
  "data": { "id": "uuid", "question": "...", "answer": "Novo horário: 8h às 20h" }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'NOT_FOUND', status: 404, message: 'FAQ não encontrada' },
                ]}
              />

              <ApiEndpointCard
                method="DELETE"
                path="/api/knowledge/faq/:id"
                name="Excluir FAQ"
                description="Exclui permanentemente uma pergunta frequente."
                authentication="api-key"
                exampleRequest={`curl -X DELETE "/api/knowledge/faq/uuid-da-faq" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "success": true,
  "data": { "message": "Pergunta frequente excluída com sucesso." }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                  { code: 'NOT_FOUND', status: 404, message: 'FAQ não encontrada' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/knowledge/notify-upload"
                name="Notificar Upload de Arquivo"
                description="Notifica o N8N que um arquivo foi enviado para transcrição pela IA. Usa env: N8N_FAQ_UPLOAD_WEBHOOK_URL."
                authentication="bearer"
                bodyParameters={[
                  { name: 'fileUrl', type: 'string', required: true, description: 'URL do arquivo no Supabase Storage' },
                  { name: 'companyId', type: 'UUID', required: true, description: 'ID da empresa' },
                  { name: 'fileName', type: 'string', required: true, description: 'Nome do arquivo' },
                  { name: 'fileType', type: 'string', required: false, description: 'MIME type (ex: application/pdf)' },
                  { name: 'fileSize', type: 'number', required: false, description: 'Tamanho em bytes' },
                ]}
                exampleRequest={`curl -X POST "/api/knowledge/notify-upload" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fileUrl": "https://storage.supabase.co/.../manual.pdf",
    "companyId": "uuid-da-empresa",
    "fileName": "manual-produto.pdf",
    "fileType": "application/pdf",
    "fileSize": 204800
  }'`}
                exampleResponse={`{
  "success": true,
  "message": "Arquivo notificado com sucesso",
  "n8nResponse": {}
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'fileUrl, companyId e fileName são obrigatórios' },
                  { code: 'WEBHOOK_ERROR', status: 502, message: 'Erro ao notificar N8N (N8N_FAQ_UPLOAD_WEBHOOK_URL)' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/knowledge/sync"
                name="Sincronizar Base de Conhecimento"
                description="Sincroniza todos os FAQs ativos do banco com a base de conhecimento no N8N. Usa env: KNOWLEDGE_WEBHOOK_URL."
                authentication="bearer"
                bodyParameters={[
                  { name: 'company_id', type: 'UUID', required: true, description: 'ID da empresa' },
                ]}
                exampleRequest={`curl -X POST "/api/knowledge/sync" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "company_id": "uuid-da-empresa"
  }'`}
                exampleResponse={`{
  "success": true,
  "knowledge_name": "know_nomedaempresa",
  "faqs_count": 15
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_COMPANY', status: 400, message: 'company_id é obrigatório' },
                  { code: 'WEBHOOK_ERROR', status: 500, message: 'KNOWLEDGE_WEBHOOK_URL não configurada' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== AI ==================== */}
            <ApiSection
              id="ai"
              title="IA / Configuração"
              icon={Bot}
              description="Configurações de IA, prompts, tracking de uso de tokens e integração com ElevenLabs."
            >
              <ApiEndpointCard
                method="GET"
                path="/api/ai/config"
                name="Obter Configuração de IA"
                description="Retorna as configurações de IA da empresa (prompts, modelo, follow-ups, etc)."
                authentication="api-key"
                exampleRequest={`curl -X GET "/api/ai/config" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "configurations": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "is_active": true,
      "n8n_webhook_url": "https://...",
      "follow_up_enabled": true,
      "follow_up_stages": [...]
    }
  ]
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/ai/update-prompts"
                name="Atualizar Prompts de IA"
                description="Atualiza os prompts e configurações de comportamento da IA para a empresa."
                authentication="api-key"
                bodyParameters={[
                  { name: 'configuration_id', type: 'UUID', required: false, description: 'ID da configuração (usa a ativa se não informado)' },
                  { name: 'papel', type: 'string', required: false, description: 'Papel da IA (ex: Assistente de vendas)' },
                  { name: 'objetivo', type: 'string', required: false, description: 'Objetivo principal' },
                  { name: 'funcao', type: 'string', required: false, description: 'Função da IA' },
                  { name: 'funil', type: 'string', required: false, description: 'Etapas do funil' },
                  { name: 'regras', type: 'string', required: false, description: 'Regras de comportamento' },
                  { name: 'regras_horarios', type: 'string', required: false, description: 'Regras de horário' },
                  { name: 'boas_vindas', type: 'string', required: false, description: 'Mensagem de boas-vindas' },
                ]}
                exampleRequest={`curl -X POST "/api/ai/update-prompts" \\
  -H "x-api-key: sua-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "papel": "Assistente de vendas",
    "objetivo": "Converter leads em clientes",
    "boas_vindas": "Olá! Como posso ajudar?"
  }'`}
                exampleResponse={`{
  "success": true,
  "configuration": { "..." }
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                ]}
              />

              <ApiEndpointCard
                method="GET"
                path="/api/ai/audio-settings"
                name="Obter Configurações de Áudio"
                description="Retorna as configurações de voz da IA (ElevenLabs)."
                authentication="api-key"
                exampleRequest={`curl -X GET "/api/ai/audio-settings" \\
  -H "x-api-key: sua-api-key"`}
                exampleResponse={`{
  "voice_id": null,
  "stability": 0.5,
  "similarity": 0.75,
  "style": 0,
  "speaker_boost": true,
  "remove_background_noise": false
}`}
                errors={[
                  { code: 'INVALID_API_KEY', status: 401, message: 'API key inválida' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/ai/track-usage"
                name="Registrar Uso de Tokens"
                description="Registra uso de tokens de IA para tracking de custos e consumo."
                authentication="bearer"
                bodyParameters={[
                  { name: 'model', type: 'string', required: true, description: 'Modelo usado (ex: gpt-4o)' },
                  { name: 'input_tokens', type: 'number', required: true, description: 'Tokens de entrada' },
                  { name: 'output_tokens', type: 'number', required: true, description: 'Tokens de saída' },
                  { name: 'conversation_id', type: 'UUID', required: false, description: 'ID da conversa' },
                  { name: 'message_id', type: 'UUID', required: false, description: 'ID da mensagem' },
                  { name: 'request_type', type: 'string', required: false, description: 'Tipo: chat (padrão), transcription, etc' },
                  { name: 'client_id', type: 'UUID', required: false, description: 'ID do cliente' },
                ]}
                exampleRequest={`curl -X POST "/api/ai/track-usage" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "input_tokens": 500,
    "output_tokens": 200,
    "conversation_id": "uuid"
  }'`}
                exampleResponse={`{
  "success": true,
  "data": {
    "id": "uuid",
    "total_tokens": 700,
    "total_cost": 0.0035
  }
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'model, input_tokens e output_tokens são obrigatórios' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/ai/elevenlabs-voices"
                name="Listar Vozes ElevenLabs"
                description="Retorna a lista de vozes disponíveis na conta ElevenLabs."
                authentication="none"
                bodyParameters={[
                  { name: 'api_key', type: 'string', required: true, description: 'API key do ElevenLabs' },
                ]}
                exampleRequest={`curl -X POST "/api/ai/elevenlabs-voices" \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "sk-elevenlabs-..."
  }'`}
                exampleResponse={`{
  "voices": [
    {
      "voice_id": "abc123",
      "name": "Rachel",
      "category": "premade",
      "labels": { "accent": "american" },
      "preview_url": "https://..."
    }
  ]
}`}
                errors={[
                  { code: 'MISSING_KEY', status: 400, message: 'api_key é obrigatório' },
                  { code: 'ELEVENLABS_ERROR', status: 500, message: 'Erro ao buscar vozes' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== CALENDAR ==================== */}
            <ApiSection
              id="calendar"
              title="Google Calendar"
              icon={Calendar}
              description="Integração com Google Calendar: autenticação OAuth, sincronização de agendamentos e bulk sync."
            >
              <ApiEndpointCard
                method="POST"
                path="/api/calendar/auth"
                name="Iniciar OAuth Google"
                description="Gera URL de autenticação OAuth do Google para conectar o Calendar da empresa."
                authentication="bearer"
                exampleRequest={`curl -X POST "/api/calendar/auth" \\
  -H "Authorization: Bearer <token>"`}
                exampleResponse={`{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=..."
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'GOOGLE_NOT_CONFIGURED', status: 500, message: 'GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/calendar/sync"
                name="Sincronizar Agendamento"
                description="Cria, atualiza ou remove um evento no Google Calendar a partir de um agendamento."
                authentication="bearer"
                bodyParameters={[
                  { name: 'action', type: 'enum', required: true, description: 'create, update ou delete' },
                  { name: 'appointment_id', type: 'UUID', required: true, description: 'ID do agendamento' },
                  { name: 'company_id', type: 'UUID', required: true, description: 'ID da empresa' },
                ]}
                exampleRequest={`curl -X POST "/api/calendar/sync" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "create",
    "appointment_id": "uuid-do-agendamento",
    "company_id": "uuid-da-empresa"
  }'`}
                exampleResponse={`{
  "success": true,
  "action": "created",
  "event_id": "google-event-id",
  "meet_link": "https://meet.google.com/abc-xyz"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'NOT_CONNECTED', status: 400, message: 'Google Calendar não conectado para esta empresa' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/calendar/disconnect"
                name="Desconectar Google Calendar"
                description="Remove a integração do Google Calendar da empresa."
                authentication="bearer"
                exampleRequest={`curl -X POST "/api/calendar/disconnect" \\
  -H "Authorization: Bearer <token>"`}
                exampleResponse={`{ "success": true }`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/calendar/bulk-sync"
                name="Sincronização em Massa"
                description="Sincroniza todos os agendamentos de todas as empresas conectadas ao Google Calendar. Requer super_admin ou chamada interna."
                authentication="bearer"
                exampleRequest={`curl -X POST "/api/calendar/bulk-sync" \\
  -H "Authorization: Bearer <token-super-admin>"`}
                exampleResponse={`{
  "success": true,
  "results": [
    {
      "company": "Empresa X",
      "status": "ok",
      "synced": 10,
      "errors": 0,
      "total": 10
    }
  ]
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== REPORTS ==================== */}
            <ApiSection
              id="reports"
              title="Relatórios"
              icon={BarChart3}
              description="Geração de relatórios diários com métricas de atendimento."
            >
              <ApiEndpointCard
                method="POST"
                path="/api/reports/daily"
                name="Gerar Relatório Diário"
                description="Gera relatório diário com métricas de atendimento, agendamentos e conversas da empresa."
                authentication="bearer"
                bodyParameters={[
                  { name: 'company_id', type: 'UUID', required: true, description: 'ID da empresa' },
                  { name: 'report_date', type: 'YYYY-MM-DD', required: true, description: 'Data do relatório' },
                  { name: 'manual_entries', type: 'number', required: false, description: 'Entradas manuais' },
                  { name: 'manual_scheduled', type: 'number', required: false, description: 'Agendados manualmente' },
                  { name: 'manual_scheduled_today', type: 'number', required: false, description: 'Agendados para hoje' },
                  { name: 'manual_attended', type: 'number', required: false, description: 'Atendidos manualmente' },
                ]}
                exampleRequest={`curl -X POST "/api/reports/daily" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "company_id": "uuid-da-empresa",
    "report_date": "2026-03-17"
  }'`}
                exampleResponse={`{
  "success": true,
  "sent": true,
  "report": { "..." },
  "message": "Report generated"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Token inválido' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'company_id e report_date são obrigatórios' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== COMPANY & USERS ==================== */}
            <ApiSection
              id="company"
              title="Empresa / Usuários"
              icon={Users}
              description="Criação de empresas, adição de usuários e gerenciamento de senhas. Requer role super_admin."
            >
              <div className="mb-6 bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                  <Settings className="h-4 w-4 inline mr-2" />
                  Acesso Restrito
                </h4>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Todos os endpoints desta seção requerem <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">Bearer Token</code> com role <strong>super_admin</strong>.
                </p>
              </div>

              <ApiEndpointCard
                method="POST"
                path="/api/company/create"
                name="Criar Empresa"
                description="Cria uma nova empresa e o usuário proprietário (company_admin). Gera senha aleatória se não informada."
                authentication="bearer"
                bodyParameters={[
                  { name: 'companyName', type: 'string', required: true, description: 'Nome da empresa' },
                  { name: 'ownerEmail', type: 'string', required: true, description: 'Email do proprietário' },
                  { name: 'ownerFullName', type: 'string', required: false, description: 'Nome completo do proprietário' },
                  { name: 'ownerPassword', type: 'string', required: false, description: 'Senha (mín. 8 chars, gerada se não informada)' },
                ]}
                exampleRequest={`curl -X POST "/api/company/create" \\
  -H "Authorization: Bearer <token-super-admin>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "companyName": "Empresa Nova",
    "ownerEmail": "dono@empresa.com",
    "ownerFullName": "João Silva",
    "ownerPassword": "senhaSegura123"
  }'`}
                exampleResponse={`{
  "success": true,
  "data": {
    "companyId": "uuid",
    "company": { "name": "Empresa Nova" },
    "ownerId": "uuid",
    "ownerEmail": "dono@empresa.com",
    "message": "Company created"
  }
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'companyName e ownerEmail são obrigatórios' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/company/add-user"
                name="Adicionar Usuário"
                description="Cria um novo usuário para uma empresa existente com role específica."
                authentication="bearer"
                bodyParameters={[
                  { name: 'company_id', type: 'UUID', required: true, description: 'ID da empresa' },
                  { name: 'email', type: 'string', required: true, description: 'Email do usuário' },
                  { name: 'full_name', type: 'string', required: true, description: 'Nome completo' },
                  { name: 'phone', type: 'string', required: false, description: 'Telefone' },
                  { name: 'role', type: 'string', required: true, description: 'Role: agent, manager, company_admin' },
                ]}
                exampleRequest={`curl -X POST "/api/company/add-user" \\
  -H "Authorization: Bearer <token-super-admin>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "company_id": "uuid-da-empresa",
    "email": "agente@empresa.com",
    "full_name": "Maria Santos",
    "role": "agent"
  }'`}
                exampleResponse={`{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "agente@empresa.com",
    "full_name": "Maria Santos",
    "company_id": "uuid",
    "user_roles": [{ "role": "agent" }]
  }
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                  { code: 'MISSING_FIELDS', status: 400, message: 'company_id, email, full_name e role são obrigatórios' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/user/reset-password"
                name="Resetar Senha (Email)"
                description="Envia email de reset de senha para o usuário."
                authentication="bearer"
                bodyParameters={[
                  { name: 'userId', type: 'UUID', required: true, description: 'ID do usuário' },
                ]}
                exampleRequest={`curl -X POST "/api/user/reset-password" \\
  -H "Authorization: Bearer <token-super-admin>" \\
  -H "Content-Type: application/json" \\
  -d '{ "userId": "uuid-do-usuario" }'`}
                exampleResponse={`{
  "success": true,
  "email": "usuario@empresa.com",
  "message": "Password reset email sent successfully"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                ]}
              />

              <ApiEndpointCard
                method="POST"
                path="/api/user/set-password"
                name="Definir Senha Diretamente"
                description="Define uma nova senha para o usuário sem enviar email."
                authentication="bearer"
                bodyParameters={[
                  { name: 'userId', type: 'UUID', required: true, description: 'ID do usuário' },
                  { name: 'password', type: 'string', required: true, description: 'Nova senha (mín. 8 caracteres)' },
                ]}
                exampleRequest={`curl -X POST "/api/user/set-password" \\
  -H "Authorization: Bearer <token-super-admin>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "uuid-do-usuario",
    "password": "novaSenha123"
  }'`}
                exampleResponse={`{
  "success": true,
  "email": "usuario@empresa.com",
  "userName": "Maria Santos"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                  { code: 'WEAK_PASSWORD', status: 400, message: 'Senha deve ter no mínimo 8 caracteres' },
                ]}
              />
            </ApiSection>

            <Separator />

            {/* ==================== ADMIN ==================== */}
            <ApiSection
              id="admin"
              title="Admin / Monitoramento"
              icon={Shield}
              description="Monitoramento de filas BullMQ e status do sistema. Requer role super_admin."
            >
              <ApiEndpointCard
                method="GET"
                path="/api/admin/queues"
                name="Status das Filas"
                description="Retorna estatísticas de todas as filas BullMQ (whatsapp-send, n8n-webhook, transcription)."
                authentication="bearer"
                exampleRequest={`curl -X GET "/api/admin/queues" \\
  -H "Authorization: Bearer <token-super-admin>"`}
                exampleResponse={`{
  "status": "ok",
  "queues": [
    {
      "name": "whatsapp-send",
      "waiting": 0,
      "active": 1,
      "completed": 150,
      "failed": 2,
      "delayed": 0,
      "total": 153
    },
    {
      "name": "n8n-webhook",
      "waiting": 0,
      "active": 0,
      "completed": 80,
      "failed": 0,
      "delayed": 0,
      "total": 80
    },
    {
      "name": "transcription",
      "waiting": 0,
      "active": 0,
      "completed": 45,
      "failed": 1,
      "delayed": 0,
      "total": 46
    }
  ],
  "timestamp": "2026-03-17T12:00:00.000Z"
}`}
                errors={[
                  { code: 'UNAUTHORIZED', status: 401, message: 'Requer super_admin' },
                ]}
              />
            </ApiSection>

            {/* Footer */}
            <div className="mt-16 pt-8 border-t border-border/50">
              <p className="text-xs text-muted-foreground text-center">
                <span className="text-red-400 font-semibold">API Docs</span> · Maya CRM · v2.0
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

import { ApiEndpointCard } from '@/components/api-docs/ApiEndpointCard';
import { ApiSection } from '@/components/api-docs/ApiSection';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calendar, MessageSquare, Phone, Users, Bot, Shield, BarChart3, HelpCircle, Settings } from 'lucide-react';

export default function ApiDocs() {
  const sections = [
    { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
    { id: 'messages', label: 'Mensagens', icon: MessageSquare },
    { id: 'appointments', label: 'Agendamentos', icon: Calendar },
    { id: 'faq', label: 'FAQ / Knowledge', icon: HelpCircle },
    { id: 'ai', label: 'IA / Configuração', icon: Bot },
    { id: 'calendar', label: 'Google Calendar', icon: Calendar },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'company', label: 'Empresa / Usuários', icon: Users },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  return (
    <div className="h-full">
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card hidden lg:block">
          <ScrollArea className="h-full py-6 px-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Navegação</h3>
                <nav className="space-y-1">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
                    >
                      <section.icon className="h-4 w-4" />
                      {section.label}
                    </a>
                  ))}
                </nav>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container max-w-4xl py-8 space-y-8">
            {/* Header */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold">Documentação da API</h1>
                <Badge variant="outline">v2.0</Badge>
              </div>
              <p className="text-lg text-muted-foreground">
                Referência completa dos endpoints disponíveis na API Next.js. Autenticação via Bearer Token ou x-api-key conforme indicado.
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-mono">
                  Base URL: <span className="text-primary">{process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.com'}</span>
                </p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border space-y-2">
                <h4 className="font-semibold text-sm">Métodos de Autenticação</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="bg-background p-2 rounded font-mono">
                    <span className="text-muted-foreground">Bearer Token:</span> Authorization: Bearer &lt;token&gt;
                  </div>
                  <div className="bg-background p-2 rounded font-mono">
                    <span className="text-muted-foreground">API Key:</span> x-api-key: &lt;chave&gt;
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* ==================== WHATSAPP ==================== */}
            <ApiSection
              id="whatsapp"
              title="WhatsApp"
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
            <div className="mt-12 pt-6 border-t">
              <p className="text-sm text-muted-foreground text-center">
                Documentação da API · Versão 2.0 · Última atualização: Março 2026
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

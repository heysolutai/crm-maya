import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { PostAction, ToolParam } from './types'

/**
 * Modelos de integracao que ja vem prontos no catalogo. Criados uma vez (pelo
 * slug); depois disso o super-admin edita a vontade e nada aqui sobrescreve.
 *
 * Reserve Maya: mesmo endpoint e acoes do fluxo de reservas do n8n
 * (check_availability, create_reservation, get_reservation,
 * cancel_reservation), com o restaurant_id vindo da caixa de entrada e o
 * telefone do cliente vindo do CRM, nunca da IA.
 */

const RESERVE_MAYA_URL = 'https://xhizgjsseeudrvneeyco.supabase.co/functions/v1'

const DATA: ToolParam = { key: 'date', type: 'date', description: 'Data da reserva', required: true }
const HORA: ToolParam = { key: 'time', type: 'time', description: 'Horário da reserva', required: true }
const PESSOAS: ToolParam = { key: 'people', type: 'integer', description: 'Quantidade de pessoas', required: true }
const CODIGO: ToolParam = {
  key: 'reservation_id',
  type: 'string',
  description: 'Código da reserva informado pelo cliente (ex: 8OBJ80C6)',
  required: true,
}

interface SeedTool {
  name: string
  label: string
  aiDescription: string
  promptHint: string
  parameters: ToolParam[]
  bodyTemplate: Record<string, unknown>
  responseTemplate: string | null
  postActions: PostAction[]
  isWrite: boolean
}

const RESERVE_MAYA_TOOLS: SeedTool[] = [
  {
    name: 'verificar_disponibilidade',
    label: 'Ver horários disponíveis',
    aiDescription:
      'Verifica se há mesa disponível para a data, o horário e o número de pessoas. Use antes de criar uma reserva.',
    promptHint: 'antes de reservar, verifique a disponibilidade',
    parameters: [DATA, HORA, PESSOAS],
    bodyTemplate: {
      action: 'check_availability',
      restaurant_id: '{{inbox.restaurant_id}}',
      date: '{{args.date}}',
      time: '{{args.time}}',
      people: '{{args.people}}',
    },
    responseTemplate: '{{resposta.ai_instruction}}',
    postActions: [],
    isWrite: false,
  },
  {
    name: 'criar_reserva',
    label: 'Fazer reservas',
    aiDescription:
      'Cria a reserva no sistema do restaurante. Use só depois de verificar a disponibilidade e de o cliente confirmar data, horário e número de pessoas.',
    promptHint: 'só reserve depois de o cliente confirmar data, horário e pessoas; envie o link de gerenciamento da reserva',
    parameters: [
      DATA,
      HORA,
      PESSOAS,
      { key: 'customer_name', type: 'string', description: 'Nome do cliente para a reserva, se ele informou', required: false },
      {
        key: 'comment',
        type: 'string',
        description: 'Observações do cliente (aniversário, cadeirinha, área externa...)',
        required: false,
      },
    ],
    bodyTemplate: {
      action: 'create_reservation',
      restaurant_id: '{{inbox.restaurant_id}}',
      customer_name: "{{args.customer_name || cliente.nome || 'Cliente'}}",
      customer_phone: '{{cliente.telefone}}',
      date: '{{args.date}}',
      time: '{{args.time}}',
      people: '{{args.people}}',
      comment: "{{args.comment || ''}}",
      channel: 'Maya',
    },
    responseTemplate: 'Reserva {{resposta.status}}. Link para o cliente gerenciar a reserva: {{resposta.management_url}}',
    postActions: [
      {
        type: 'registrar_reserva',
        data: '{{args.date}}',
        hora: '{{args.time}}',
        pessoas: '{{args.people}}',
        codigo: '{{resposta.reservation_id || resposta.reservation.id || resposta.code || resposta.reservation.code}}',
        observacao: "{{args.comment || ''}}",
        tipo: 'normal',
      },
    ],
    isWrite: true,
  },
  {
    name: 'consultar_reserva',
    label: 'Consultar reservas',
    aiDescription: 'Consulta os dados de uma reserva existente pelo código que o cliente informar.',
    promptHint: 'para consultar uma reserva, peça o código ao cliente',
    parameters: [CODIGO],
    bodyTemplate: {
      action: 'get_reservation',
      restaurant_id: '{{inbox.restaurant_id}}',
      reservation_id: '{{args.reservation_id}}',
    },
    responseTemplate:
      'Reserva de {{resposta.reservation.customer_name}}: {{resposta.reservation.date}} às {{resposta.reservation.time}}, {{resposta.reservation.people}} pessoas. Status: {{resposta.reservation.status}}.',
    postActions: [],
    isWrite: false,
  },
  {
    name: 'cancelar_reserva',
    label: 'Cancelar reservas',
    aiDescription: 'Cancela uma reserva existente pelo código. Confirme com o cliente antes de cancelar.',
    promptHint: 'antes de cancelar, confirme com o cliente o código e os dados da reserva',
    parameters: [CODIGO],
    bodyTemplate: {
      action: 'cancel_reservation',
      restaurant_id: '{{inbox.restaurant_id}}',
      reservation_id: '{{args.reservation_id}}',
    },
    responseTemplate: null,
    postActions: [{ type: 'cancelar_reserva_crm', codigo: '{{args.reservation_id}}' }],
    isWrite: true,
  },
]

let jaGarantido = false

/**
 * Cria os modelos que faltam no catalogo. Barato: roda uma vez por processo.
 *
 * Endereco e chave de acesso NAO vem do ambiente (.env): ficam no cadastro da
 * integracao (Super-admin > Integrações da IA > Conexão), criptografados no
 * banco, como um servidor de ferramentas que se conecta pela tela.
 */
export async function ensureDefaultIntegrations(): Promise<void> {
  if (jaGarantido) return
  const existente = await prisma.integration.findUnique({ where: { slug: 'reservemaya' }, select: { id: true } })
  if (existente) {
    jaGarantido = true
    return
  }

  try {
    await prisma.integration.create({
      data: {
        slug: 'reservemaya',
        name: 'Reserve Maya',
        description: 'Reservas feitas direto pela IA no Reserve Maya.',
        segment: 'restaurante',
        icon: '🍽️',
        baseUrl: RESERVE_MAYA_URL,
        headers: {},
        configFields: [],
        testToolName: 'verificar_disponibilidade',
        testArgs: { date: '{{agora.amanha}}', time: '20:00', people: 2 },
        tools: {
          create: RESERVE_MAYA_TOOLS.map((t, i) => ({
            name: t.name,
            label: t.label,
            aiDescription: t.aiDescription,
            promptHint: t.promptHint,
            parameters: t.parameters as unknown as Prisma.InputJsonValue,
            method: 'POST',
            path: '/reservations-api',
            bodyTemplate: t.bodyTemplate as Prisma.InputJsonValue,
            responseTemplate: t.responseTemplate,
            postActions: t.postActions as unknown as Prisma.InputJsonValue,
            isWrite: t.isWrite,
            sortOrder: i,
          })),
        },
      },
    })
  } catch (error) {
    // Dois processos criando ao mesmo tempo: o slug unico segura; segue.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
  }
  jaGarantido = true
}

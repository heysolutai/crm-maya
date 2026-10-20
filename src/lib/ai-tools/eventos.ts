import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { logConversationEvent } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { enviarImagensDaIA, type OpcoesImagens } from './enviar-midia'
import type { NativeTool } from './native'
import type { ToolContext } from './types'

/**
 * Eventos especiais do restaurante (tabelas special_events / event_registrations):
 * a IA mostra os eventos (com fotos) e anota as inscricoes. Tudo escopado por
 * empresa; telefone, cliente e conversa vem do contexto, nunca da IA.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JANELA_DUPLICADO_MS = 24 * 60 * 60 * 1000

interface EventoRow {
  id: string
  name: string
  description: string | null
  priceInfo: string | null
  eventDate: Date | null
  imageUrls: string[]
  extraFields: string[]
  capacity: number | null
}

const SELECT_EVENTO = {
  id: true, name: true, description: true, priceInfo: true,
  eventDate: true, imageUrls: true, extraFields: true, capacity: true,
} as const

/** Sem acento, minusculo, espacos normalizados. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function inicioDoDiaSaoPaulo(ctx: ToolContext): Date {
  return new Date(`${ctx.agora.data}T00:00:00-03:00`)
}

// O cadastro so tem DIA (a tela guarda 12:00 UTC pra data nao virar a do dia
// anterior). Nunca mostrar horario: seria inventado.
function formatarData(d: Date | null): string {
  if (!d) return 'data a combinar'
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Eventos ativos e ainda nao passados da empresa, na ordem de exibicao. */
async function eventosAtivos(ctx: ToolContext): Promise<EventoRow[]> {
  return prisma.specialEvent.findMany({
    where: {
      companyId: ctx.empresa.id,
      isActive: true,
      OR: [{ eventDate: null }, { eventDate: { gte: inicioDoDiaSaoPaulo(ctx) } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { eventDate: 'asc' }, { createdAt: 'asc' }],
    select: SELECT_EVENTO,
  })
}

async function vagasRestantes(companyId: string, evento: { id: string; capacity: number | null }): Promise<number | null> {
  if (evento.capacity == null) return null
  const regs = await prisma.eventRegistration.findMany({
    where: { companyId, eventId: evento.id, status: 'confirmed' },
    select: { guests: true },
  })
  const usadas = regs.reduce((acc, r) => acc + Math.max(1, r.guests ?? 1), 0)
  return Math.max(0, evento.capacity - usadas)
}

type Resolucao =
  | { tipo: 'achou'; evento: EventoRow }
  | { tipo: 'varios'; eventos: EventoRow[] }
  | { tipo: 'nenhum' }

async function resolverEvento(ctx: ToolContext, ref: string): Promise<Resolucao> {
  const eventos = await eventosAtivos(ctx)
  const q = ref.trim()
  if (UUID_RE.test(q)) {
    const e = eventos.find((x) => x.id.toLowerCase() === q.toLowerCase())
    return e ? { tipo: 'achou', evento: e } : { tipo: 'nenhum' }
  }
  const nq = normalizarTexto(q)
  if (!nq) return { tipo: 'nenhum' }
  const exato = eventos.filter((e) => normalizarTexto(e.name) === nq)
  if (exato.length === 1) return { tipo: 'achou', evento: exato[0] }
  const parcial = eventos.filter((e) => normalizarTexto(e.name).includes(nq))
  if (parcial.length === 1) return { tipo: 'achou', evento: parcial[0] }
  if (parcial.length > 1) return { tipo: 'varios', eventos: parcial }
  return { tipo: 'nenhum' }
}

function linhaResumo(e: EventoRow, vagas: number | null): string {
  const partes = [`- ${e.name} (id: ${e.id})`, formatarData(e.eventDate)]
  if (e.priceInfo) partes.push(`valor: ${e.priceInfo}`)
  if (vagas != null) partes.push(vagas > 0 ? `vagas restantes: ${vagas}` : 'ESGOTADO')
  const desc = e.description ? ` | ${e.description.replace(/\s+/g, ' ').slice(0, 120)}` : ''
  return partes.join(' | ') + desc
}

async function listaDeEventos(ctx: ToolContext, eventos: EventoRow[]): Promise<string> {
  const linhas: string[] = []
  for (const e of eventos) linhas.push(linhaResumo(e, await vagasRestantes(ctx.empresa.id, e)))
  return linhas.join('\n')
}

async function fotosEnviadasRecentemente(ctx: ToolContext, primeiraUrl: string): Promise<boolean> {
  if (!ctx.conversa.id) return false
  const m = await prisma.message.findFirst({
    where: {
      conversationId: ctx.conversa.id,
      conversation: { companyId: ctx.empresa.id },
      senderType: 'ai',
      mediaUrl: primeiraUrl,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { id: true },
  })
  return !!m
}

type ToolResult = { ok: boolean; result: string; error?: string }

export const consultarEventos: NativeTool = {
  name: 'consultar_eventos',
  label: 'Mostrar os eventos especiais (com fotos)',
  help: 'A IA conta ao cliente sobre os eventos cadastrados (data, valor, vagas) e já envia as fotos do evento na conversa.',
  description:
    'Lista os eventos especiais do estabelecimento ou, informando o parâmetro evento, mostra os detalhes de um evento e envia as fotos dele ao cliente. Use quando o cliente perguntar sobre eventos, shows, festas ou programação.',
  promptHint:
    'Se o cliente perguntar sobre eventos, use consultar_eventos sem parâmetro para ver a lista e pergunte qual interessa. Depois use consultar_eventos com o evento escolhido: as fotos são enviadas sozinhas, então não diga que vai mandar fotos nem repita as fotos. Nunca invente evento, data ou valor.',
  parameters: [
    { key: 'evento', type: 'string', description: 'Id ou nome do evento (da lista). Deixe vazio para listar todos.', required: false },
  ],
  isWrite: false,
  async run(ctx, args, opcoesImagens?: OpcoesImagens): Promise<ToolResult> {
    const ref = typeof args.evento === 'string' ? args.evento.trim() : ''
    if (!ref) {
      const eventos = await eventosAtivos(ctx)
      if (!eventos.length) {
        return { ok: true, result: 'Não há eventos especiais cadastrados no momento. Diga isso ao cliente com educação; não invente eventos.' }
      }
      return {
        ok: true,
        result: `Eventos disponíveis:\n${await listaDeEventos(ctx, eventos)}\n\nPergunte ao cliente qual evento interessa e então use consultar_eventos com esse evento para ver os detalhes e enviar as fotos.`,
      }
    }

    const r = await resolverEvento(ctx, ref)
    if (r.tipo === 'nenhum') {
      const eventos = await eventosAtivos(ctx)
      const lista = eventos.length ? `\nEventos disponíveis:\n${await listaDeEventos(ctx, eventos)}` : ''
      return { ok: false, result: `Não encontrei esse evento. Não invente: confira com o cliente qual evento ele quer.${lista}`, error: 'evento nao encontrado' }
    }
    if (r.tipo === 'varios') {
      return {
        ok: true,
        result: `Vários eventos combinam com "${ref}":\n${await listaDeEventos(ctx, r.eventos)}\n\nPeça ao cliente para dizer qual deles.`,
      }
    }

    const e = r.evento
    // Fotos: efeito colateral da ferramenta; nunca derruba o resultado.
    let fotos = 'Este evento não tem fotos cadastradas.'
    if (e.imageUrls.length) {
      if (!ctx.conversa.id) {
        fotos = 'As fotos não puderam ser enviadas (sem conversa), descreva o evento ao cliente.'
      } else if (await fotosEnviadasRecentemente(ctx, e.imageUrls[0])) {
        // A IA repete a chamada as vezes (retry): nao manda as mesmas fotos duas vezes.
        fotos = 'As fotos deste evento acabaram de ser enviadas ao cliente: não as envie de novo.'
      } else {
        const env = await enviarImagensDaIA(
          { companyId: ctx.empresa.id, conversationId: ctx.conversa.id, urls: e.imageUrls, legendaPrimeira: e.name },
          opcoesImagens
        )
        if (env.pausada) fotos = 'As fotos não foram enviadas porque o atendimento da IA está pausado para este cliente.'
        else if (env.enviadas === 0) fotos = 'As fotos não puderam ser enviadas, descreva o evento ao cliente.'
        else if (env.motivo) fotos = `Foram enviadas ${env.enviadas} foto(s); as demais não puderam ser enviadas.`
        else fotos = `As fotos do evento (${env.enviadas}) já foram enviadas ao cliente: não as envie de novo.`
      }
    }

    const vagas = await vagasRestantes(ctx.empresa.id, e)
    const linhas = [
      `Evento: ${e.name} (id: ${e.id})`,
      `Data: ${formatarData(e.eventDate)}`,
      `Valor: ${e.priceInfo || 'não informado'}`,
    ]
    if (e.description) linhas.push(`Descrição: ${e.description}`)
    if (vagas != null) linhas.push(vagas > 0 ? `Vagas restantes: ${vagas}` : 'Vagas: ESGOTADO (avise o cliente que não há mais vagas)')
    linhas.push(fotos)
    if (vagas == null || vagas > 0) {
      const extras = e.extraFields.length ? `, ${e.extraFields.join(', ')}` : ''
      linhas.push(
        `Para inscrever, peça ao cliente: nome, quantas pessoas${extras}. Depois use registrar_inscricao_evento (evento "${e.name}"), colocando as respostas dos dados extras em observacoes.`
      )
    }
    return { ok: true, result: linhas.join('\n') }
  },
}

export const registrarInscricaoEvento: NativeTool = {
  name: 'registrar_inscricao_evento',
  label: 'Anotar quem vai nos eventos',
  help: 'A IA anota o nome e a quantidade de pessoas de quem quer ir a um evento. A lista aparece no CRM para a equipe.',
  description:
    'Registra a inscrição de um cliente em um evento especial, depois que ele informou nome, quantidade de pessoas e os dados extras pedidos. O telefone vem da conversa.',
  promptHint:
    'Só registre a inscrição depois de ter o nome, a quantidade de pessoas e os dados extras do evento. Depois de registrar, confirme ao cliente e diga que a equipe entra em contato se precisar.',
  parameters: [
    { key: 'evento', type: 'string', description: 'Id ou nome do evento', required: true },
    { key: 'nome', type: 'string', description: 'Nome de quem vai se inscrever', required: true },
    { key: 'pessoas', type: 'integer', description: 'Quantidade de pessoas (de 1 a 200)', required: true },
    { key: 'observacoes', type: 'string', description: 'Respostas aos dados extras, ex.: "Alergia: amendoim"', required: false },
  ],
  isWrite: true,
  async run(ctx, args): Promise<ToolResult> {
    const nome = typeof args.nome === 'string' ? args.nome.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const pessoas = typeof args.pessoas === 'number' ? args.pessoas : Number.parseInt(String(args.pessoas ?? ''), 10)
    const obs = typeof args.observacoes === 'string' ? args.observacoes.trim().slice(0, 2000) : ''
    const ref = typeof args.evento === 'string' ? args.evento.trim() : ''
    if (!nome) return { ok: false, result: 'Falta o nome. Pergunte ao cliente o nome para a inscrição.', error: 'nome vazio' }
    if (!Number.isInteger(pessoas) || pessoas < 1 || pessoas > 200) {
      return { ok: false, result: 'Quantidade de pessoas inválida. Pergunte ao cliente quantas pessoas vão (de 1 a 200).', error: 'pessoas invalido' }
    }
    if (!ref) return { ok: false, result: 'Falta saber qual evento. Pergunte ao cliente.', error: 'evento vazio' }

    const r = await resolverEvento(ctx, ref)
    if (r.tipo === 'nenhum') {
      return { ok: false, result: 'Não encontrei esse evento (ou ele não está mais disponível). Confira com o cliente qual evento ele quer, usando consultar_eventos.', error: 'evento nao encontrado' }
    }
    if (r.tipo === 'varios') {
      return { ok: false, result: `Vários eventos combinam com "${ref}":\n${await listaDeEventos(ctx, r.eventos)}\nPeça ao cliente para dizer qual deles.`, error: 'evento ambiguo' }
    }
    const e = r.evento
    const telefone = ctx.cliente.telefone || null

    type Saida = { tipo: 'cheio'; vagas: number } | { tipo: 'ok'; atualizada: boolean; id: string }
    const saida = await prisma.$transaction(async (tx): Promise<Saida> => {
      // Serializa inscricoes do mesmo evento (capacidade nao estoura em paralelo).
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${e.id}))`)
      const existente = telefone
        ? await tx.eventRegistration.findFirst({
            where: {
              companyId: ctx.empresa.id, eventId: e.id, phone: telefone, status: 'confirmed',
              createdAt: { gte: new Date(Date.now() - JANELA_DUPLICADO_MS) },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
        : null

      if (e.capacity != null) {
        const regs = await tx.eventRegistration.findMany({
          where: { companyId: ctx.empresa.id, eventId: e.id, status: 'confirmed', ...(existente ? { id: { not: existente.id } } : {}) },
          select: { guests: true },
        })
        const usadas = regs.reduce((acc, x) => acc + Math.max(1, x.guests ?? 1), 0)
        const restam = Math.max(0, e.capacity - usadas)
        if (pessoas > restam) return { tipo: 'cheio', vagas: restam }
      }

      if (existente) {
        await tx.eventRegistration.update({
          where: { id: existente.id },
          data: { name: nome, guests: pessoas, ...(obs ? { notes: obs } : {}), conversationId: ctx.conversa.id, clientId: ctx.cliente.id },
        })
        return { tipo: 'ok', atualizada: true, id: existente.id }
      }
      const criada = await tx.eventRegistration.create({
        data: {
          companyId: ctx.empresa.id, eventId: e.id, conversationId: ctx.conversa.id, clientId: ctx.cliente.id,
          name: nome, phone: telefone, guests: pessoas, notes: obs || null, status: 'confirmed', source: 'ai',
        },
        select: { id: true },
      })
      return { tipo: 'ok', atualizada: false, id: criada.id }
    })

    if (saida.tipo === 'cheio') {
      return {
        ok: false,
        result: saida.vagas > 0
          ? `Não há vagas suficientes: restam só ${saida.vagas} vaga(s) em "${e.name}". Avise o cliente e pergunte se quer se inscrever com essa quantidade.`
          : `O evento "${e.name}" está esgotado. Avise o cliente com educação; não registre a inscrição.`,
        error: 'sem vagas',
      }
    }

    if (ctx.conversa.id) {
      await logConversationEvent({
        companyId: ctx.empresa.id,
        conversationId: ctx.conversa.id,
        type: 'handoff_event',
        actor: 'ai',
        metadata: { source: 'ai_tool', evento: e.name.slice(0, 200) },
      })
      try {
        const conv = await prisma.conversation.findFirst({
          where: { id: ctx.conversa.id, companyId: ctx.empresa.id },
          select: { tags: true },
        })
        if (conv && !conv.tags.includes('Eventos')) {
          await prisma.conversation.update({ where: { id: ctx.conversa.id }, data: { tags: [...conv.tags, 'Eventos'] } })
        }
        await publishEvent(ctx.empresa.id, { type: 'conversation:update', conversationId: ctx.conversa.id })
      } catch (err) {
        console.error('[ai-tools] pos-inscricao falhou:', (err as Error)?.message)
      }
    }

    const quando = saida.atualizada ? 'Esta inscrição já existia e foi atualizada com os novos dados.' : 'Inscrição registrada.'
    return {
      ok: true,
      result: `${quando} Evento: ${e.name}. Nome: ${nome}. Pessoas: ${pessoas}.${obs ? ` Observações: ${obs}.` : ''} Confirme esses dados com o cliente e avise que a equipe entra em contato se precisar de algo mais. Não transfira a conversa.`,
    }
  },
}

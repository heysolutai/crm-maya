import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { CHANNEL_TYPES, isChannelType, CHANNEL_REGISTRY } from '@/lib/channels/types'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { ChannelError } from '@/lib/channels/errors'
import { normalizeCompanySlug, buildAgentMemoryKey } from '@/lib/api/utils'
import { maskKey, redactChannelConfig, redactDeep, REDACTED } from '@/lib/api/redact'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

/**
 * Garante que a inbox recem-criada tem um AiAgent DEDICADO (1:1).
 * Cada instancia conectada = seu proprio agente, nunca compartilhado — no
 * produto restaurante "conexao" e "agente" sao a mesma coisa. Por isso sempre
 * cria um agente novo (em branco) e vincula a esta inbox.
 */
async function ensureInboxAiAgent(inboxId: string, companyId: string, displayName: string) {
  const inbox = await prisma.inbox.findUnique({
    where: { id: inboxId },
    select: { aiAgentId: true },
  })
  if (inbox?.aiAgentId) return

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const slug = normalizeCompanySlug(company?.name || displayName)

  const newAiAgentId = randomUUID()
  await prisma.aiAgent.create({
    data: {
      id: newAiAgentId,
      companyId,
      name: displayName,
      prompts: {} as Prisma.InputJsonValue,
      behaviorSettings: {} as Prisma.InputJsonValue,
      conditions: {} as Prisma.InputJsonValue,
      apiKeys: {} as Prisma.InputJsonValue,
      variables: {} as Prisma.InputJsonValue,
      knowledge: slug ? `know_${slug}` : null,
      memoryKey: buildAgentMemoryKey(newAiAgentId, displayName),
      productsKnowledge: slug ? `products_${slug}` : null,
      n8nWebhookUrl: null,
      followUpEnabled: false,
      followUpStages: [] as Prisma.InputJsonValue,
      isActive: true,
    },
  })

  await prisma.inbox.update({
    where: { id: inboxId },
    data: { aiAgentId: newAiAgentId },
  })
}

const createAgentSchema = z.object({
  channelType: z.enum(CHANNEL_TYPES),
  displayName: z.string().min(1).max(255),
  serverUrl: z.string().url().optional(),
  serverApiKey: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  // Campos extras especificos do canal (ex: NotificaMe usa channelId + senderUserId)
  extra: z.record(z.string(), z.any()).optional(),
  // Vinculacao de AiAgent (M:1) — escolha do usuario no dialog de criacao
  aiAgentId: z.string().uuid().optional(),         // reutilizar agente existente
  createAiAgentNamed: z.string().min(1).optional(), // criar novo agente com esse nome
  // Como obter a instancia no provider:
  //   'create'   -> provisiona uma instancia nova (default, comportamento antigo)
  //   'existing' -> adota uma instancia que ja existe, usando o token dela
  mode: z.enum(['create', 'existing']).optional(),
  /** Token DA INSTANCIA existente — obrigatorio quando mode = 'existing'. */
  instanceToken: z.string().min(1).optional(),
  /** Identificador do restaurante no sistema de reservas. */
  restaurantId: z.string().max(120).optional(),
})

/**
 * Edicao da inbox.
 *
 * TUDO que se define na criacao precisa ser editavel aqui: token expira, o
 * servidor muda de endereco, o restaurante e recadastrado. Sem isso o unico
 * caminho seria remover a inbox e criar de novo — perdendo as conversas
 * vinculadas a ela.
 *
 * Campos ausentes nao sao tocados. Nos segredos, string vazia tambem nao
 * muda nada: a tela recebe o valor MASCARADO, e tratar "vazio" como "apagar"
 * faria um salvamento distraido zerar o token da instancia.
 */
const updateAgentSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  // Permite trocar/remover o vinculo com AiAgent. Mande string vazia/null pra remover.
  aiAgentId: z.union([z.string().uuid(), z.null()]).optional(),
  phoneNumber: z.string().max(30).optional(),
  /** URL do servidor do provedor (ex: https://sua.uazapi.com). */
  apiUrl: z.string().url().optional(),
  /** Token DA INSTANCIA — o que autentica os envios (UazAPI, Evolution). */
  instanceApiKey: z.string().optional(),
  /** Token de ADMIN do servidor — cria/remove instancias. */
  adminToken: z.string().optional(),
  /** Identificador do restaurante no sistema de reservas (vive no channelConfig). */
  restaurantId: z.string().max(120).optional(),
})

function mapAgent(i: any) {
  return {
    id: i.id,
    company_id: i.companyId,
    channel_type: i.channelType,
    display_name: i.displayName || i.instanceName,
    phone_number: i.phoneNumber,
    instance_name: i.instanceName,
    api_url: i.apiUrl,
    // Segredos mascarados — nunca vao em texto puro pro cliente (vazamento).
    instance_api_key: maskKey(i.instanceApiKey),
    admin_token: maskKey(i.adminToken),
    status: i.status,
    is_active: i.isActive,
    qr_code: i.qrCode,
    error_message: i.errorMessage,
    last_connected_at: i.lastConnectedAt,
    // Resposta crua do provedor no provisionamento — carrega o token da
    // instancia (Evolution em `hash.apikey`, UazAPI no corpo do init). Sem
    // redigir, o segredo mascarado logo acima em `instance_api_key` saia
    // inteiro por aqui.
    metadata: redactDeep(i.metadata),
    channel_config: redactChannelConfig(i.channelConfig),
    // Atalho pro identificador do restaurante (fica dentro do channel_config)
    restaurant_id: (i.channelConfig as Record<string, unknown> | null)?.restaurantId ?? null,
    ai_agent_id: i.aiAgentId,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }
}

// De-para provider -> rota do receiver de webhook.
//
// Pegadinha: o channelType do provider NAO bate com o nome da pasta da rota.
// Antes a URL era montada com `/api/webhooks/${channelType}`, entao um inbox
// uazapi recebia webhook apontado pra /api/webhooks/uazapi -> rota inexistente
// (404) -> a instancia nunca recebia mensagem (e o erro era engolido no setup).
// So o notificame batia por coincidencia.
//
//   uazapi            -> /api/webhooks/whatsapp
//   evolution_baileys -> /api/webhooks/evolution
//   notificame        -> /api/webhooks/notificame
//
// Quem chegar com um canal novo: cadastra aqui a rota correspondente.
// (a inbox e resolvida pelo instanceName do payload; o agentId vai na query
//  como identificador explicito/fallback).
const WEBHOOK_ROUTE_BY_CHANNEL: Record<string, string> = {
  uazapi: 'whatsapp',
  evolution_baileys: 'evolution',
  notificame: 'notificame',
}

function publicWebhookUrl(req: NextRequest, channelType: string, agentId: string): string {
  const envBase = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  const base = envBase || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const route = WEBHOOK_ROUTE_BY_CHANNEL[channelType] || channelType
  return `${base.replace(/\/+$/, '')}/api/webhooks/${route}?agentId=${agentId}`
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const agents = await prisma.inbox.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(agents.map(mapAgent))
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar agentes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const validation = createAgentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const {
      channelType, displayName, phoneNumber, extra, aiAgentId, createAiAgentNamed,
      mode, instanceToken, restaurantId,
    } = validation.data
    let { serverUrl, serverApiKey } = validation.data

    // 'existing' = usuario colou o token de uma instancia que ja existe.
    const useExisting = mode === 'existing'
    if (useExisting && !instanceToken) {
      return NextResponse.json(
        { error: 'Informe o token da instancia existente' },
        { status: 400 }
      )
    }

    // Resolve qual AiAgent vinculado: prioridade explicita do user > fallback (primeiro existente / criar novo).
    // Valida ownership do aiAgentId pra evitar IDOR.
    let resolvedAiAgentId: string | null = null
    if (aiAgentId) {
      const agent = await prisma.aiAgent.findFirst({
        where: { id: aiAgentId, companyId },
        select: { id: true },
      })
      if (!agent) {
        return NextResponse.json({ error: 'Agente IA invalido' }, { status: 400 })
      }
      resolvedAiAgentId = agent.id
    } else if (createAiAgentNamed) {
      const namedAiAgentId = randomUUID()
      const newAgent = await prisma.aiAgent.create({
        data: {
          id: namedAiAgentId,
          companyId,
          name: createAiAgentNamed,
          prompts: {} as Prisma.InputJsonValue,
          behaviorSettings: {} as Prisma.InputJsonValue,
          conditions: {} as Prisma.InputJsonValue,
          apiKeys: {} as Prisma.InputJsonValue,
          variables: {} as Prisma.InputJsonValue,
          followUpStages: [] as Prisma.InputJsonValue,
          memoryKey: buildAgentMemoryKey(namedAiAgentId, createAiAgentNamed),
          isActive: true,
        },
        select: { id: true },
      })
      resolvedAiAgentId = newAgent.id
    }

    if (!isChannelType(channelType)) {
      return NextResponse.json({ error: 'Canal invalido' }, { status: 400 })
    }

    const channelMeta = CHANNEL_REGISTRY[channelType]
    if (channelMeta.status !== 'available') {
      return NextResponse.json(
        { error: 'Canal ainda nao disponivel', code: 'CHANNEL_UNAVAILABLE' },
        { status: 400 }
      )
    }

    // NotificaMe usa URL fixa — preenche aqui pra a upsert de channelCredential
    // funcionar e pra UI nao precisar coletar.
    if (channelType === 'notificame' && !serverUrl) {
      serverUrl = 'https://api.notificame.com.br'
    }

    // Resolucao de credenciais: se o form nao mandou, busca a credencial
    // salva pra (empresa, canal). Se mandou, salva/atualiza pra reuso futuro.
    if (hasAdapter(channelType)) {
      if (!serverUrl || !serverApiKey) {
        const saved = await prisma.channelCredential.findUnique({
          where: { companyId_channelType: { companyId, channelType } },
        })
        if (saved) {
          serverUrl = serverUrl || saved.serverUrl
          serverApiKey = serverApiKey || saved.serverApiKey
        }
        // UAZAPI (API Reservemaya): URL + admin token vem do AMBIENTE (.env/stack),
        // nao do form. Fallback final pra config global — usuario nao digita nada.
        if (channelType === 'uazapi') {
          serverUrl = serverUrl || process.env.UAZAPI_BASE_URL || ''
          serverApiKey = serverApiKey || process.env.WHATSAPP_ADMIN_TOKEN || ''
        }
      } else {
        // Persiste/atualiza pra proxima criacao nao precisar redigitar
        await prisma.channelCredential.upsert({
          where: { companyId_channelType: { companyId, channelType } },
          create: { companyId, channelType, serverUrl, serverApiKey },
          update: { serverUrl, serverApiKey },
        }).catch((e) => console.error('[agents:create] upsert credential failed', e))
      }
    }

    // Canais via adapter (ex: evolution_baileys): chama provision pra criar
    // a instancia no provider externo, depois grava no banco com as credenciais retornadas.
    if (hasAdapter(channelType)) {
      const adapter = getAdapter(channelType)

      // Canal precisa implementar adopt() pra aceitar token de instancia existente.
      if (useExisting && typeof adapter.adopt !== 'function') {
        return NextResponse.json(
          { error: 'Este canal nao aceita token de instancia existente', code: 'ADOPT_UNSUPPORTED' },
          { status: 400 }
        )
      }

      // Cria placeholder no banco antes pra ter agent.id pra usar no webhook URL
      const placeholder = await prisma.inbox.create({
        data: {
          companyId,
          instanceName: `pending-${Date.now()}`,
          displayName,
          channelType,
          apiUrl: serverUrl || null,
          status: 'connecting',
          isActive: true,
        },
      })

      const webhookUrl = publicWebhookUrl(req, channelType, placeholder.id)

      try {
        const result = useExisting
          ? await adapter.adopt!({
              companyId,
              displayName,
              serverUrl,
              instanceToken: instanceToken!,
              webhookUrl,
              extra,
            })
          : await adapter.provision({
              companyId,
              displayName,
              serverUrl,
              serverApiKey,
              phoneNumber,
              webhookUrl,
              extra,
            })

        // restaurantId entra no channelConfig (JSON ja existente) — evita
        // migration so pra guardar um identificador do sistema de reservas.
        const channelConfig = {
          ...result.channelConfig,
          ...(restaurantId ? { restaurantId } : {}),
        }

        const agent = await prisma.inbox.update({
          where: { id: placeholder.id },
          data: {
            instanceName: result.providerInstanceName,
            apiUrl: result.apiUrl,
            instanceApiKey: result.instanceApiKey,
            channelConfig: channelConfig as any,
            metadata: result.metadata as any,
            qrCode: result.qrCode || null,
            status: result.qrCode ? 'connecting' : 'disconnected',
            phoneNumber: phoneNumber || null,
          },
        })

        // Vincula AiAgent: se user escolheu explicito usa esse, senao fallback (cria/reusa o primeiro)
        if (resolvedAiAgentId) {
          await prisma.inbox.update({
            where: { id: agent.id },
            data: { aiAgentId: resolvedAiAgentId },
          }).catch((e) => console.error('[agents:provision] bind aiAgent failed', e))
        } else {
          await ensureInboxAiAgent(agent.id, companyId, displayName).catch((e) =>
            console.error('[agents:provision] ensureInboxAiAgent failed', e)
          )
        }

        const finalAgent = await prisma.inbox.findUnique({ where: { id: agent.id } })
        return NextResponse.json(mapAgent(finalAgent || agent), { status: 201 })
      } catch (provisionError: unknown) {
        // Rollback: remove placeholder se o provider rejeitou
        await prisma.inbox.delete({ where: { id: placeholder.id } }).catch(() => {})

        if (provisionError instanceof ChannelError) {
          console.error(`[agents:provision] ${provisionError.code}:`, provisionError.message, {
            providerStatus: provisionError.providerStatus,
          })
          return NextResponse.json(
            { error: provisionError.message, code: provisionError.code },
            { status: provisionError.httpStatus }
          )
        }

        console.error('[agents:provision]', provisionError)
        return NextResponse.json(
          {
            error: (provisionError as Error)?.message || 'Falha ao provisionar agente',
            code: 'INTERNAL_ERROR',
          },
          { status: 502 }
        )
      }
    }

    // Canal sem adapter (uazapi legado): cria registro local.
    const slug = displayName
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 30)
    const instanceName = `${slug}-${companyId.slice(0, 8)}`

    const agent = await prisma.inbox.create({
      data: {
        companyId,
        instanceName,
        displayName,
        channelType,
        status: 'disconnected',
        isActive: true,
      },
    })

    if (resolvedAiAgentId) {
      await prisma.inbox.update({
        where: { id: agent.id },
        data: { aiAgentId: resolvedAiAgentId },
      }).catch((e) => console.error('[agents:create] bind aiAgent failed', e))
    } else {
      await ensureInboxAiAgent(agent.id, companyId, displayName).catch((e) =>
        console.error('[agents:create] ensureInboxAiAgent failed', e)
      )
    }

    const finalAgent = await prisma.inbox.findUnique({ where: { id: agent.id } })
    return NextResponse.json(mapAgent(finalAgent || agent), { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar agente')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const validation = updateAgentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, aiAgentId, instanceApiKey, adminToken, restaurantId, ...updates } = validation.data

    const existing = await prisma.inbox.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    // Se aiAgentId foi enviado (mesmo null pra remover), valida ownership antes de aplicar
    const dataToUpdate: any = { ...updates }

    // Segredos: so trocam quando vem valor NOVO de verdade. A tela recebe o
    // valor mascarado (••••X5UA); se ela devolvesse isso ou vazio e a gente
    // gravasse, o token real seria destruido por um salvamento qualquer.
    const ehValorNovo = (v: string | undefined) =>
      typeof v === 'string' && v.trim().length > 0 && v !== REDACTED && !v.startsWith('••••')

    if (ehValorNovo(instanceApiKey)) dataToUpdate.instanceApiKey = instanceApiKey!.trim()
    if (ehValorNovo(adminToken)) dataToUpdate.adminToken = adminToken!.trim()

    // restaurantId mora dentro do Json channelConfig — precisa de merge, nao
    // de substituicao: gravar o objeto inteiro apagaria serverApiKey e
    // webhookUrl, que estao no mesmo Json e ninguem edita nesta tela.
    if (restaurantId !== undefined) {
      const cfgAtual = (existing.channelConfig as Record<string, unknown> | null) || {}
      dataToUpdate.channelConfig = {
        ...cfgAtual,
        // Vazio = desvincular o restaurante, que e uma acao legitima aqui
        // (diferente de segredo, onde vazio significa "nao mexi").
        restaurantId: restaurantId.trim() || null,
      }
    }
    if (aiAgentId !== undefined) {
      if (aiAgentId === null) {
        dataToUpdate.aiAgentId = null
      } else {
        const agent = await prisma.aiAgent.findFirst({
          where: { id: aiAgentId, companyId },
          select: { id: true },
        })
        if (!agent) {
          return NextResponse.json({ error: 'Agente IA invalido' }, { status: 400 })
        }
        dataToUpdate.aiAgentId = aiAgentId
      }
    }

    const updated = await prisma.inbox.update({
      where: { id },
      data: dataToUpdate,
    })

    return NextResponse.json(mapAgent(updated))
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar agente')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })

    const existing = await prisma.inbox.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    // Tenta remover do provider antes de apagar local. Falha silenciosa pra
    // nao travar delete se o provider estiver fora do ar.
    if (isChannelType(existing.channelType) && hasAdapter(existing.channelType as any)) {
      try {
        const adapter = getAdapter(existing.channelType as any)
        await adapter.remove({
          id: existing.id,
          companyId: existing.companyId,
          channelType: existing.channelType as any,
          instanceName: existing.instanceName,
          displayName: existing.displayName,
          phoneNumber: existing.phoneNumber,
          apiUrl: existing.apiUrl,
          instanceApiKey: existing.instanceApiKey,
          channelConfig: existing.channelConfig as any,
          metadata: existing.metadata as any,
        })
      } catch (e) {
        console.error('[agents:remove provider]', e)
      }
    }

    await prisma.inbox.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao deletar agente')
  }
}

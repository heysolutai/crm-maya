import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Lista canais disponiveis na conta NotificaMe a partir de um API token.
 *
 * Usado pelo dialog de "Novo Agente" pra mostrar dropdown ao inves de
 * pedir UUID do canal digitado.
 *
 * Recebe o token no body (nao na query/header) pra nao vazar em logs.
 * Exige usuario autenticado — qualquer admin de empresa pode validar
 * tokens; o token NotificaMe nao e persistido aqui.
 */

const NOTIFICAME_BASE_URL = 'https://api.notificame.com.br'

const listSchema = z.object({
  apiToken: z.string().min(1, 'API token obrigatorio'),
})

interface NotificameChannel {
  id: string
  name?: string
  type?: string
  status?: string
  raw: Record<string, unknown>
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function normalize(item: any): NotificameChannel | null {
  if (!item || typeof item !== 'object') return null
  const id = pickString(item.id, item.channelId, item.channel_id, item.uuid)
  if (!id) return null
  return {
    id,
    name: pickString(item.name, item.displayName, item.display_name, item.label),
    type: pickString(item.type, item.channel, item.channelType, item.channel_type),
    status: pickString(item.status, item.state),
    raw: item,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = listSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { apiToken } = parsed.data

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let res: Response
    try {
      res = await fetch(`${NOTIFICAME_BASE_URL}/v1/channels`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-Token': apiToken,
        },
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timeout)
      return NextResponse.json(
        { error: 'Nao foi possivel conectar ao NotificaMe' },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeout)
    }

    const text = await res.text()
    let data: any = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text }
      }
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: 'Token NotificaMe invalido' },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { error: 'Falha ao listar canais', details: data },
        { status: 502 }
      )
    }

    // Resposta pode vir como array direto OU como { channels: [...] } OU { data: [...] }
    const rawList: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.channels)
        ? data.channels
        : Array.isArray(data?.data)
          ? data.data
          : []

    const channels = rawList
      .map(normalize)
      .filter((c): c is NotificameChannel => c !== null)

    return NextResponse.json({ channels })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar canais NotificaMe')
  }
}

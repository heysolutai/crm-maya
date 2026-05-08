import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { getSystemSettingFresh } from '@/lib/system-settings'

/**
 * GET /api/admin/system-settings/test-openai
 *
 * Testa a key OpenAI armazenada em system_config validando ela contra
 * a API real (chama /v1/models — endpoint barato e rapido).
 * Util pra confirmar que a key salva pelo super-admin esta valida sem
 * precisar enviar audio pra transcrever.
 */
export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
    }

    const key = await getSystemSettingFresh('default_openai_api_key')
    if (!key) {
      return NextResponse.json({
        ok: false,
        reason: 'NOT_CONFIGURED',
        message: 'Nenhuma OpenAI key configurada (system_config nem env).',
      })
    }

    const lastChars = key.slice(-4)
    const length = key.length
    const hasWhitespace = /\s/.test(key)

    // Valida contra OpenAI
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    })

    if (res.status === 200) {
      return NextResponse.json({
        ok: true,
        last_chars: lastChars,
        length,
        has_whitespace: hasWhitespace,
        message: 'Key valida — autenticada pela OpenAI',
      })
    }

    const errBody = await res.text().catch(() => '')
    return NextResponse.json({
      ok: false,
      reason: res.status === 401 ? 'INVALID_KEY' : 'API_ERROR',
      status: res.status,
      last_chars: lastChars,
      length,
      has_whitespace: hasWhitespace,
      message: `OpenAI rejeitou a key (${res.status})`,
      openai_response: errBody.slice(0, 500),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao testar key OpenAI')
  }
}

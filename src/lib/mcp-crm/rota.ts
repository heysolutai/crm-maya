import { NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'
import { authenticate } from '@/lib/api/auth'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { handleApiError } from '@/lib/api/errors'
import { ErroConfig } from './configuracao'

/**
 * Guarda das rotas /api/mcp-config (configuracao que o MCP do Hermes altera).
 *
 * Ler: qualquer chamada autenticada do restaurante (sessao, chave de API, MCP).
 * Escrever: so o MCP do super-admin (token completo, pelo loopback) ou o admin
 * do restaurante logado. A chave de API do restaurante (n8n) NAO escreve aqui.
 */
export async function autorizar(
  req: NextRequest,
  escrita: boolean
): Promise<{ companyId: string } | { erro: NextResponse }> {
  const auth = await authenticate(req)
  if (!auth.companyId) return { erro: NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 }) }
  if (escrita && !auth.viaMcpAdmin && !(await isCompanyAdmin(auth))) {
    return {
      erro: NextResponse.json(
        { error: 'Só o MCP do super-admin ou o administrador do restaurante altera esta configuração.' },
        { status: 403 }
      ),
    }
  }
  return { companyId: auth.companyId }
}

/** Erros de validacao numa frase so (o Hermes le e corrige). */
export function dadosInvalidos(error: z.ZodError): NextResponse {
  const problemas = error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
  return NextResponse.json({ error: `Dados invalidos. ${problemas.join(' | ')}` }, { status: 400 })
}

/** ErroConfig traz frase nossa (pode ir pro cliente); o resto vira erro generico. */
export function responderErro(error: unknown, contexto: string): NextResponse {
  if (error instanceof ErroConfig) return NextResponse.json({ error: error.message }, { status: error.status })
  return handleApiError(error, contexto)
}

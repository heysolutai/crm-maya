import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { jsonResponse } from './cors'

/**
 * Classe de erro especifica para falhas de autenticacao.
 * Quando lancada de dentro de uma rota, o handleApiError retorna o status
 * correto (401/403) em vez de cair no fallback de 500.
 */
export class AuthError extends Error {
  status: number
  code: string

  constructor(message: string, status = 401, code = 'AUTH_ERROR') {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.code = code
  }
}

/**
 * Erros de validacao de input — distinto do Zod errors mas pra casos
 * onde queremos lancar erro manualmente com mensagem custom (ex: regra
 * de negocio violada antes da query).
 */
export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(message: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Erro de "nao encontrado" — atalho pra 404 com mensagem padronizada.
 */
export class NotFoundError extends ApiError {
  constructor(message = 'Recurso nao encontrado') {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

/**
 * Classifica um erro qualquer em { body, status } padronizado, sem expor
 * detalhes internos ao cliente. Uso interno.
 */
function classifyError(error: unknown, contextLog: string): { body: Record<string, unknown>; status: number } {
  if (error instanceof AuthError) {
    return { body: { error: error.message, code: error.code }, status: error.status }
  }

  if (error instanceof ApiError) {
    const body: Record<string, unknown> = { error: error.message, code: error.code }
    if (error.details !== undefined) body.details = error.details
    return { body, status: error.status }
  }

  if (error instanceof ZodError) {
    return {
      body: {
        error: 'Dados invalidos',
        code: 'VALIDATION_ERROR',
        details: error.flatten().fieldErrors,
      },
      status: 400,
    }
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const prismaCode = (error as { code: string }).code
    if (prismaCode === 'P2002') {
      return { body: { error: 'Registro duplicado', code: 'DUPLICATE' }, status: 409 }
    }
    if (prismaCode === 'P2025') {
      return { body: { error: 'Registro nao encontrado', code: 'NOT_FOUND' }, status: 404 }
    }
  }

  // Fallback — 500 generico, mas log completo no servidor
  console.error(`[${contextLog}]`, error)
  return { body: { error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' }, status: 500 }
}

/**
 * Handler central de erros pras API routes que NAO precisam de CORS headers
 * (rotas internas chamadas pelo proprio frontend Next).
 *
 * Uso padrao:
 *
 *   try {
 *     // logica
 *   } catch (error) {
 *     return handleApiError(error, 'Erro ao buscar conversas')
 *   }
 *
 * O segundo argumento e o contexto pra log no servidor — nao vaza ao cliente.
 */
export function handleApiError(error: unknown, contextLog = 'API error'): NextResponse {
  const { body, status } = classifyError(error, contextLog)
  return NextResponse.json(body, { status })
}

/**
 * Variante do handleApiError que retorna a resposta com headers de CORS.
 * Usar em rotas que tem OPTIONS handler (rotas chamadas de origens externas
 * tipo n8n, app mobile, etc).
 */
export function handleApiErrorCors(error: unknown, contextLog = 'API error'): NextResponse {
  const { body, status } = classifyError(error, contextLog)
  return jsonResponse(body, status)
}


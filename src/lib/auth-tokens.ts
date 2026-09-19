import crypto from 'crypto'
import { prisma } from '@/lib/db'
import type { AuthTokenType } from '@prisma/client'

/**
 * Tokens de uso unico mandados por e-mail (recuperar senha e convite).
 *
 * O token cru so existe no link do e-mail. No banco fica o SHA-256 dele, do
 * mesmo jeito que a senha vira hash: quem conseguir ler a tabela nao entra na
 * conta de ninguem.
 *
 * SHA-256 sem salt e o certo aqui (diferente de senha): o token ja tem 256
 * bits de aleatoriedade, entao nao ha o que adivinhar por forca bruta, e o
 * hash precisa ser deterministico pra dar pra buscar pelo indice.
 */

/** 1 hora pra trocar a senha; convite dura bem mais. */
export const VALIDADE_RECUPERACAO_MINUTOS = 60
export const VALIDADE_CONVITE_DIAS = 7

function hashDoToken(cru: string): string {
  return crypto.createHash('sha256').update(cru).digest('hex')
}

/**
 * Cria um token novo e invalida os anteriores do mesmo tipo.
 *
 * Invalidar os antigos evita que um link de e-mail velho continue valendo
 * depois de a pessoa pedir outro.
 *
 * @returns o token cru, que so deve ir pro link do e-mail.
 */
export async function criarAuthToken(
  userId: string,
  type: AuthTokenType,
  validadeMs: number
): Promise<string> {
  const cru = crypto.randomBytes(32).toString('base64url')

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashDoToken(cru),
        expiresAt: new Date(Date.now() + validadeMs),
      },
    }),
  ])

  return cru
}

export interface TokenValido {
  id: string
  userId: string
  type: AuthTokenType
  email: string
  nome: string | null
}

/**
 * Confere o token sem gastar. Serve pra tela decidir se mostra o formulario
 * ou a mensagem de link expirado.
 */
export async function lerAuthToken(cru: string): Promise<TokenValido | null> {
  if (!cru) return null

  const registro = await prisma.authToken.findUnique({
    where: { tokenHash: hashDoToken(cru) },
    select: {
      id: true,
      userId: true,
      type: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, fullName: true, isActive: true } },
    },
  })

  if (!registro || registro.usedAt || registro.expiresAt < new Date()) return null
  if (!registro.user?.isActive) return null

  return {
    id: registro.id,
    userId: registro.userId,
    type: registro.type,
    email: registro.user.email,
    nome: registro.user.fullName,
  }
}

/**
 * Gasta o token: marca como usado e devolve de quem era.
 *
 * O `updateMany` com `usedAt: null` no filtro e o que garante o uso unico —
 * duas requisicoes simultaneas com o mesmo link, so uma atualiza uma linha.
 */
export async function consumirAuthToken(cru: string): Promise<TokenValido | null> {
  const valido = await lerAuthToken(cru)
  if (!valido) return null

  const { count } = await prisma.authToken.updateMany({
    where: { id: valido.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  return count === 1 ? valido : null
}

/** Derruba os links pendentes do usuario (apos trocar a senha, por exemplo). */
export async function invalidarTokensDoUsuario(userId: string): Promise<void> {
  await prisma.authToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  })
}

/**
 * Helpers usados pelas rotas de /api/agents pra reagir a erros do canal:
 *  - persiste error_message + status no banco quando aplicavel
 *  - converte ChannelError em NextResponse com code legivel pelo frontend
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ChannelError } from './errors';

export interface ChannelErrorResponseOptions {
  /** Se passado, atualiza error_message + (opcional) status do agente */
  agentId?: string;
  /** Contexto pra log (ex: 'agents:qr', 'agents:provision') */
  contextLog: string;
  /** Mensagem fallback pra erros genericos (Error normal, nao ChannelError) */
  fallbackMessage?: string;
}

/**
 * Gera resposta HTTP padronizada e atualiza estado do agente quando o erro
 * indica problema persistente (credencial invalida, instancia removida).
 */
export async function respondToChannelError(
  error: unknown,
  opts: ChannelErrorResponseOptions
): Promise<NextResponse> {
  if (error instanceof ChannelError) {
    console.error(`[${opts.contextLog}] ${error.code}:`, error.message, {
      providerStatus: error.providerStatus,
    });

    // Marca o agente em erro quando faz sentido (UI mostra error_message)
    if (opts.agentId && error.isFatal) {
      await prisma.whatsappInstance.update({
        where: { id: opts.agentId },
        data: {
          status: 'error',
          errorMessage: error.message,
          qrCode: null,
        },
      }).catch(() => {});
    } else if (opts.agentId && (error.code === 'PROVIDER_UNREACHABLE' || error.code === 'NETWORK_ERROR')) {
      // Server offline — nao marca como `error` permanente, so loga a ultima
      // mensagem pra UI exibir. Status fica como esta.
      await prisma.whatsappInstance.update({
        where: { id: opts.agentId },
        data: { errorMessage: error.message },
      }).catch(() => {});
    }

    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.httpStatus }
    );
  }

  // Erro nao tipado — log completo no servidor, mensagem generica ao cliente
  console.error(`[${opts.contextLog}]`, error);
  return NextResponse.json(
    { error: opts.fallbackMessage || 'Erro interno do servidor', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}

/**
 * Quando o adapter retorna sucesso, limpa errorMessage do agente.
 * Use depois de QR gerado, status=connected, etc.
 */
export async function clearAgentError(agentId: string): Promise<void> {
  await prisma.whatsappInstance.update({
    where: { id: agentId },
    data: { errorMessage: null },
  }).catch(() => {});
}

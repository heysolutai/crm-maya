import { NextRequest } from 'next/server';
import { AppRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

// GET /api/departments/next-agent
//
// Consulta qual seria o proximo agente a receber um cliente no round-robin,
// SEM consumir o turno (nao atualiza lead_distribution_state).
//
// Query params:
//   department_id  = opcional. Se informado, faz peek do round-robin do
//                    departamento (so agentes online membros do depto).
//                    Se omitido, faz peek do round-robin global da empresa.
//   include_schedule = "1" para incluir schedule do agente (se existir).
//
// Resposta:
// {
//   next_agent: { user_id, full_name, email, is_online } | null,
//   schedule: { id, name } | null,
//   total_candidates: number,
//   queue_order: [{ user_id, full_name, position }...],
//   mode: "department" | "company",
//   message: string
// }
export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);
    if (!companyId) return errorResponse('Empresa nao encontrada', 403);

    const url = new URL(req.url);
    const departmentId = url.searchParams.get('department_id');
    const includeSchedule = url.searchParams.get('include_schedule') === '1';

    const validRoles: AppRole[] = [AppRole.agent, AppRole.manager, AppRole.company_admin];

    let agentIds: string[] = [];
    let mode: 'department' | 'company' = 'company';

    if (departmentId) {
      mode = 'department';

      // Valida departamento pertence a company
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, companyId, isActive: true },
        select: { id: true },
      });
      if (!dept) return errorResponse('Departamento nao encontrado ou inativo', 404);

      const members = await prisma.departmentMember.findMany({
        where: { departmentId },
        select: { userId: true },
      });
      if (members.length === 0) {
        return jsonResponse({
          next_agent: null,
          schedule: null,
          total_candidates: 0,
          queue_order: [],
          mode,
          message: 'Nenhum membro no departamento.',
        });
      }

      const onlineAgents = await prisma.user.findMany({
        where: {
          id: { in: members.map(m => m.userId) },
          companyId,
          isActive: true,
          isOnline: true,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      if (onlineAgents.length === 0) {
        return jsonResponse({
          next_agent: null,
          schedule: null,
          total_candidates: 0,
          queue_order: [],
          mode,
          message: 'Nenhum agente online no departamento.',
        });
      }

      const rolesData = await prisma.userRole.findMany({
        where: {
          userId: { in: onlineAgents.map(a => a.id) },
          role: { in: validRoles },
        },
        select: { userId: true },
      });

      agentIds = [...new Set(rolesData.map(r => r.userId))].sort();
    } else {
      // Company-wide: todos ativos (ignora isOnline — comportamento do assignNextAgent)
      const agents = await prisma.user.findMany({
        where: { companyId, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      if (agents.length === 0) {
        return jsonResponse({
          next_agent: null,
          schedule: null,
          total_candidates: 0,
          queue_order: [],
          mode,
          message: 'Nenhum agente ativo na empresa.',
        });
      }

      const rolesData = await prisma.userRole.findMany({
        where: {
          userId: { in: agents.map(a => a.id) },
          role: { in: validRoles },
        },
        select: { userId: true },
      });

      agentIds = [...new Set(rolesData.map(r => r.userId))].sort();
    }

    if (agentIds.length === 0) {
      return jsonResponse({
        next_agent: null,
        schedule: null,
        total_candidates: 0,
        queue_order: [],
        mode,
        message: 'Nenhum agente com papel valido para round-robin.',
      });
    }

    // Calcula proximo sem atualizar estado
    const state = await prisma.leadDistributionState.findFirst({
      where: { companyId, departmentId: departmentId || null },
      select: { lastAssignedUserId: true },
    });

    let nextIndex = 0;
    if (state?.lastAssignedUserId) {
      const lastIndex = agentIds.indexOf(state.lastAssignedUserId);
      if (lastIndex >= 0) nextIndex = (lastIndex + 1) % agentIds.length;
    }

    const nextAgentId = agentIds[nextIndex];

    const nextUser = await prisma.user.findUnique({
      where: { id: nextAgentId },
      select: { id: true, fullName: true, email: true, isOnline: true },
    });

    // Monta ordem da fila (starting from next)
    const ordered = [
      ...agentIds.slice(nextIndex),
      ...agentIds.slice(0, nextIndex),
    ];
    const usersInfo = await prisma.user.findMany({
      where: { id: { in: ordered } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(usersInfo.map(u => [u.id, u]));
    const queue_order = ordered.map((uid, pos) => ({
      user_id: uid,
      full_name: userMap.get(uid)?.fullName ?? null,
      position: pos + 1,
    }));

    let schedule: { id: string; name: string } | null = null;
    if (includeSchedule && nextAgentId) {
      const sched = await prisma.doctorSchedule.findFirst({
        where: { userId: nextAgentId, companyId, isActive: true },
        select: { id: true, name: true },
      });
      if (sched) schedule = sched;
    }

    return jsonResponse({
      next_agent: nextUser
        ? {
            user_id: nextUser.id,
            full_name: nextUser.fullName,
            email: nextUser.email,
            is_online: nextUser.isOnline,
          }
        : null,
      schedule,
      total_candidates: agentIds.length,
      queue_order,
      mode,
      message: `Proximo agente: ${nextUser?.fullName ?? nextAgentId} (${agentIds.length} candidato(s)).`,
    });
  } catch (error) {
    return handleApiErrorCors(error, '[next-agent] Error')
  }
}

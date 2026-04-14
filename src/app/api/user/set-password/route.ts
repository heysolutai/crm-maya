import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

const setPasswordSchema = z.object({
  userId: z.string().uuid('Invalid userId format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await authenticate(req);

    if (!agentId) {
      return errorResponse('Autenticação necessária', 403);
    }

    const body = await req.json();
    const validation = setPasswordSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { userId, password } = validation.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, companyId: true },
    });

    if (!targetUser) {
      return notFoundResponse('User not found');
    }

    // Super admin pode redefinir qualquer senha.
    // Company admin pode redefinir senha de usuários da própria empresa.
    const isSuperAdmin = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    });

    if (!isSuperAdmin) {
      if (!targetUser.companyId) {
        return errorResponse('Você não tem permissão para redefinir a senha deste usuário', 403);
      }
      const isCompanyAdmin = await prisma.userRole.findFirst({
        where: { userId: agentId, role: 'company_admin', companyId: targetUser.companyId },
      });
      if (!isCompanyAdmin) {
        return errorResponse('Você não tem permissão para redefinir a senha deste usuário', 403);
      }
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    console.log(`Password set for user ${targetUser.email} by super_admin ${agentId}`);

    return jsonResponse({
      success: true,
      email: targetUser.email,
      userName: targetUser.fullName,
    });
  } catch (error) {
    console.error('Error in set-user-password:', error);
    return errorResponse('Erro interno do servidor');
  }
}

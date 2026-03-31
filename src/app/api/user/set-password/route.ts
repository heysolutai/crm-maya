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
      return errorResponse('Super admin authentication required (Bearer token)', 403);
    }

    const roleData = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin', companyId: null },
      select: { role: true },
    });

    if (!roleData) {
      return errorResponse('Only super admins can set passwords', 403);
    }

    const body = await req.json();
    const validation = setPasswordSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { userId, password } = validation.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    });

    if (!targetUser) {
      return notFoundResponse('User not found');
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

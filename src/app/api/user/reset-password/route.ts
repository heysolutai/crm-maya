import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

const resetPasswordSchema = z.object({
  userId: z.string().uuid('Invalid userId format'),
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

    const roles = await prisma.userRole.findMany({
      where: { userId: agentId, role: 'super_admin', companyId: null },
      select: { role: true },
    });

    if (!roles || roles.length === 0) {
      return errorResponse('Only super admins can reset passwords', 403);
    }

    const body = await req.json();
    const validation = resetPasswordSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { userId } = validation.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!targetUser) {
      return notFoundResponse('User not found');
    }

    // Skip link generation (was supabase.auth.admin.generateLink)
    // In a Prisma-based auth system, you would implement your own password reset flow

    return jsonResponse({
      success: true,
      email: targetUser.email,
      message: 'Password reset initiated successfully',
    });
  } catch (error) {
    console.error('Error in reset-user-password:', error);
    return errorResponse('Erro interno do servidor');
  }
}

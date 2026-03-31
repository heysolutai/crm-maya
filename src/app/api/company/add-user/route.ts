import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

const addUserSchema = z.object({
  company_id: z.string().uuid('Invalid company_id format'),
  email: z.string().email('Invalid email format'),
  full_name: z.string().min(1, 'Full name is required'),
  phone: z.string().optional().nullable(),
  role: z.enum(['company_admin', 'manager', 'agent', 'viewer'], { message: 'Invalid role' }),
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

    const roleCheck = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    });

    if (!roleCheck) {
      return errorResponse('Only super admins can add users to companies', 403);
    }

    const body = await req.json();
    const validation = addUserSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { company_id, email, full_name, phone, role } = validation.data;

    const company = await prisma.company.findUnique({
      where: { id: company_id },
      select: { id: true, name: true },
    });

    if (!company) {
      return notFoundResponse('Company not found');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return badRequestResponse(`Failed to create user: User with email ${email} already exists`);
    }

    // Create user with a random password hash (user will need to set password)
    const randomPassword = Math.random().toString(36).slice(-12);
    const hash = await bcrypt.hash(randomPassword, 12);

    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          email,
          fullName: full_name,
          passwordHash: hash,
          phone: phone || null,
          companyId: company_id,
          isActive: true,
        },
      });
    } catch (createError) {
      console.error('Erro ao criar usuário:', createError);
      return badRequestResponse('Falha ao criar usuário');
    }

    try {
      await prisma.userRole.create({
        data: { userId: newUser.id, role, companyId: company_id },
      });
    } catch (roleError) {
      console.error('Erro ao atribuir role:', roleError);
      await prisma.user.delete({ where: { id: newUser.id } });
      return errorResponse('Falha ao atribuir role');
    }

    // Skip link generation (was supabase.auth.admin.generateLink)

    const createdUser = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: { userRoles: { select: { role: true } } },
    });

    return jsonResponse({
      success: true,
      user: createdUser || {
        id: newUser.id,
        email,
        full_name,
        phone,
        company_id,
        user_roles: [{ role }],
      },
    });
  } catch (error) {
    console.error('Error in add-user-to-company:', error);
    return errorResponse('Erro interno do servidor');
  }
}

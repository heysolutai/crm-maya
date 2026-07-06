import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

const createCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  ownerEmail: z.string().email('Invalid email format'),
  ownerFullName: z.string().optional(),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
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

    const roles = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    });

    if (!roles) {
      return errorResponse('Only super admins can create companies', 403);
    }

    const body = await req.json();
    const validation = createCompanySchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { companyName, ownerFullName, ownerPassword } = validation.data;
    const ownerEmail = validation.data.ownerEmail.toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: ownerEmail.toLowerCase() },
    });

    let ownerId: string;
    let isNewUser = false;

    if (existingUser) {
      if (existingUser.companyId) {
        return badRequestResponse('User already belongs to a company');
      }
      ownerId = existingUser.id;
    } else {
      const hash = ownerPassword
        ? await bcrypt.hash(ownerPassword, 12)
        : await bcrypt.hash(Math.random().toString(36).slice(-12), 12);

      const newUser = await prisma.user.create({
        data: {
          email: ownerEmail,
          passwordHash: hash,
          fullName: ownerFullName || ownerEmail.split('@')[0],
        },
      });

      ownerId = newUser.id;
      isNewUser = true;
    }

    // Update user profile
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        email: ownerEmail,
        fullName: ownerFullName || ownerEmail.split('@')[0],
      },
    });

    // Create company and assign owner
    let companyId: string;
    try {
      const newCompany = await prisma.company.create({
        data: {
          name: companyName,
          email: ownerEmail,
        },
      });
      companyId = newCompany.id;

      // Assign user to company
      await prisma.user.update({
        where: { id: ownerId },
        data: { companyId },
      });

      // Assign company_admin role
      await prisma.userRole.create({
        data: { userId: ownerId, role: 'company_admin', companyId },
      });
    } catch (createCompanyError) {
      console.error('Erro ao criar empresa:', createCompanyError);
      if (isNewUser) {
        await prisma.user.delete({ where: { id: ownerId } });
      }
      return errorResponse('Erro interno do servidor', 500);
    }

    // A empresa ja nasce com uma API key ativa (pronta pro N8N). Best-effort —
    // nao quebra o cadastro se falhar. Aparece na checklist de primeiros passos
    // e nas configuracoes pra o dono copiar.
    try {
      await prisma.apiKey.create({
        data: {
          companyId,
          name: 'API padrão',
          key: `rm_${randomBytes(24).toString('hex')}`,
          isActive: true,
          createdBy: ownerId,
        },
      });
    } catch (apiKeyError) {
      console.error('Falha ao auto-criar API key da empresa:', apiKeyError);
    }

    // Skip link generation (was supabase.auth.admin.generateLink)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    return jsonResponse({
      success: true,
      data: {
        companyId,
        company,
        ownerId,
        ownerEmail,
        message: isNewUser
          ? (ownerPassword ? 'Empresa criada com sucesso. Senha definida.' : 'Empresa criada com sucesso.')
          : 'Empresa criada com sucesso. Usuário existente associado.',
      },
    });
  } catch (error) {
    return handleApiErrorCors(error, 'Unexpected error')
  }
}

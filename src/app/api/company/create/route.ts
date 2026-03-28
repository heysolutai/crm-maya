import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

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

    const { companyName, ownerEmail, ownerFullName, ownerPassword } = await req.json();

    if (!companyName || !ownerEmail) {
      return badRequestResponse('Company name and owner email are required');
    }

    if (ownerPassword && ownerPassword.length < 8) {
      return badRequestResponse('Password must be at least 8 characters');
    }

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
    } catch (createCompanyError: any) {
      if (isNewUser) {
        await prisma.user.delete({ where: { id: ownerId } });
      }
      return errorResponse('Failed to create company', 500, createCompanyError.message);
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
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return errorResponse('Internal server error', 500, error.message);
  }
}

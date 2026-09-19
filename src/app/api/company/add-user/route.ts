import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { criarAuthToken, VALIDADE_CONVITE_DIAS } from '@/lib/auth-tokens';
import { emailConvite } from '@/lib/email/templates';
import { emailConfigurado, urlDaAplicacao } from '@/lib/email/config';
import { enqueueEmail } from '@/lib/queue';
import { logSecurityEvent } from '@/lib/security-log';

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
      return errorResponse('Autenticação necessária', 403);
    }

    const body = await req.json();
    const validation = addUserSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse('Invalid request data: ' + JSON.stringify(validation.error.flatten().fieldErrors));
    }

    const { company_id, email, full_name, phone, role } = validation.data;

    // Super admin pode adicionar em qualquer restaurante.
    // Company admin pode adicionar APENAS na próprio restaurante.
    const isSuperAdmin = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    });

    if (!isSuperAdmin) {
      const isCompanyAdmin = await prisma.userRole.findFirst({
        where: { userId: agentId, role: 'company_admin', companyId: company_id },
      });
      if (!isCompanyAdmin) {
        return errorResponse('Você não tem permissão para adicionar usuários neste restaurante', 403);
      }
    }

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

    // Convite por e-mail: a pessoa define a propria senha pelo link. A senha
    // aleatoria criada acima existe so pra conta nunca ficar com hash vazio;
    // ninguem a conhece, nem quem cadastrou.
    //
    // Best-effort de proposito: SMTP fora do ar nao pode desfazer um usuario
    // que ja foi criado com a role certa. A resposta diz se o convite saiu, e
    // quem cadastrou pode reenviar depois.
    let conviteEnviado = false;
    if (emailConfigurado()) {
      try {
        const token = await criarAuthToken(
          newUser.id,
          'invite',
          VALIDADE_CONVITE_DIAS * 24 * 60 * 60 * 1000
        );
        const montado = emailConvite({
          nome: full_name,
          restaurante: company.name,
          link: `${urlDaAplicacao()}/auth/reset-password?token=${encodeURIComponent(token)}`,
          validadeDias: VALIDADE_CONVITE_DIAS,
        });

        await enqueueEmail({
          para: newUser.email,
          assunto: montado.assunto,
          html: montado.html,
          texto: montado.texto,
          tipo: 'convite',
        });

        conviteEnviado = true;
        await logSecurityEvent({
          event: 'invite_sent',
          userId: newUser.id,
          email: newUser.email,
          companyId: company_id,
          req,
        });
      } catch (conviteError) {
        console.error('[Add User] Falha ao enviar convite por e-mail:', conviteError);
      }
    } else {
      console.warn('[Add User] SMTP nao configurado: convite nao enviado para', newUser.email);
    }

    const createdUser = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: { userRoles: { select: { role: true } } },
    });

    return jsonResponse({
      success: true,
      conviteEnviado,
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
    return handleApiErrorCors(error, 'Error in add-user-to-company')
  }
}

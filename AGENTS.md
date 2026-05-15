# Maya CRM - Guia de Desenvolvimento

> Este documento e a unica fonte de verdade para desenvolvimento no Maya.
> Leia-o por completo antes de qualquer acao.

## Stack

Next.js 15 (App Router), React 18, TypeScript, Prisma 7, PostgreSQL, Tailwind CSS 3, Radix UI + shadcn/ui, BullMQ + Redis, NextAuth 5 (JWT), React Query, multi-tenant SaaS (CRM + AI + WhatsApp).

---

## Estrutura do Projeto

```
src/
├── app/
│   ├── api/                    # API routes (backend)
│   │   ├── admin/              # Super admin APIs
│   │   ├── ai/                 # AI features
│   │   ├── auth/               # Authentication
│   │   ├── cron/               # Scheduled jobs
│   │   ├── webhooks/           # Webhook receivers
│   │   └── [resource]/         # Resource CRUD routes
│   ├── (dashboard)/            # Protected routes
│   │   ├── app/                # Company dashboard pages
│   │   └── super-admin/        # Admin panel
│   ├── auth/                   # Auth pages
│   └── setup/                  # Setup wizard
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   └── [feature]/              # Feature-specific components
├── hooks/                      # Custom React hooks (React Query)
├── lib/
│   ├── api/                    # API helpers (auth, cors, database)
│   ├── queue/                  # BullMQ queues e workers
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma client (pg Pool)
│   └── utils.ts                # Utilities
├── layouts/                    # Layout components
├── views/pages/                # Page-level view components
└── middleware.ts               # Auth middleware
prisma/
└── schema.prisma               # Database schema (40+ models, UUID IDs)
```

---

## FASE 1: Antes de Planejar

### Leituras Obrigatorias

1. **SEMPRE** verificar campos no `prisma/schema.prisma` antes de escrever codigo Prisma
2. Se for area critica (financeiro, pagamentos, WhatsApp): analisar impacto com cuidado
3. Se for feature existente: ler o hook correspondente em `src/hooks/` e a API route

### Analise de Impacto

Ao planejar, mapear:

1. **Models afetados** — quais tabelas do Prisma serao lidas/escritas?
2. **APIs afetadas** — quais endpoints serao criados/modificados?
3. **Hooks afetados** — quais hooks React Query serao impactados?
4. **Paginas afetadas** — quais telas mudam?
5. **Workers afetados** — algum job BullMQ precisa mudar?
6. **Superficie IDOR** — quais IDs vem do usuario (URL, body, query)? Todos estao validados com `companyId`?

---

## FASE 2: Durante a Implementacao

### Regras de Seguranca (CRITICO)

- Usar queries parametrizadas / Prisma ORM — nunca concatenacao de strings para SQL
- **SEMPRE** filtrar queries por `companyId` para isolamento multi-tenant
- Nunca expor stack traces ou erros internos aos clientes
- Nunca hardcodar secrets — usar variaveis de ambiente
- Nunca usar `dangerouslySetInnerHTML` com dados de usuario
- Validar todos inputs no servidor com Zod
- Hash de senhas com bcrypt (cost >= 12)
- Usar cookies secure, httpOnly, sameSite para sessoes

### Prevencao de IDOR (CRITICO)

IDOR (Insecure Direct Object Reference) ocorre quando um ID vindo do usuario e usado para buscar/modificar dados sem verificar que o registro pertence a company autenticada. **Toda rota que recebe IDs do usuario (URL, body, query params) DEVE validar ownership.**

**Regra 1: Nunca buscar por ID sem companyId**
```typescript
// ERRADO — permite acesso cross-tenant
const record = await prisma.client.findUnique({ where: { id } });

// CORRETO — isola por company
const record = await prisma.client.findFirst({
  where: { id, companyId: auth.companyId },
});
if (!record) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
```

**Regra 2: IDs de referencia (FK) do body tambem devem ser validados**
Quando o body contem IDs de registros relacionados (ex: `departmentId`, `funnelStageId`, `assignedToId`), verificar que pertencem a company ANTES de usar:
```typescript
// ERRADO — atacante pode usar departamento de outra company
const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });

// CORRETO — valida ownership
const dept = await prisma.department.findFirst({
  where: { id: body.departmentId, companyId: auth.companyId },
});
if (!dept) return NextResponse.json({ error: "Departamento invalido" }, { status: 400 });
```

**Regra 3: Batch updates devem validar que TODOS os itens pertencem ao registro pai**
```typescript
// ERRADO — atacante pode enviar IDs de itens de outra company
items.map(item => prisma.sale.update({ where: { id: item.id }, data }));

// CORRETO — garante que o item pertence a company
items.map(item => prisma.sale.updateMany({
  where: { id: item.id, companyId: auth.companyId },
  data,
}));
```

**Regra 4: Webhooks DEVEM rejeitar requests quando secret nao esta configurado**
```typescript
// ERRADO — pula validacao se secret nao existe
if (secret && signature) { validateHMAC(signature, secret); }

// CORRETO — rejeita se nao ha como validar
if (!secret) return NextResponse.json({ error: "Webhook nao configurado" }, { status: 503 });
if (!signature) return NextResponse.json({ error: "Assinatura ausente" }, { status: 401 });
validateHMAC(signature, secret);
```

**Regra 5: HMAC deve usar comparacao timing-safe**
```typescript
// ERRADO — vulneravel a timing attack
return computedHash === receivedSignature;

// CORRETO
return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(receivedSignature));
```

**Regra 6: Cron endpoints devem bloquear acesso se CRON_SECRET nao esta configurado**
```typescript
// ERRADO — aberto se env nao configurada
if (CRON_SECRET && secret !== CRON_SECRET) return unauthorized();

// CORRETO — bloqueia por padrao
if (!CRON_SECRET || secret !== CRON_SECRET) return unauthorized();
```

### Protecao contra Vazamento de Dados (CRITICO)

**Regra 7: NUNCA retornar `error.message` ao cliente**
O erro pode conter queries SQL, paths internos, stack traces. Sempre retornar mensagem generica.
```typescript
// ERRADO — vaza detalhes internos
return NextResponse.json({ error: e.message }, { status: 500 });

// CORRETO — mensagem generica ao cliente, log no servidor
console.error("Erro ao processar:", error);
return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
```

**Regra 8: NUNCA logar payloads sensiveis**
Dados de pagamento, tokens, documentos pessoais NAO devem ir para console.log.

**Regra 9: NUNCA hardcodar chaves de API**
Sempre usar variaveis de ambiente, nunca fallback com chave real.
```typescript
// ERRADO
headers: { "x-api-key": process.env.API_KEY || "abc123realkey" }

// CORRETO
headers: { "x-api-key": process.env.API_KEY || "" }
```

**Regra 10: Sanitizar HTML com DOMPurify quando usar dangerouslySetInnerHTML**
```typescript
import DOMPurify from "dompurify";

// ERRADO — XSS
<div dangerouslySetInnerHTML={{ __html: content }} />

// CORRETO
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
```

### Regras do Prisma (CRITICO)

- **NUNCA rodar `prisma db pull`** — sobrescreve schema.prisma e remove todas as `@relation`
- **NUNCA rodar `prisma migrate reset`** — apaga todas as tabelas e dados
- Sempre verificar nomes exatos dos campos no `prisma/schema.prisma` antes de escrever codigo
- Campos `Decimal` do Prisma devem ser convertidos com `Number()` antes de aritmetica
- Campos `Json` devem ser tipados como `Record<string, ...>` nunca como `any`
- IDs sao UUID (`@default(uuid()) @db.Uuid`)

### Padrao de API Routes

Todas as API routes DEVEM seguir esta estrutura:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";

// 1. Schema Zod no topo do arquivo
const createSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function POST(req: NextRequest) {
  // 2. AUTH CHECK — fora do try/catch
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    // 3. VALIDACAO ZOD
    const body = await req.json();
    const validation = createSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados invalidos", details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 4. LOGICA DE NEGOCIOS (sempre com companyId)
    const record = await prisma.client.create({
      data: {
        companyId: auth.companyId,
        ...validation.data,
      },
    });

    // 5. RESPONSE com status correto
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
```

**GET com paginacao:**
```typescript
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";

    const where = {
      companyId: auth.companyId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Erro ao buscar:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
```

**PUT/DELETE com companyId (prevencao IDOR):**
```typescript
export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });

    // SEMPRE verificar ownership antes de atualizar
    const existing = await prisma.client.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    }

    const updated = await prisma.client.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 });

    // SEMPRE verificar ownership antes de deletar
    const existing = await prisma.client.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
```

### Padrao de Componentes UI

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onSuccess?: () => void;
}

export function ComponentName({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resource", { method: "POST", ... });
      if (!res.ok) throw new Error("Falha");
      toast.success("Salvo com sucesso");
      onSuccess?.();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSubmit} disabled={loading}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Salvar
    </Button>
  );
}
```

### Padrao de Hooks (React Query)

Os hooks em `src/hooks/` encapsulam data fetching com React Query:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useClients(companyId: string) {
  return useQuery({
    queryKey: ["clients", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?companyId=${companyId}`);
      if (!res.ok) throw new Error("Falha");
      return res.json();
    },
    enabled: !!companyId,
  });
}
```

### Padrao de Background Jobs (BullMQ)

Workers ficam em `src/lib/queue/workers/`. Sao inicializados automaticamente via `src/instrumentation.ts`.

```typescript
// src/lib/queue/workers/example.worker.ts
import { Worker, Job } from "bullmq";
import { connection } from "../connection";

const worker = new Worker("QUEUE_NAME", async (job: Job) => {
  // Logica do job
}, { connection });
```

---

## Comandos Proibidos

```bash
# NUNCA RODAR
prisma migrate reset
prisma db push --force-reset
prisma db pull
git push --force
git reset --hard
```

## Arquivos Protegidos

- `.env` / `.env.local` — nunca deletar
- `prisma/schema.prisma` — apenas modificar, nunca deletar ou sobrescrever

## Regras de Git

- **NAO** commitar sem o usuario pedir
- **NUNCA** `git push --force`
- Mensagens de commit descritivas em portugues
- **NUNCA** adicionar `Co-Authored-By` nos commits

---

## FASE 3: Apos Implementar

### Checklist de Verificacao

Antes de considerar a task completa, verificar TODOS os itens aplicaveis:

**Seguranca:**
- [ ] Queries filtram por `companyId`?
- [ ] Inputs validados com Zod?
- [ ] Erros internos nao expostos ao cliente? (sem `error.message` no response)
- [ ] Auth verificado em todas as rotas? (`authenticate(req)`)

**Prevencao IDOR:**
- [ ] Todo `findUnique`/`findFirst` por ID do usuario inclui `companyId`?
- [ ] IDs de referencia do body (FK) validados contra a company?
- [ ] PUT/DELETE verificam ownership antes de executar?

**Error Handling:**
- [ ] try/catch em operacoes async?
- [ ] Status HTTP correto (201 para POST, 200 para GET/PUT, 400, 401, 403, 404, 500)?
- [ ] `console.error` para log no servidor?

**TypeScript:**
- [ ] Sem uso de `any`?
- [ ] Tipos explicitos em arrays e objetos?

**Estado React:**
- [ ] Ao adicionar campo em state, atualizou TODOS os locais? (estado inicial, reset, loaders)
- [ ] Hook React Query invalidando cache apos mutations?

---

## Resumo Visual do Pipeline

```
┌──────────────────────────────────────────────────┐
│              FASE 1: ANTES DE PLANEJAR           │
│                                                  │
│  Ler: prisma/schema.prisma                       │
│  Ler: hook existente em src/hooks/               │
│  Ler: API route existente                        │
│  Mapear: models, APIs, hooks, paginas, workers   │
│  Mapear: superficie IDOR                         │
└──────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│           FASE 2: DURANTE IMPLEMENTACAO          │
│                                                  │
│  Seguranca: companyId, Zod, erros genericos      │
│  API: auth fora try/catch → Zod → logica → resp  │
│  Prisma: verificar schema, Decimal → Number()    │
│  UI: "use client", shadcn/ui, Sonner, hooks      │
│  Jobs: BullMQ workers em lib/queue/workers/      │
└──────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│           FASE 3: APOS IMPLEMENTAR               │
│                                                  │
│  Checklist: seguranca, IDOR, errors, TypeScript  │
│  React Query: cache invalidation correto         │
│  Estado: todos locais atualizados                │
└──────────────────────────────────────────────────┘
```

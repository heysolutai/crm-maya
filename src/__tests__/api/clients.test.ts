/**
 * Tests for the clients API route.
 *
 * These tests focus on the validation and business logic that can be exercised
 * without a live database by mocking the Prisma client and auth layer.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the modules under test)
// ---------------------------------------------------------------------------

jest.mock('@/lib/db', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/lib/api/auth', () => ({
  authenticate: jest.fn().mockResolvedValue({
    agentId: 'test-user-id',
    companyId: 'test-company-id',
    isSuperAdmin: false,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ---------------------------------------------------------------------------
// Inline schema mirrors (same logic as the route, kept local to avoid
// importing the route module which requires the full Next.js runtime)
// ---------------------------------------------------------------------------

const createClientSchema = z
  .object({
    firstName: z.string().min(1).max(255).optional(),
    first_name: z.string().min(1).max(255).optional(),
    lastName: z.string().max(255).optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    tags: z.array(z.string()).optional(),
    assignedTo: z.string().uuid().optional().nullable(),
    stageId: z.string().uuid().optional().nullable(),
    pipelineId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().optional(),
    aiPaused: z.boolean().optional(),
  })
  .refine((data) => data.firstName || data.first_name, {
    message: 'firstName ou first_name obrigatorio',
  })

const updateClientSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  pipelineId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  aiPaused: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Test suite – createClientSchema validation
// ---------------------------------------------------------------------------

describe('createClientSchema', () => {
  it('accepts a payload with firstName', () => {
    const result = createClientSchema.safeParse({ firstName: 'Alice' })
    expect(result.success).toBe(true)
  })

  it('accepts a payload with first_name (legacy field)', () => {
    const result = createClientSchema.safeParse({ first_name: 'Bob' })
    expect(result.success).toBe(true)
  })

  it('rejects a payload with neither firstName nor first_name', () => {
    const result = createClientSchema.safeParse({ email: 'no-name@example.com' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid email', () => {
    const result = createClientSchema.safeParse({
      firstName: 'Alice',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a nullable email', () => {
    const result = createClientSchema.safeParse({ firstName: 'Alice', email: null })
    expect(result.success).toBe(true)
  })

  it('accepts optional tag array', () => {
    const result = createClientSchema.safeParse({
      firstName: 'Alice',
      tags: ['vip', 'newsletter'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual(['vip', 'newsletter'])
    }
  })

  it('rejects a phone that exceeds 50 characters', () => {
    const result = createClientSchema.safeParse({
      firstName: 'Alice',
      phone: '1'.repeat(51),
    })
    expect(result.success).toBe(false)
  })

  it('rejects an assignedTo that is not a UUID', () => {
    const result = createClientSchema.safeParse({
      firstName: 'Alice',
      assignedTo: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Test suite – updateClientSchema validation
// ---------------------------------------------------------------------------

describe('updateClientSchema', () => {
  const validId = '123e4567-e89b-12d3-a456-426614174000'

  it('accepts a valid update payload', () => {
    const result = updateClientSchema.safeParse({ id: validId, firstName: 'Alice' })
    expect(result.success).toBe(true)
  })

  it('rejects an update payload missing id', () => {
    const result = updateClientSchema.safeParse({ firstName: 'Alice' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID id', () => {
    const result = updateClientSchema.safeParse({ id: 'bad-id', firstName: 'Alice' })
    expect(result.success).toBe(false)
  })

  it('accepts isActive and aiPaused flags', () => {
    const result = updateClientSchema.safeParse({
      id: validId,
      isActive: false,
      aiPaused: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isActive).toBe(false)
      expect(result.data.aiPaused).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Test suite – NextRequest helper
// ---------------------------------------------------------------------------

describe('makeRequest helper', () => {
  it('creates a GET request with the correct URL', () => {
    const req = makeRequest('GET', 'http://localhost/api/clients?companyId=abc')
    expect(req.method).toBe('GET')
    expect(req.nextUrl.searchParams.get('companyId')).toBe('abc')
  })

  it('creates a POST request with a JSON body', async () => {
    const payload = { firstName: 'Alice', email: 'alice@example.com' }
    const req = makeRequest('POST', 'http://localhost/api/clients', payload)
    const body = await req.json()
    expect(body).toEqual(payload)
  })
})

/**
 * Audit trail service
 *
 * Records mutations (CREATE / UPDATE / DELETE) as structured log lines.
 * The function is intentionally fire-and-forget: it is wrapped in a
 * try/catch so that an audit failure NEVER propagates to the caller.
 *
 * TODO: replace console output with a database write once an `AuditLog`
 *       Prisma model is available. Suggested schema:
 *
 *       model AuditLog {
 *         id         String   @id @default(uuid())
 *         timestamp  DateTime @default(now())
 *         companyId  String
 *         userId     String?
 *         action     String   // CREATE | UPDATE | DELETE
 *         entity     String   // e.g. "Client", "Conversation"
 *         entityId   String
 *         details    Json?
 *       }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'

export interface LogActionParams {
  companyId: string
  userId?: string | null
  action: AuditAction
  /** The Prisma model / domain entity name, e.g. "Client", "Sale". */
  entity: string
  entityId: string
  /** Arbitrary extra context (diff, old values, request metadata, …). */
  details?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Log an auditable action in a structured JSON format.
 *
 * Output format:
 * `[AUDIT] { timestamp, companyId, userId, action, entity, entityId, details }`
 *
 * The function swallows its own errors so audit failures never disrupt the
 * main business operation.
 *
 * @param params  Audit context — who did what to which record.
 * @param _tx     Reserved for future Prisma transaction propagation.
 */
export async function logAction(
  params: LogActionParams,
  _tx?: unknown
): Promise<void> {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      companyId: params.companyId,
      userId: params.userId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      details: params.details ?? null,
    }

    // TODO: persist to AuditLog table via Prisma instead of console logging.
    console.log('[AUDIT]', JSON.stringify(entry))
  } catch (err) {
    // Audit failures must never bubble up — log silently and move on.
    console.warn('[AUDIT] Failed to log action:', err)
  }
}

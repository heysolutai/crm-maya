/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts (both dev and production).
 * Used to initialize BullMQ workers for the message queue system.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAllWorkers } = await import('./lib/queue/start-workers')
    startAllWorkers()
  }
}

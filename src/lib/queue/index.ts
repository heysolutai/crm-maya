// Queue system entry point
// Re-export everything needed by the application

export {
  getRedisConnection,
  closeRedisConnection,
} from './connection'

export {
  QUEUE_NAMES,
  enqueueN8NWebhook,
  enqueueTranscription,
  enqueueMediaProcessing,
  enqueueOutboundMessage,
  enqueueOutboundMedia,
  type N8NWebhookJob,
  type TranscriptionJob,
  type MediaProcessingJob,
  type OutboundMessageJob,
  type OutboundMediaJob,
} from './queues'

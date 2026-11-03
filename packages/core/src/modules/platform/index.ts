// API pública del módulo platform (outbox, auditoría…).

export {
  drainOutbox,
  type OutboxEvent,
  type PublishFn,
} from './infra/outbox';

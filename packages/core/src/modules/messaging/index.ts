// API pública del módulo messaging.

export { messagingRouter } from './http/routes';
export {
  getOrderThread,
  markOrderThreadRead,
  type SendResult,
  sendOrderMessage,
} from './infra/conversation-repo';

// API pública del módulo notifications (M8d — Web Push / VAPID).

export { notifyUser } from './application/notify-user';
export { notificationsRouter } from './http/routes';
export {
  type SendResult,
  sendPush,
  type VapidConfig,
} from './infra/push-sender';
export {
  deleteSubscription,
  listSubscriptionsForUser,
  type StoredSubscription,
  upsertSubscription,
} from './infra/subscription-repo';

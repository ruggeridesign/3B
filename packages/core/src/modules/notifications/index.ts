// API pública del módulo notifications (M8d — Web Push / VAPID).

export {
  dispatchNotification,
  type NotifiableEvent,
} from './application/dispatch-notification';
export { notifyUser } from './application/notify-user';
export { notificationsRouter } from './http/routes';
export {
  type SendResult,
  sendPush,
  type VapidConfig,
} from './infra/push-sender';
export {
  conversationContext,
  orderBrief,
  storeMemberIds,
} from './infra/recipients-repo';
export {
  deleteSubscription,
  listSubscriptionsForUser,
  type StoredSubscription,
  upsertSubscription,
} from './infra/subscription-repo';

// API pública del módulo tracking.

export { type OnPing, trackingRouter } from './http/routes';
export {
  latestPing,
  type PostPingResult,
  postPing,
  recentTrack,
} from './infra/ping-repo';

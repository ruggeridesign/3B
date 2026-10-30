// API pública del módulo admin.

export { adminRouter } from './http/routes';
export {
  type AdminUser,
  type AuditEntry,
  listUsers,
  recordAudit,
} from './infra/admin-store';

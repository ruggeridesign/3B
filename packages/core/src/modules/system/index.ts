// API pública del módulo system. Es lo ÚNICO que otros módulos / apps importan.
export { type GetHealthInput, getHealth } from './application/get-health';
export { systemRouter } from './http/routes';

import { renderIcon } from '../lib/pwa-icon';

// Favicon de la pestaña (Next lo inyecta como <link rel="icon">).
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return renderIcon(32);
}

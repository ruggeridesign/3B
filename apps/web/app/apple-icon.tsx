import { renderIcon } from '../lib/pwa-icon';

// Apple touch icon (iOS "Agregar a inicio"). iOS aplica su propia máscara/redondeo,
// así que lo generamos a sangre (maskable) para evitar doble redondeo.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderIcon(180, { maskable: true });
}

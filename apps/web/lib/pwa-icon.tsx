import { ImageResponse } from 'next/og';

// Generador de íconos PWA sin assets binarios: dibuja el glifo "3B" con los colores
// de marca (verde british sobre crema). Lo consumen app/icon.tsx, app/apple-icon.tsx
// y app/icons/[icon]/route.tsx. El pulido visual real llega en M9.
const GREEN = '#004d34'; // --primary (verde british)
const CREAM = '#f4f2e0'; // --background (crema)

/**
 * @param size  lado del ícono en px (cuadrado).
 * @param opts.maskable  true para íconos "maskable"/apple: cuadrado a sangre (sin
 *   esquinas redondeadas propias) y glifo dentro de la zona segura central (~80%),
 *   porque el SO aplica su propia máscara. false: ícono redondeado sobre transparente.
 */
export function renderIcon(
  size: number,
  opts?: { maskable?: boolean },
): ImageResponse {
  const maskable = opts?.maskable ?? false;
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const fontSize = Math.round(size * (maskable ? 0.42 : 0.5));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: GREEN,
        color: CREAM,
        fontSize,
        fontWeight: 800,
        letterSpacing: -Math.round(size * 0.03),
        borderRadius: radius,
      }}
    >
      3B
    </div>,
    { width: size, height: size },
  );
}

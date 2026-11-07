import { renderIcon } from '../../../lib/pwa-icon';

// Íconos del manifest (192/512 "any" + 512 "maskable"). Route Handler estático: se
// generan en build y quedan como assets precacheables. El manifest los referencia
// en /icons/192.png, /icons/512.png y /icons/maskable.png.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ icon: '192.png' }, { icon: '512.png' }, { icon: 'maskable.png' }];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ icon: string }> },
) {
  const { icon } = await params;
  if (icon === 'maskable.png') return renderIcon(512, { maskable: true });
  if (icon === '512.png') return renderIcon(512);
  return renderIcon(192);
}

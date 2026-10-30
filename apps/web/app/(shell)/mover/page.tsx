import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { SpacePlaceholder } from '../../_components/space-placeholder';

export default async function Mover() {
  const me = await getMe();
  if (!me?.capabilities.isMover) {
    redirect('/');
  }
  return (
    <SpacePlaceholder
      title="Mover"
      desc="Solicitudes cercanas, viaje activo y ganancias (capacidad Mover)."
    />
  );
}

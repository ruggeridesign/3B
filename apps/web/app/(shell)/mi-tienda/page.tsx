import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { SpacePlaceholder } from '../../_components/space-placeholder';

export default async function MiTienda() {
  const me = await getMe();
  if (!me?.capabilities.isSeller) {
    redirect('/');
  }
  return (
    <SpacePlaceholder
      title="Mi Tienda"
      desc="Catálogo, inventario, pedidos y cobros de tus tiendas (capacidad Seller)."
    />
  );
}

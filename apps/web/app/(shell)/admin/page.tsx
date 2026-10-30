import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { SpacePlaceholder } from '../../_components/space-placeholder';

export default async function Admin() {
  const me = await getMe();
  if (!me?.capabilities.isPlatformAdmin) {
    redirect('/');
  }
  return (
    <SpacePlaceholder
      title="Admin"
      desc="Verificaciones, moderación, comunidades y auditoría (admin de plataforma)."
    />
  );
}

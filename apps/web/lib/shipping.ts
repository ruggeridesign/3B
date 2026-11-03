import type { Shipment, ShipmentTrack } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Etiqueta legible del estado de un envío. */
export const SHIPMENT_STATUS_LABEL: Record<Shipment['status'], string> = {
  solicitado: 'Solicitado',
  ofertado: 'Ofertado',
  asignado: 'Asignado',
  hacia_retiro: 'Hacia el retiro',
  retirado: 'Retirado',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  fallido: 'Fallido',
};

/** Envío (activo) de un pedido, con ofertas. null si no hay o no es visible. */
export async function getOrderShipment(
  orderId: string,
): Promise<Shipment | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/orders/${orderId}/shipment`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Shipment;
  } catch {
    return null;
  }
}

/** Solicitudes de envío abiertas (cola del Mover). [] si no hay sesión o falla. */
export async function getOpenShipments(): Promise<Shipment[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/shipments/open`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { shipments: Shipment[] };
    return data.shipments;
  } catch {
    return [];
  }
}

/** Rastreo de un envío (última posición + recorrido). null si no hay o falla. */
export async function getShipmentTrack(
  shipmentId: string,
): Promise<ShipmentTrack | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/shipments/${shipmentId}/track`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ShipmentTrack;
  } catch {
    return null;
  }
}

/** Mis viajes (envíos asignados al Mover). [] si no hay sesión o falla. */
export async function getAssignedShipments(): Promise<Shipment[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/shipments/assigned`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { shipments: Shipment[] };
    return data.shipments;
  } catch {
    return [];
  }
}

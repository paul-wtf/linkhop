import type { ConvertResponse } from '$lib/api/types';

export function preferredLink(result: ConvertResponse, serviceId: string | null): string | null {
  if (!serviceId) return null;
  if (serviceId === result.source.service) return result.source.url;
  const target = result.targets[serviceId];
  if (target && (target.status === 'ok' || target.status === 'ok_low')) return target.url ?? null;
  return null;
}

import { writable } from 'svelte/store';
import type { ServiceInfo } from '#lib/api/types.ts';

export const services = writable<Record<string, ServiceInfo>>({});

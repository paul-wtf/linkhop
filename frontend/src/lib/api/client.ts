import {
  ApiError,
  type ApiErrorCode,
  type ConvertResponse,
  type SearchResponse,
  type ServicesResponse,
  type TargetResult
} from './types';

const BASE = '/api/v1';

function mapStatus(status: number, code: string | undefined): ApiErrorCode {
  if (code === 'invalid_url' || code === 'unsupported_service') return code;
  if (code === 'rate_limited' || status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  if (status === 400) return 'invalid_url';
  return 'server_error';
}

async function open(path: string, opts?: { sourceUrl?: string; signal?: AbortSignal }): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { signal: opts?.signal });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
    throw new ApiError('offline', 0, 'Keine Verbindung zum Server', opts?.sourceUrl);
  }
  if (!res.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const json = await res.json();
      // Backend wraps errors as {"error": {"code": ..., "message": ...}}
      const err = json.error ?? json;
      code = err.code;
      message = err.message ?? err.detail;
    } catch { /* body leer / kein JSON */ }
    throw new ApiError(
      mapStatus(res.status, code),
      res.status,
      message ?? res.statusText,
      opts?.sourceUrl
    );
  }
  return res;
}

async function request<T>(path: string, opts?: { sourceUrl?: string; signal?: AbortSignal }): Promise<T> {
  return (await open(path, opts)).json() as Promise<T>;
}

export async function convert(
  url: string,
  opts: { share?: boolean; targets?: string[]; signal?: AbortSignal } = {}
): Promise<ConvertResponse> {
  const qs = new URLSearchParams({ url });
  if (opts.share) qs.set('share', 'true');
  if (opts.targets?.length) qs.set('targets', opts.targets.join(','));
  return request<ConvertResponse>(`${BASE}/convert?${qs}`, { sourceUrl: url, signal: opts.signal });
}

export interface StreamHandlers {
  signal?: AbortSignal;
  onSource?: (source: ConvertResponse['source'], pending: string[]) => void;
  onTarget?: (service: string, result: TargetResult) => void;
}

export async function convertStream(url: string, opts: StreamHandlers = {}): Promise<ConvertResponse> {
  const qs = new URLSearchParams({ url });
  let res: Response;
  try {
    res = await open(`${BASE}/convert/stream?${qs}`, { sourceUrl: url, signal: opts.signal });
  } catch (e) {
    // FastAPI's own 404 for an unknown route, as opposed to the app's
    // "source not found": the backend is older than this frontend, which
    // happens while a release rolls out.
    if (e instanceof ApiError && e.status === 404 && e.message === 'Not Found') {
      return convert(url, { signal: opts.signal });
    }
    throw e;
  }
  if (!res.body) return convert(url, { signal: opts.signal });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null');
      if (event === 'source') opts.onSource?.(data.source, data.pending);
      else if (event === 'target') opts.onTarget?.(data.service, data.result);
      else if (event === 'done') return data as ConvertResponse;
    }
  }
  throw new ApiError('server_error', 0, 'stream ended before the result', url);
}

export async function lookup(shortId: string): Promise<ConvertResponse> {
  return request<ConvertResponse>(`${BASE}/c/${encodeURIComponent(shortId)}`);
}

export async function search(
  query: string,
  opts: { signal?: AbortSignal } = {}
): Promise<SearchResponse> {
  const qs = new URLSearchParams({ q: query });
  return request<SearchResponse>(`${BASE}/search?${qs}`, { signal: opts.signal });
}

export async function services(): Promise<ServicesResponse> {
  return request<ServicesResponse>(`${BASE}/services`);
}

export { ApiError } from './types';

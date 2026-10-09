// Typed client for the FastAPI backend. Always same-origin (/api/*): Next.js rewrites the
// requests to BACKEND_URL, so the session cookie is first-party.

import type {
  CatalogVpc,
  DnsRecord,
  ErrorBody,
  ExportFormat,
  HostedZone,
  HostedZoneCreate,
  HostedZoneSummary,
  HostedZoneUpdate,
  LoginInput,
  Page,
  RecordInput,
  RecordListQuery,
  Region,
  Tag,
  User,
  ZoneFileImportResult,
  ZoneListQuery,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.field_errors ?? {};
  }
}

type QueryValue = string | number | boolean | undefined | null | readonly (string | number)[];

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Don't redirect to /login on 401 (used by the auth bootstrap and the login form). */
  skipAuthRedirect?: boolean;
}

export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: ErrorBody };
    if (data.error) return new ApiError(response.status, data.error);
  } catch {
    // Non-JSON error (e.g. proxy failure) – fall through to a generic error.
  }
  return new ApiError(response.status, {
    code: response.status >= 500 ? 'InternalError' : 'HttpError',
    message:
      response.status >= 500
        ? 'The service is temporarily unavailable. Try again in a moment.'
        : `Request failed with status ${response.status}.`,
    field_errors: {},
  });
}

async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`/api${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });
  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401 && error.code === 'Unauthorized' && !options.skipAuthRedirect) {
      redirectToLogin();
    }
    throw error;
  }
  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- auth ------------------------------------------------------------------------------

export const login = (input: LoginInput) =>
  request<User>('/auth/login', { method: 'POST', body: input, skipAuthRedirect: true });

export const logout = () =>
  request<void>('/auth/logout', { method: 'POST', skipAuthRedirect: true });

export const getCurrentUser = (signal?: AbortSignal) =>
  request<User>('/auth/me', { signal, skipAuthRedirect: true });

// --- hosted zones ----------------------------------------------------------------------

export const listHostedZones = (query: ZoneListQuery, signal?: AbortSignal) =>
  request<Page<HostedZoneSummary>>('/hosted-zones', { query: { ...query }, signal });

export const getHostedZone = (zoneId: string, signal?: AbortSignal) =>
  request<HostedZone>(`/hosted-zones/${encodeURIComponent(zoneId)}`, { signal });

export const createHostedZone = (input: HostedZoneCreate) =>
  request<HostedZone>('/hosted-zones', { method: 'POST', body: input });

export const updateHostedZone = (zoneId: string, input: HostedZoneUpdate) =>
  request<HostedZone>(`/hosted-zones/${encodeURIComponent(zoneId)}`, {
    method: 'PATCH',
    body: input,
  });

export const replaceHostedZoneTags = (zoneId: string, tags: Tag[]) =>
  request<Tag[]>(`/hosted-zones/${encodeURIComponent(zoneId)}/tags`, {
    method: 'PUT',
    body: { tags },
  });

export const deleteHostedZone = (zoneId: string) =>
  request<void>(`/hosted-zones/${encodeURIComponent(zoneId)}`, { method: 'DELETE' });

// --- records ---------------------------------------------------------------------------

const recordsPath = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}/records`;

export const listRecords = (zoneId: string, query: RecordListQuery, signal?: AbortSignal) =>
  request<Page<DnsRecord>>(recordsPath(zoneId), { query: { ...query }, signal });

export const getRecord = (zoneId: string, recordId: string, signal?: AbortSignal) =>
  request<DnsRecord>(`${recordsPath(zoneId)}/${encodeURIComponent(recordId)}`, { signal });

export const createRecords = (zoneId: string, records: RecordInput[]) =>
  request<{ items: DnsRecord[] }>(recordsPath(zoneId), { method: 'POST', body: { records } });

export const updateRecord = (zoneId: string, recordId: string, record: RecordInput) =>
  request<DnsRecord>(`${recordsPath(zoneId)}/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    body: record,
  });

export const deleteRecord = (zoneId: string, recordId: string) =>
  request<void>(`${recordsPath(zoneId)}/${encodeURIComponent(recordId)}`, { method: 'DELETE' });

export const bulkDeleteRecords = (zoneId: string, ids: string[]) =>
  request<{ deleted: number }>(`${recordsPath(zoneId)}/bulk-delete`, {
    method: 'POST',
    body: { ids },
  });

export const importZoneFile = (zoneId: string, zoneFile: string) =>
  request<ZoneFileImportResult>(`/hosted-zones/${encodeURIComponent(zoneId)}/import`, {
    method: 'POST',
    body: { zone_file: zoneFile },
  });

/** Downloads an export and returns it as a Blob plus the server-provided file name. */
export async function exportZone(
  zoneId: string,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const response = await send(`/hosted-zones/${encodeURIComponent(zoneId)}/export`, {
    query: { format },
  });
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `${zoneId}.${format === 'json' ? 'json' : 'zone'}`;
  return { blob: await response.blob(), filename };
}

// --- meta ------------------------------------------------------------------------------

export const listRegions = (signal?: AbortSignal) => request<Region[]>('/meta/regions', { signal });

export const listVpcs = (region?: string, signal?: AbortSignal) =>
  request<CatalogVpc[]>('/meta/vpcs', { query: { region }, signal });

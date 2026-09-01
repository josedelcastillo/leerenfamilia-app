import { getToken } from './token.ts';
import type { ItemResult, QueuedItem } from './sync-queue.ts';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const body: unknown = text === '' ? {} : JSON.parse(text);

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Error ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export interface Activity {
  id: string;
  kind: 'lectura' | 'cancion' | 'juego' | 'conversacion';
  title: string;
  instructions: string;
  mediaUrl: string | null;
  approximateMinutes: number;
}

export interface WeekContent {
  week: number;
  title: string;
  summary: string;
  activities: Activity[];
  isPlaceholder?: boolean;
  todo?: string;
}

export interface ContentResponse {
  babyName: string;
  currentWeek: number;
  programWeeks: number;
  finished: boolean;
  weeks: WeekContent[];
}

export interface FeedbackReply {
  text: string;
  gestorSub: string;
  at: string;
}

export interface Feedback {
  id: string;
  type: 'comentario' | 'pedido' | 'consulta' | 'problema';
  channel: 'pwa' | 'whatsapp';
  text: string;
  status: 'abierto' | 'respondido' | 'cerrado';
  createdAt: string;
  replies: FeedbackReply[];
}

export const api = {
  getContent: () => request<ContentResponse>('/contenido'),
  listFeedback: () => request<{ feedback: Feedback[] }>('/feedback'),
  register: (payload: unknown) =>
    request<{ familyId: string; token: string; anchorDate: string }>('/registro', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

/**
 * How the queue reaches the server. Log entries and resource accesses go as one batch to the
 * tracking endpoint; feedback goes one at a time, because each one is its own resource.
 *
 * Every branch reports per item, so the queue drops exactly what landed.
 */
export const sendQueued = async (items: readonly QueuedItem[]): Promise<ItemResult[]> => {
  const results: ItemResult[] = [];
  const tracking = items.filter((item) => item.kind !== 'feedback');
  const feedback = items.filter((item) => item.kind === 'feedback');

  if (tracking.length > 0) {
    const response = await request<{ results: ItemResult[] }>('/seguimiento', {
      method: 'POST',
      body: JSON.stringify({
        items: tracking.map((item) => ({ ...item.payload, kind: item.kind })),
      }),
    });
    results.push(...response.results);
  }

  for (const item of feedback) {
    try {
      await request('/feedback', { method: 'POST', body: JSON.stringify(item.payload) });
      results.push({ clientId: item.clientId, status: 'ok' });
    } catch (error) {
      // A 4xx is the device's fault and will never succeed; anything else may work later.
      const rejected = error instanceof ApiError && error.status >= 400 && error.status < 500;
      results.push({
        clientId: item.clientId,
        status: rejected ? 'rechazado' : 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
};

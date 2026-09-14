import { currentIdToken } from './auth.ts';

const BASE = '/api/gestor';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await currentIdToken();
  if (token === null) {
    throw new Error('Sesión expirada');
  }
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: token,
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
    throw new Error(message);
  }
  return body as T;
}

export interface FamilyRow {
  familyId: string;
  babyName: string;
  status: string;
  programWeek: number;
  finished: boolean;
  logEntriesLast7Days: number;
  minutesLast7Days: number;
  lastActivityAt: string | null;
  openFeedback: number;
  caregiversOptedIn: number;
  deliveries: number;
}

export interface FeedbackReply {
  text: string;
  gestorSub: string;
  at: string;
}

export interface Feedback {
  id: string;
  type: string;
  channel: 'pwa' | 'whatsapp';
  text: string;
  status: 'abierto' | 'respondido' | 'cerrado';
  createdAt: string;
  replies: FeedbackReply[];
}

export interface InboxItem {
  familyId: string;
  babyName: string;
  feedback: Feedback;
}

export interface LogSummary {
  entries: number;
  totalMinutes: number;
  byKind: Record<string, number>;
  distinctDays: number;
}

export interface FamilyDetail {
  familyId: string;
  babyName: string;
  status: string;
  programWeek: number;
  anchorDate: string;
  summary: LogSummary;
  summaryLast7Days: LogSummary;
  entries: Array<{ date: string; kind: string; minutes: number; note: string | null; loggedBy: string }>;
  notesVisible: boolean;
  feedback: Feedback[];
  caregivers: Array<{ msisdn: string; role: string; optIn: boolean }>;
}

export interface ReplyOutcome {
  feedback: Feedback;
  channel: string;
  notified: boolean;
  reason?: string;
}

export const gestorApi = {
  familias: () => request<{ familias: FamilyRow[] }>('/familias'),
  familia: (id: string) => request<FamilyDetail>(`/familias/${encodeURIComponent(id)}`),
  bandeja: (estado: string) =>
    request<{ mensajes: InboxItem[] }>(`/bandeja?estado=${encodeURIComponent(estado)}`),
  responder: (familyId: string, feedbackId: string, text: string) =>
    request<ReplyOutcome>('/respuesta', {
      method: 'POST',
      body: JSON.stringify({ familyId, feedbackId, text }),
    }),
  cerrar: (familyId: string, feedbackId: string) =>
    request<{ feedback: Feedback }>('/cerrar', {
      method: 'POST',
      body: JSON.stringify({ familyId, feedbackId }),
    }),
};

import { DomainError } from './errors.ts';

export type FeedbackType = 'comentario' | 'pedido' | 'consulta' | 'problema';
export type FeedbackStatus = 'abierto' | 'respondido' | 'cerrado';

/** Where it came in. Both channels land in the same manager inbox. */
export type FeedbackChannel = 'pwa' | 'whatsapp';

export interface FeedbackReply {
  readonly text: string;
  /** Cognito `sub` of the manager who wrote it. Every reply is attributable to a person. */
  readonly gestorSub: string;
  readonly at: string;
}

export interface Feedback {
  readonly id: string;
  readonly type: FeedbackType;
  readonly channel: FeedbackChannel;
  readonly text: string;
  readonly status: FeedbackStatus;
  readonly createdAt: string;
  readonly replies: readonly FeedbackReply[];
  readonly closedAt: string | null;
  readonly closedBy: string | null;
}

export function createFeedback(input: {
  id: string;
  type: FeedbackType;
  channel: FeedbackChannel;
  text: string;
  createdAt: string;
}): Feedback {
  return {
    ...input,
    status: 'abierto',
    replies: [],
    closedAt: null,
    closedBy: null,
  };
}

/**
 * Replies are append-only. A reply is never edited: correcting one means adding another, so the
 * family sees the whole exchange and the record of what was actually told to them survives.
 */
export function addReply(feedback: Feedback, reply: FeedbackReply): Feedback {
  if (feedback.status === 'cerrado') {
    throw new DomainError(
      'invalid_transition',
      `Feedback ${feedback.id} is closed and cannot take another reply`,
    );
  }
  return { ...feedback, status: 'respondido', replies: [...feedback.replies, reply] };
}

export function closeFeedback(feedback: Feedback, at: string, gestorSub: string): Feedback {
  if (feedback.status === 'cerrado') {
    throw new DomainError('invalid_transition', `Feedback ${feedback.id} is already closed`);
  }
  return { ...feedback, status: 'cerrado', closedAt: at, closedBy: gestorSub };
}

/** Drives the inbox's default filter and the "open feedback" count in the family list. */
export function isAwaitingReply(feedback: Feedback): boolean {
  return feedback.status === 'abierto';
}

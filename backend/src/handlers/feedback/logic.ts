import { createFeedback, type Feedback, type FeedbackType } from '../../domain/feedback.ts';
import { DomainError } from '../../domain/errors.ts';
import type { FamilyContext, FamilyStore } from '../family-ports.ts';

const TYPES: readonly FeedbackType[] = ['comentario', 'pedido', 'consulta', 'problema'];
export const MAX_FEEDBACK_LENGTH = 2000;

export interface SubmitFeedbackInput {
  readonly clientId: string;
  readonly type: string;
  readonly text: string;
  readonly createdAt: string;
}

export async function submitFeedback(
  store: FamilyStore,
  context: FamilyContext,
  input: SubmitFeedbackInput,
): Promise<Feedback> {
  if (typeof input.clientId !== 'string' || input.clientId.trim() === '') {
    throw new DomainError('invalid_feedback', 'Falta el identificador generado en el dispositivo');
  }
  if (!TYPES.includes(input.type as FeedbackType)) {
    throw new DomainError('invalid_feedback', `Tipo no reconocido: ${String(input.type)}`);
  }
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text === '') {
    throw new DomainError('invalid_feedback', 'El mensaje no puede estar vacío');
  }
  if (text.length > MAX_FEEDBACK_LENGTH) {
    throw new DomainError('invalid_feedback', `El mensaje no puede pasar de ${MAX_FEEDBACK_LENGTH} caracteres`);
  }

  const feedback = createFeedback({
    id: input.clientId.trim(),
    type: input.type as FeedbackType,
    channel: 'pwa',
    text,
    createdAt: input.createdAt,
  });

  // Idempotent: the client id is part of the sort key, so a replayed flush overwrites this exact
  // item rather than filing the same question twice.
  await store.putFeedback(context.familyId, context.programId, feedback);
  return feedback;
}

/** The family sees its own thread, replies included. It never sees another family's. */
export async function listOwnFeedback(
  store: FamilyStore,
  context: FamilyContext,
): Promise<Feedback[]> {
  const all = await store.listFeedback(context.familyId);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

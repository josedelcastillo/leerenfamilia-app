import type { QueuedItem } from '../shared/sync-queue.ts';

/** The privacy screen text is a draft pending legal review, like the enrolment consent. */
export const CONSENT_TEXT_VERSION = 'borrador-0';

/**
 * The erasure endpoint does not exist yet (CLAUDE.md, Estado). Until it does, the button sends a
 * fixed request through the inbox, where a manager handles it by hand (D-027). The wording is
 * fixed so the team can recognise it and nobody has to write it under stress.
 */
export const SUPPRESSION_REQUEST_TEXT =
  'Pido que borren mis datos y los de mi bebé del programa Nacidos para Leer.';

/**
 * The state the switch shows: the latest change still waiting in the queue, or else what the server
 * said. Null means we have never heard from the server and nothing is queued — the screen says so
 * instead of guessing.
 */
export function effectiveNotesConsent(
  server: boolean | null,
  queued: readonly QueuedItem[],
): boolean | null {
  const latest = queued
    .filter((item) => item.kind === 'consentimiento' && typeof item.payload['notesAuthorized'] === 'boolean')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
    .at(-1);
  return latest === undefined ? server : (latest.payload['notesAuthorized'] as boolean);
}

export function consentPayload(clientId: string, notesAuthorized: boolean, now: Date): Record<string, unknown> {
  return { clientId, notesAuthorized, at: now.toISOString(), version: CONSENT_TEXT_VERSION };
}

export function suppressionPayload(clientId: string, now: Date): Record<string, unknown> {
  return { clientId, type: 'pedido', text: SUPPRESSION_REQUEST_TEXT, createdAt: now.toISOString() };
}

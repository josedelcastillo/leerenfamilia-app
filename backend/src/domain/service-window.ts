/**
 * Meta opens a 24-hour service window each time a user messages the business. Inside it, free-form
 * messages are allowed and cost nothing; outside it, only an approved template will deliver, and
 * that one is charged.
 *
 * Every inbound message reopens and resets the window, so only the most recent one matters.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReplyChannel = 'mensaje_libre' | 'plantilla';

/**
 * `lastInboundAt` and `now` are epoch milliseconds. Exactly 24 hours after the last inbound the
 * window is closed: at the boundary we pay for a template rather than risk a message Meta drops.
 */
export function isServiceWindowOpen(lastInboundAt: number | null, now: number): boolean {
  if (lastInboundAt === null) {
    return false;
  }
  const elapsed = now - lastInboundAt;
  return elapsed >= 0 && elapsed < SERVICE_WINDOW_MS;
}

export function serviceWindowExpiresAt(lastInboundAt: number): number {
  return lastInboundAt + SERVICE_WINDOW_MS;
}

/** Free text while the window is open, an approved template otherwise. */
export function chooseReplyChannel(lastInboundAt: number | null, now: number): ReplyChannel {
  return isServiceWindowOpen(lastInboundAt, now) ? 'mensaje_libre' : 'plantilla';
}

/** An inbound message always resets the window, whatever its content. */
export function recordInbound(receivedAt: number): number {
  return receivedAt;
}

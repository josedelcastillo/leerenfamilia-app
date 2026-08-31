// Phase 4: weekly scheduler. Computes each family's program week from its stored anchor date and
// sends the WhatsApp template, idempotent on (family_id, iso_week).
export async function handler(): Promise<{ status: string; plannedPhase: number }> {
  return { status: 'not_implemented', plannedPhase: 4 };
}

import type { HistorialEntry } from './historial.ts';

/**
 * The growing brain.
 *
 * One connection lights for each **distinct day** on which the family did an activity of that kind.
 * Days rather than entries: it is what the pilot measures as adherence, it rewards the constancy the
 * programme actually asks for ("un minuto basta"), and it cannot be inflated by logging the same
 * afternoon ten times.
 *
 * **It only ever grows.** Nothing here decays, dims or empties when a family stops logging. A brain
 * that withers after a bad week is a guilt device aimed at someone in the hardest month of her life,
 * and it contradicts the operating model's own principle 3.4. It would also corrupt the data: if
 * logging carries an emotional cost, people stop logging, and the log is the pilot's primary source.
 *
 * The network grows **outward from the centre, in chronological order**, each new branch attaching to
 * the nearest one already there. That is the irrigation the drawing is meant to show, and it is
 * truthful: the shape of the brain is the shape of that family's real history.
 */

export const ZONE_KINDS = ['lectura', 'cancion', 'juego', 'conversacion'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/** 56 branches: one for each day of the eight-week programme. */
export const TOTAL_NODES = 56;

export const ZONE_LABEL: Record<ZoneKind, string> = {
  lectura: 'Lectura',
  cancion: 'Canciones',
  juego: 'Juego',
  conversacion: 'Conversación',
};

export interface Branch {
  /** Index into `NODES`; also its order of appearance. */
  readonly index: number;
  readonly kind: ZoneKind;
  readonly date: string;
}

export interface BrainState {
  readonly branches: readonly Branch[];
  readonly byKind: Readonly<Record<ZoneKind, number>>;
  readonly distinctDays: number;
  readonly totalNodes: number;
}

const EMPTY_BY_KIND: Record<ZoneKind, number> = {
  lectura: 0, cancion: 0, juego: 0, conversacion: 0,
};

function isZoneKind(value: string): value is ZoneKind {
  return (ZONE_KINDS as readonly string[]).includes(value);
}

export function brainState(entries: readonly HistorialEntry[]): BrainState {
  // One branch per (day, kind), in chronological order: the drawing grows the way the weeks did.
  const seen = new Set<string>();
  const pairs: Array<{ date: string; kind: ZoneKind }> = [];

  for (const entry of entries) {
    if (entry.date === '' || !isZoneKind(entry.kind)) continue;
    const key = `${entry.date}#${entry.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ date: entry.date, kind: entry.kind });
  }

  pairs.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const byKind: Record<ZoneKind, number> = { ...EMPTY_BY_KIND };
  const branches: Branch[] = [];

  for (const pair of pairs) {
    byKind[pair.kind] += 1;
    // Beyond capacity the drawing simply stops adding branches. It never removes any.
    if (branches.length < TOTAL_NODES) {
      branches.push({ index: branches.length, kind: pair.kind, date: pair.date });
    }
  }

  return {
    branches,
    byKind,
    distinctDays: new Set(pairs.map((pair) => pair.date)).size,
    totalNodes: TOTAL_NODES,
  };
}

export interface Node {
  readonly x: number;
  readonly y: number;
  /** Index of the node this one branches from; -1 for the first, which grows from the root. */
  readonly parent: number;
}

export const ROOT: Node = { x: 98, y: 78, parent: -1 };

/**
 * Node positions, computed once and deterministically so a family always sees the same brain.
 *
 * A golden-angle spiral fills the brain evenly without the clumping a random scatter produces, and
 * because its radius grows as √i, the natural index order already runs from the centre outward —
 * which is exactly the order the branches appear in.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RX = 56;
const RY = 40;

function buildNodes(): Node[] {
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < TOTAL_NODES; index += 1) {
    const t = Math.sqrt((index + 0.5) / TOTAL_NODES);
    const angle = index * GOLDEN_ANGLE;
    points.push({
      x: Number((ROOT.x + RX * t * Math.cos(angle)).toFixed(2)),
      y: Number((ROOT.y + RY * t * Math.sin(angle)).toFixed(2)),
    });
  }

  // Each branch attaches to the nearest one already drawn, so the network spreads instead of
  // radiating from a single point like a star.
  return points.map((point, index) => {
    if (index === 0) {
      return { ...point, parent: -1 };
    }
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < index; candidate += 1) {
      const other = points[candidate]!;
      const distance = (other.x - point.x) ** 2 + (other.y - point.y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = candidate;
      }
    }
    return { ...point, parent: nearest };
  });
}

export const NODES: readonly Node[] = buildNodes();

export function nodeAt(index: number): Node {
  return NODES[index] ?? ROOT;
}

export function parentOf(index: number): Node {
  const node = NODES[index];
  return node === undefined || node.parent < 0 ? ROOT : NODES[node.parent]!;
}

/** A sentence that says what the drawing says, for anyone who cannot see it. */
export function brainDescription(state: BrainState): string {
  if (state.distinctDays === 0) {
    return 'Todavía no hay conexiones. La primera aparece cuando registres tu primer encuentro.';
  }
  const parts = ZONE_KINDS.filter((kind) => state.byKind[kind] > 0).map(
    (kind) => `${ZONE_LABEL[kind].toLowerCase()} ${state.byKind[kind]}`,
  );
  const total = state.branches.length;
  return (
    `${state.distinctDays} ${state.distinctDays === 1 ? 'día' : 'días'} de encuentros, ` +
    `${total} ${total === 1 ? 'conexión' : 'conexiones'}. ` +
    `Días por actividad: ${parts.join(', ')}.`
  );
}

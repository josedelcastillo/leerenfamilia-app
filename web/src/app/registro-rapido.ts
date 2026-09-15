import type { ActivityKind, DeclaredBy } from '../shared/api.ts';

/**
 * Logging in one tap (D-024). The rule the design sets: nothing optional is asked before the entry
 * is confirmed. The first tap writes the entry with no duration and no "who"; the details, if the
 * caregiver adds them, rewrite the same entry — same client id and same date, hence the same
 * DynamoDB item — rather than creating a second one.
 */

export const WHO_OPTIONS: ReadonlyArray<{ value: DeclaredBy; label: string }> = [
  { value: 'mama', label: 'Mamá' },
  { value: 'papa', label: 'Papá' },
  { value: 'otra', label: 'Otra' },
];

/** The activation screen's wording for the same three options. */
export const RELATION_OPTIONS: ReadonlyArray<{ value: DeclaredBy; label: string }> = [
  { value: 'mama', label: 'Mamá' },
  { value: 'papa', label: 'Papá' },
  { value: 'otra', label: 'Otra persona que cuida' },
];

/** "10+" is stored as 10: the chip means "ten or more", and the indicator is a lower bound. */
export const MINUTE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10+ min' },
];

export const KIND_COPY: Record<
  ActivityKind,
  { pregunta: string; boton: string; hecho: string; confirmado: string }
> = {
  lectura: { pregunta: '¿Leyeron hoy?', boton: 'Registrar lectura', hecho: 'Ya la leímos', confirmado: 'Lectura registrada' },
  cancion: { pregunta: '¿Cantaron hoy?', boton: 'Registrar canción', hecho: 'Ya la cantamos', confirmado: 'Canción registrada' },
  juego: { pregunta: '¿Jugaron hoy?', boton: 'Registrar juego', hecho: 'Ya jugamos', confirmado: 'Juego registrado' },
  conversacion: { pregunta: '¿Conversaron hoy?', boton: 'Registrar conversación', hecho: 'Ya conversamos', confirmado: 'Conversación registrada' },
};

export function firstTapPayload(input: {
  clientId: string;
  date: string;
  kind: ActivityKind;
  resourceId: string | null;
}): Record<string, unknown> {
  return {
    clientId: input.clientId,
    date: input.date,
    kind_actividad: input.kind,
    minutes: null,
    resourceId: input.resourceId,
    note: null,
    declaredBy: null,
  };
}

export function detailsPayload(
  first: Record<string, unknown>,
  details: { minutes: number | null; declaredBy: DeclaredBy | null; note: string },
): Record<string, unknown> {
  const note = details.note.trim();
  return {
    ...first,
    minutes: details.minutes,
    declaredBy: details.declaredBy,
    note: note === '' ? null : note,
  };
}

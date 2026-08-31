/**
 * Eight weeks of PLACEHOLDER content.
 *
 * TODO: contenido real pendiente de Leer en Familia.
 *
 * Nothing here is real programme content. No song, no book text and no activity has been invented:
 * those carry copyright, and the content is Leer en Familia's to define, not the platform's.
 * What this file provides is the shape the real content has to fit, so the send, the PWA and the
 * export can be built and demonstrated before a single word is written.
 *
 * One open question travels with this file (see docs/decisiones.md D-003): the operating model
 * frames the programme as "the first 8 weeks of life", but the schedule anchors to enrolment. Every
 * `week` below is therefore a **week of the programme**, not a week of the baby's life. Leer en
 * Familia needs to confirm which one they are writing for before the real content is drafted.
 */

export const PLACEHOLDER_NOTICE = 'TODO: contenido real pendiente de Leer en Familia';

export type ActivityKind = 'lectura' | 'cancion' | 'juego' | 'conversacion';

export interface Activity {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly title: string;
  readonly instructions: string;
  /** Audio or image under `assets/`, cached by the service worker. Empty until real content lands. */
  readonly mediaUrl: string | null;
  readonly approximateMinutes: number;
}

export interface WeekContent {
  /** Week of the **programme**, counted from the family's anchor date. Not the baby's age. */
  readonly week: number;
  readonly title: string;
  readonly summary: string;
  readonly activities: readonly Activity[];
  readonly isPlaceholder: true;
  readonly todo: string;
}

function placeholderWeek(week: number): WeekContent {
  const suffix = String(week).padStart(2, '0');
  return {
    week,
    title: `Semana ${week} — actividad por definir`,
    summary: PLACEHOLDER_NOTICE,
    activities: [
      {
        id: `s${suffix}-lectura`,
        kind: 'lectura',
        title: 'Lectura compartida — por definir',
        instructions: PLACEHOLDER_NOTICE,
        mediaUrl: null,
        approximateMinutes: 5,
      },
      {
        id: `s${suffix}-cancion`,
        kind: 'cancion',
        // Deliberately unnamed: song titles and lyrics are copyrighted material.
        title: 'Canción — por definir',
        instructions: PLACEHOLDER_NOTICE,
        mediaUrl: null,
        approximateMinutes: 3,
      },
      {
        id: `s${suffix}-juego`,
        kind: 'juego',
        title: 'Juego — por definir',
        instructions: PLACEHOLDER_NOTICE,
        mediaUrl: null,
        approximateMinutes: 5,
      },
      {
        id: `s${suffix}-conversacion`,
        kind: 'conversacion',
        title: 'Conversación — por definir',
        instructions: PLACEHOLDER_NOTICE,
        mediaUrl: null,
        approximateMinutes: 5,
      },
    ],
    isPlaceholder: true,
    todo: PLACEHOLDER_NOTICE,
  };
}

export const PLACEHOLDER_WEEKS: readonly WeekContent[] = Array.from({ length: 8 }, (_, index) =>
  placeholderWeek(index + 1),
);

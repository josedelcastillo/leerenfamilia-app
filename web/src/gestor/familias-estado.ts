import type { FamilyRow } from './api.ts';

export type EstadoFamilia = 'activa' | 'en_pausa' | 'sin_activar' | 'de_baja';

export const ESTADO_LABEL: Record<EstadoFamilia, string> = {
  activa: 'Activa',
  en_pausa: 'En pausa',
  sin_activar: 'Sin activar',
  de_baja: 'De baja',
};

/** Derived from data the list already has: recent entries, all entries, and the family status. */
export function estadoFamilia(row: Pick<FamilyRow, 'status' | 'logEntriesLast7Days' | 'totalEntries'>): EstadoFamilia {
  if (row.status !== 'activa') return 'de_baja';
  if (row.totalEntries === 0) return 'sin_activar';
  return row.logEntriesLast7Days > 0 ? 'activa' : 'en_pausa';
}

const RELATION: Record<string, string> = { mama: 'Mamá', papa: 'Papá', otra: 'Otra persona' };
const ROLE: Record<string, string> = { principal: 'Principal', secundario: 'Secundario' };

export function caregiversLabel(caregivers: FamilyRow['caregivers']): string {
  return caregivers
    .map((c) => (c.relation !== null ? RELATION[c.relation] : ROLE[c.role]) ?? c.role)
    .join(', ');
}

export function lastEntryLabel(date: string | null, today: string): string {
  if (date === null) return 'Sin registros';
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'Hoy';
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
}

export function filterRows(
  rows: readonly FamilyRow[],
  filters: { query: string; semana: number | null; estado: EstadoFamilia | null },
): FamilyRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) =>
    (query === '' || row.babyName.toLowerCase().includes(query) || row.familyId.toLowerCase().includes(query)) &&
    (filters.semana === null || row.programWeek === filters.semana) &&
    (filters.estado === null || estadoFamilia(row) === filters.estado),
  );
}

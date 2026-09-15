import type { AuditEntry } from './api.ts';
import { shortId, whenLabel } from './tiempo.ts';

export const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  ver_detalle_familia: 'Ver ficha',
  responder_feedback: 'Responder',
  exportar_datos: 'Exportar',
};

const DATASET_LABEL: Record<string, string> = {
  resumen: 'Resumen de indicadores',
  familias: 'Listado de familias',
  bitacora: 'Bitácora completa',
  envios: 'Envíos',
  feedback: 'Mensajes de las familias',
  auditoria: 'Registro de accesos',
};

export interface AuditRowView {
  cuando: string;
  quien: string;
  que: string;
  accion: string;
  /** Exports take data about minors off the platform; they are the rows worth a second look. */
  alerta: boolean;
}

export function auditRow(entry: AuditEntry, today: string): AuditRowView {
  const que = entry.familyId !== null
    ? `Familia ${shortId(entry.familyId)}`
    : DATASET_LABEL[entry.detail ?? ''] ?? entry.detail ?? '—';
  return {
    cuando: whenLabel(entry.at, today),
    quien: entry.gestorEmail.split('@')[0] || entry.gestorSub,
    que,
    accion: ACTION_LABEL[entry.action] ?? entry.action,
    alerta: entry.action === 'exportar_datos',
  };
}

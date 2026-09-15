import { useEffect, useState } from 'react';
import { gestorApi, type AuditEntry } from './api.ts';
import { auditRow } from './auditoria.ts';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';
import { limaToday } from './tiempo.ts';

/** Screen 14. The last two months on screen; the whole log is one export away. */
export function Auditoria() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const today = limaToday(new Date());

  useEffect(() => {
    gestorApi.auditoria()
      .then((response) => setEntries(response.entradas))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      await descargarCsv('auditoria');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Cabecera titulo="Auditoría de accesos">
        <button type="button" className="g-btn g-btn--primario" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? 'Generando…' : 'Exportar CSV'}
        </button>
      </Cabecera>
      <div className="g-cuerpo">
        <p className="g-intro">
          Se registra cada vez que alguien del equipo abre la ficha de una familia, responde un mensaje o exporta
          datos. Por tratarse de datos de menores, este registro no se puede desactivar.
        </p>
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {entries === null && error === null && <p className="g-faint">Cargando…</p>}
        {entries !== null && (
          <div className="g-tabla-caja">
            <table className="g-tabla g-tabla--auditoria">
              <colgroup><col className="g-col-cuando" /><col /><col /><col className="g-col-accion" /></colgroup>
              <thead>
                <tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué abrió</th><th scope="col">Acción</th></tr>
              </thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={4}>Sin accesos en los dos últimos meses.</td></tr>}
                {entries.map((entry, index) => {
                  const row = auditRow(entry, today);
                  return (
                    // Two entries can share a manager and a timestamp; the index keeps the key unique.
                    <tr key={`${entry.at}-${entry.gestorSub}-${index}`}>
                      <td>{row.cuando}</td>
                      <td className="g-celda-principal">{row.quien}</td>
                      <td>{row.que}</td>
                      <td className={row.alerta ? 'g-accion--alerta' : undefined}>{row.accion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="g-faint">Muestra los dos últimos meses. El registro completo se conserva durante todo el piloto y se descarga con Exportar CSV.</p>
      </div>
    </>
  );
}

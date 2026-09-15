import { useEffect, useState } from 'react';
import { gestorApi, type FamilyDetail, type FamilyRow } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';
import {
  ESTADO_LABEL,
  caregiversLabel,
  estadoFamilia,
  filterRows,
  lastEntryLabel,
  type EstadoFamilia,
} from './familias-estado.ts';
import { Ficha } from './Ficha.tsx';
import { limaToday, shortId } from './tiempo.ts';

/**
 * Screens 10 and 11. The list carries aggregates only and is not audited; opening a family is the
 * audited act, which is why the detail loads on click instead of alongside the list.
 */
export function Familias() {
  const [rows, setRows] = useState<FamilyRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [semana, setSemana] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoFamilia | null>(null);
  const [exporting, setExporting] = useState(false);
  const today = limaToday(new Date());

  useEffect(() => {
    gestorApi.familias()
      .then((response) => setRows(response.familias))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  async function open(row: FamilyRow) {
    setSelected(row.familyId);
    setDetail(null);
    try {
      setDetail(await gestorApi.familia(row.familyId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la ficha');
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await descargarCsv('familias');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  const visible = rows === null ? [] : filterRows(rows, { query, semana, estado });

  return (
    <>
      <Cabecera titulo="Familias" {...(rows !== null ? { subtitulo: `${rows.length} familias; primero las que necesitan atención` } : {})}>
        <input type="search" aria-label="Buscar familia" placeholder="Buscar por nombre" value={query}
               onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Semana" value={semana ?? ''}
                onChange={(event) => setSemana(event.target.value === '' ? null : Number(event.target.value))}>
          <option value="">Todas las semanas</option>
          {Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>Semana {index + 1}</option>)}
        </select>
        <select aria-label="Estado" value={estado ?? ''}
                onChange={(event) => setEstado(event.target.value === '' ? null : (event.target.value as EstadoFamilia))}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoFamilia[]).map((key) => <option key={key} value={key}>{ESTADO_LABEL[key]}</option>)}
        </select>
        <button type="button" className="g-btn g-btn--oscuro" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? 'Generando…' : 'Exportar CSV'}
        </button>
      </Cabecera>

      <div className="g-cuerpo">
        {error !== null && <p className="g-error" role="alert">{error}</p>}
        {rows === null && error === null && <p className="g-faint">Cargando…</p>}
        {rows !== null && (
          <div className="g-split">
            <div className="g-tabla-caja">
              <table className="g-tabla g-tabla--familias">
                <thead>
                  <tr>
                    <th scope="col">Familia</th>
                    <th scope="col">Cuidadores</th>
                    <th scope="col">Semana</th>
                    <th scope="col">Último registro</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={5}>Ninguna familia coincide con el filtro.</td></tr>
                  )}
                  {visible.map((row) => {
                    const status = estadoFamilia(row);
                    return (
                      <tr key={row.familyId} aria-current={selected === row.familyId ? 'true' : undefined}>
                        <td className="g-celda-principal">
                          <button type="button" className="g-fila-boton" onClick={() => void open(row)}>
                            {row.babyName || shortId(row.familyId)}
                          </button>
                        </td>
                        <td>{caregiversLabel(row.caregivers)}</td>
                        <td>{row.finished ? 'Terminó' : row.programWeek}</td>
                        <td>{lastEntryLabel(row.lastEntryDate, today)}</td>
                        <td><span className={`g-estado g-estado--${status}`}>{ESTADO_LABEL[status]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div aria-live="polite">
              {selected === null
                ? <p className="g-faint">Elige una familia para ver su ficha. Abrirla queda registrado.</p>
                : detail === null
                  ? <p className="g-faint">Cargando…</p>
                  : <Ficha detail={detail} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { gestorApi, type FamilyDetail, type FamilyRow } from './api.ts';

const KIND_LABEL: Record<string, string> = {
  lectura: 'Lectura', cancion: 'Canción', juego: 'Juego', conversacion: 'Conversación',
};

export function Familias() {
  const [rows, setRows] = useState<FamilyRow[] | null>(null);
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gestorApi.familias()
      .then((response) => setRows(response.familias))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  if (error !== null) return <p className="banner banner--error">{error}</p>;
  if (rows === null) return <p className="muted">Cargando…</p>;

  return (
    <div className="split">
      <section>
        <h2>Familias ({rows.length})</h2>
        <p className="small muted">
          Ordenadas por atención pendiente: primero las que tienen mensajes sin responder, después
          las que menos actividad registraron.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Bebé</th>
                <th scope="col">Sem.</th>
                <th scope="col">Bitácora 7d</th>
                <th scope="col">Min. 7d</th>
                <th scope="col">Envíos</th>
                <th scope="col">Abiertos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.familyId}>
                  <td>
                    <button
                      type="button"
                      className="row-link"
                      onClick={() => {
                        setDetail(null);
                        void gestorApi.familia(row.familyId).then(setDetail).catch(() => undefined);
                      }}
                    >
                      {row.babyName || row.familyId}
                    </button>
                    {row.status !== 'activa' && <> <span className="pill pill--quiet">{row.status}</span></>}
                  </td>
                  <td className="num">{row.finished ? '—' : row.programWeek}</td>
                  <td className="num">
                    {row.logEntriesLast7Days === 0
                      ? <span className="pill pill--alert">0</span>
                      : row.logEntriesLast7Days}
                  </td>
                  <td className="num">{row.minutesLast7Days}</td>
                  <td className="num">{row.deliveries}</td>
                  <td className="num">
                    {row.openFeedback > 0
                      ? <span className="pill pill--alert">{row.openFeedback}</span>
                      : <span className="pill pill--ok">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-live="polite">
        {detail === null
          ? <p className="muted small">Elige una familia para ver su detalle.</p>
          : <Detalle detail={detail} />}
      </section>
    </div>
  );
}

function Detalle({ detail }: { detail: FamilyDetail }) {
  return (
    <article className="card">
      <h2>{detail.babyName || detail.familyId}</h2>
      <p className="small muted">
        Semana {detail.programWeek} · ingresó el {detail.anchorDate} · {detail.status}
      </p>

      <h3>Adherencia</h3>
      <p className="small">
        <strong>{detail.summary.entries}</strong> registros en total,{' '}
        <strong>{detail.summary.distinctDays}</strong> días distintos,{' '}
        <strong>{detail.summary.totalMinutes}</strong> minutos.
        <br />
        Últimos 7 días: {detail.summaryLast7Days.entries} registros,{' '}
        {detail.summaryLast7Days.totalMinutes} minutos.
      </p>
      <ul className="small">
        {Object.entries(detail.summary.byKind).map(([kind, count]) => (
          <li key={kind}>{KIND_LABEL[kind] ?? kind}: {count}</li>
        ))}
      </ul>

      <h3>Bitácora</h3>
      {!detail.notesVisible && (
        <p className="consent-warning">
          Esta familia no autorizó que el equipo lea el texto de sus notas. Ves las actividades y
          los tiempos, no lo que escribieron.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Actividad</th>
              <th scope="col">Min.</th>
              <th scope="col">Quién</th>
              {detail.notesVisible && <th scope="col">Nota</th>}
            </tr>
          </thead>
          <tbody>
            {detail.entries.length === 0 && (
              <tr><td colSpan={5} className="muted">Sin registros todavía.</td></tr>
            )}
            {[...detail.entries].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) => (
              <tr key={`${entry.date}-${index}`}>
                <td>{entry.date}</td>
                <td>{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                <td className="num">{entry.minutes}</td>
                <td>{entry.loggedBy}</td>
                {detail.notesVisible && <td>{entry.note ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Cuidadores</h3>
      <ul className="small">
        {detail.caregivers.map((caregiver) => (
          <li key={caregiver.msisdn}>
            {caregiver.msisdn} · {caregiver.role} ·{' '}
            {caregiver.optIn ? 'recibe mensajes' : <strong>dado de baja</strong>}
          </li>
        ))}
      </ul>
    </article>
  );
}

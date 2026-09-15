import type { FamilyDetail } from './api.ts';
import { fechaLarga, shortId } from './tiempo.ts';

const KIND: Record<string, string> = { lectura: 'Lectura', cancion: 'Canción', juego: 'Juego', conversacion: 'Conversación' };
const ROLE: Record<string, string> = { principal: 'Principal', secundario: 'Secundario' };
const RELATION: Record<string, string> = { mama: 'mamá', papa: 'papá', otra: 'otra persona' };
const STATUS: Record<string, string> = { activa: 'Activa', baja: 'De baja', suprimida: 'Suprimida' };

type Entry = FamilyDetail['entries'][number];

/** Who did it, as the family said; failing that, whose phone logged it. */
function who(entry: Entry): string {
  if (entry.declaredBy !== null) {
    const relation = RELATION[entry.declaredBy] ?? entry.declaredBy;
    return relation.charAt(0).toUpperCase() + relation.slice(1);
  }
  return ROLE[entry.loggedBy] ?? entry.loggedBy;
}

/**
 * Screen 11. Opening it is audited on the server. Notes are filtered on read (rule 8): without consent
 * the manager sees only how many exist, never what they say.
 */
export function Ficha({ detail }: { detail: FamilyDetail }) {
  const newestFirst = [...detail.entries].sort((a, b) => b.date.localeCompare(a.date));
  const recent = newestFirst.slice(0, 8);
  const withNotes = newestFirst.filter((entry) => entry.note !== null && entry.note !== '').slice(0, 5);

  return (
    <article className="g-ficha">
      <header className="g-ficha__cabecera">
        <div>
          <h2>{detail.babyName || 'Sin nombre registrado'}</h2>
          <p className="g-faint">Semana {detail.programWeek} del programa · ingresó el {fechaLarga(detail.anchorDate)}</p>
        </div>
        <span className="g-faint">{shortId(detail.familyId)}</span>
      </header>

      <div className="g-ficha__cuerpo">
        <dl className="g-tarjeta g-datos">
          <div><dt>Bebé</dt><dd>{detail.babyName || '—'}</dd></div>
          <div><dt>Estado</dt><dd>{STATUS[detail.status] ?? detail.status}</dd></div>
          <div>
            <dt>Cuidadores</dt>
            <dd>
              {detail.caregivers
                .map((c) => `${ROLE[c.role] ?? c.role}${c.relation !== null ? ` (${RELATION[c.relation] ?? c.relation})` : ''}${c.optIn ? '' : ', dado de baja'}`)
                .join(' · ')}
            </dd>
          </div>
          <div>
            <dt>Registros</dt>
            <dd>
              {detail.summary.entries} en {detail.summary.distinctDays} {detail.summary.distinctDays === 1 ? 'día' : 'días'}
              {detail.summary.entriesWithMinutes > 0 && ` · ${detail.summary.totalMinutes} min reportados`}
            </dd>
          </div>
        </dl>

        <section className="g-tarjeta">
          <h3 className="g-tarjeta__titulo">Registros recientes</h3>
          {recent.length === 0 ? (
            <p className="g-faint">Sin registros todavía.</p>
          ) : (
            <ul className="g-lista-simple">
              {recent.map((entry, index) => (
                <li key={`${entry.date}-${index}`}>
                  <span>{fechaLarga(entry.date)} · {KIND[entry.kind] ?? entry.kind}</span>
                  <span className="g-faint">{who(entry)}{entry.minutes !== null && `, ${entry.minutes} min`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="g-tarjeta">
          <div className="g-tarjeta__cabecera">
            <h3 className="g-tarjeta__titulo">Notas de la familia</h3>
            <span className={detail.notesVisible ? 'g-pill g-pill--ok' : 'g-pill g-pill--alerta'}>
              {detail.notesVisible ? 'Consentimiento activo' : 'Sin consentimiento'}
            </span>
          </div>
          {detail.notesVisible ? (
            <>
              {withNotes.length === 0 ? (
                <p className="g-faint">Todavía no escribió notas.</p>
              ) : (
                <div className="g-notas">
                  {withNotes.map((entry, index) => (
                    <p key={index}>“{entry.note}” — {who(entry)}, {fechaLarga(entry.date)}</p>
                  ))}
                </div>
              )}
              <p className="g-faint">La familia puede revocar este permiso en cualquier momento; las notas dejarían de mostrarse aquí.</p>
            </>
          ) : (
            <>
              <div className="g-sin-consentimiento">
                <span className="g-guion" aria-hidden="true">—</span>
                <p>
                  {detail.notesCount === 0
                    ? 'Esta familia no autorizó que el equipo lea sus notas. Si escribe alguna, no se mostrará ni se exportará.'
                    : `Esta familia escribió ${detail.notesCount} ${detail.notesCount === 1 ? 'nota' : 'notas'} y no autorizó que el equipo las lea. No se muestran ni se exportan.`}
                </p>
              </div>
              <p className="g-faint">Solo la familia puede cambiarlo, desde su pantalla de privacidad.</p>
            </>
          )}
        </section>
      </div>
    </article>
  );
}

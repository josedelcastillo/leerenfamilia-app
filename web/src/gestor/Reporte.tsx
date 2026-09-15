import { useEffect, useState } from 'react';
import { gestorApi, type Dashboard } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { Participacion } from './Participacion.tsx';
import {
  PRIVACY_FOOTER,
  mailtoHref,
  observationLines,
  reportPlainText,
  reportSummary,
} from './reporte.ts';
import { fechaLarga, limaToday, rangoSemana } from './tiempo.ts';

/**
 * Screen 12. Built in the browser from the dashboard aggregates (D-026): PDF through the print
 * stylesheet, e-mail through mailto:, text through the clipboard. No new AWS resource. The field
 * observations live only in this page until it is printed or copied.
 */
export function Reporte() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const generated = new Date();

  useEffect(() => {
    gestorApi.tablero().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  async function copy() {
    if (data === null) return;
    setCopyError(null);
    try {
      if (!navigator.clipboard) throw new Error('Sin portapapeles');
      await navigator.clipboard.writeText(reportPlainText(data, observaciones, generated));
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError('No se pudo copiar. Seleccione el texto del reporte y cópielo a mano.');
    }
  }

  return (
    <>
      <Cabecera titulo="Reporte semanal" />
      {error !== null && <div className="g-cuerpo"><p className="g-error" role="alert">{error}</p></div>}
      {data === null && error === null && <div className="g-cuerpo"><p className="g-faint">Cargando…</p></div>}
      {data !== null && (
        <div className="g-reporte">
          <article className="g-hoja">
            <header className="g-hoja__cabecera">
              <div>
                <h1>Reporte semanal de implementación</h1>
                <p className="g-hoja__sub">
                  Nacidos para Leer Perú, semana {data.semanaPiloto} de {data.programWeeks} — {rangoSemana(data.corte)}
                </p>
              </div>
              <p className="g-hoja__org">Leer en Familia<br />Hospital piloto</p>
            </header>

            <section>
              <h2>Resumen de la semana</h2>
              <p className="g-prosa">{reportSummary(data)}</p>
            </section>

            <dl className="g-tira">
              <div><dt>Familias activas</dt><dd>{data.activasEstaSemana}</dd></div>
              <div><dt>Lecturas registradas</dt><dd>{data.registrosSemana}</dd></div>
              <div><dt>Kits entregados</dt><dd>—</dd></div>
              <div><dt>Ambos cuidadores</dt><dd>{data.ambosCuidadores}</dd></div>
            </dl>
            <p className="g-faint">Lecturas: registros de los últimos 7 días. Kits: el hospital todavía no registra las entregas en la plataforma.</p>

            <section>
              <h2>Participación acumulada</h2>
              <Participacion data={data} hoja />
            </section>

            <section>
              <h2>Observaciones de campo</h2>
              <label className="visually-hidden" htmlFor="observaciones">Observaciones de campo</label>
              <textarea id="observaciones" className="g-observaciones no-imprimir" value={observaciones}
                        placeholder="Lo que el equipo observó esta semana. Una idea por línea."
                        onChange={(event) => setObservaciones(event.target.value)} />
              <ul className="g-lista-obs solo-impresion">
                {observationLines(observaciones).map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </section>

            <footer className="g-hoja__pie">
              Generado el {fechaLarga(limaToday(generated))}. {PRIVACY_FOOTER}
            </footer>
          </article>

          <aside className="g-reporte__acciones no-imprimir">
            <section className="g-tarjeta">
              <h2 className="g-tarjeta__titulo">Exportar</h2>
              <button type="button" className="g-btn g-btn--primario" onClick={() => window.print()}>Descargar PDF</button>
              <a className="g-btn" href={mailtoHref(`Reporte semanal — semana ${data.semanaPiloto}`, reportPlainText(data, observaciones, generated))}>
                Enviar por correo al hospital
              </a>
              <button type="button" className="g-btn" onClick={() => void copy()}>Copiar resumen como texto</button>
              {copied && <p className="g-aviso-ok" role="status">Copiado.</p>}
              {copyError !== null && <p className="g-error" role="alert">{copyError}</p>}
            </section>
            <section className="g-tarjeta">
              <h2 className="g-tarjeta__titulo">Qué incluye</h2>
              <ul className="g-incluye">
                <li className="is-incluido">Indicadores operativos</li>
                <li className="is-incluido">Participación por semana</li>
                <li className="is-incluido">Observaciones del equipo</li>
                <li>Notas de familias, solo con consentimiento</li>
              </ul>
            </section>
            <p className="g-aviso">
              Este reporte se arma con los datos al momento de abrirlo. Las observaciones no se guardan: se incluyen
              al descargar, enviar o copiar.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

import { useEffect, useState, type CSSProperties } from 'react';
import { gestorApi, type Dashboard } from './api.ts';
import { Cabecera } from './Cabecera.tsx';
import { Participacion } from './Participacion.tsx';

function Indicador({ etiqueta, cifra, nota, destacado = false }: {
  etiqueta: string; cifra: number | null; nota: string; destacado?: boolean;
}) {
  return (
    <div className={destacado ? 'g-indicador g-indicador--destacado' : 'g-indicador'}>
      <span className="g-indicador__etiqueta">{etiqueta}</span>
      {cifra !== null && <span className="g-cifra">{cifra}</span>}
      <span className="g-indicador__nota">{nota}</span>
    </div>
  );
}

/**
 * Screen 9. Only what the platform knows (D-026). Outreach and kit delivery are not in the data model,
 * so those two cards say what is missing instead of showing a number nobody measured.
 */
export function Tablero({ onGoTo }: { onGoTo: (view: 'familias' | 'bandeja' | 'reporte') => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gestorApi.tablero().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error'));
  }, []);

  return (
    <>
      <Cabecera titulo="Tablero del piloto">
        <button type="button" className="g-btn g-btn--primario" onClick={() => onGoTo('reporte')}>Generar reporte</button>
      </Cabecera>
      <div className="g-cuerpo">
        {error !== null && <p className="g-error">{error}</p>}
        {data === null && error === null && <p className="g-faint">Cargando…</p>}
        {data !== null && (
          <>
            <div className="g-indicadores">
              <Indicador etiqueta="Sensibilizadas" cifra={null}
                         nota="Aparecerá cuando el hospital registre a las familias sensibilizadas en consulta." />
              <Indicador etiqueta="Registradas en la PWA" cifra={data.registradas} nota="familias inscritas en el piloto" />
              <Indicador etiqueta="Activas esta semana" cifra={data.activasEstaSemana}
                         nota="al menos un registro en 7 días" destacado />
              <Indicador etiqueta="Kits entregados" cifra={null}
                         nota="Aparecerá cuando el hospital registre las entregas de kit." />
            </div>

            <section className="g-tarjeta">
              <div className="g-tarjeta__cabecera">
                <h2 className="g-tarjeta__titulo">Participación por semana</h2>
                <span className="g-faint">familias con al menos un registro</span>
              </div>
              {data.semanaPiloto === 0
                ? <p className="g-faint">La participación aparece cuando las familias empiecen su primera semana.</p>
                : <Participacion data={data} />}
            </section>

            <div className="g-dos">
              <section className="g-tarjeta">
                <h2 className="g-tarjeta__titulo">Requiere acción del equipo</h2>
                {data.mensajesSinResponder === 0 && data.sinRegistros7Dias === 0 ? (
                  <p className="g-faint">Nada pendiente.</p>
                ) : (
                  <ul className="g-acciones">
                    {data.mensajesSinResponder > 0 && (
                      <li>
                        <span>{data.mensajesSinResponder} {data.mensajesSinResponder === 1 ? 'comentario' : 'comentarios'} sin responder en la bandeja</span>
                        <button type="button" className="g-enlace" onClick={() => onGoTo('bandeja')}>Abrir</button>
                      </li>
                    )}
                    {data.sinRegistros7Dias > 0 && (
                      <li>
                        <span>{data.sinRegistros7Dias} {data.sinRegistros7Dias === 1 ? 'familia' : 'familias'} sin registros en 7 días</span>
                        <button type="button" className="g-enlace" onClick={() => onGoTo('familias')}>Ver lista</button>
                      </li>
                    )}
                  </ul>
                )}
              </section>
              <section className="g-tarjeta">
                <h2 className="g-tarjeta__titulo">Consentimiento de notas</h2>
                <div className="g-cifra-fila">
                  <span className="g-cifra">{data.consentimientoNotas.autorizan}</span>
                  <span className="g-faint">de {data.consentimientoNotas.de} familias autorizan que el equipo lea sus notas</span>
                </div>
                <div className="g-progreso" aria-hidden="true"
                     style={{ '--valor': `${data.consentimientoNotas.de === 0 ? 0 : Math.round((data.consentimientoNotas.autorizan / data.consentimientoNotas.de) * 100)}%` } as CSSProperties}>
                  <span />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

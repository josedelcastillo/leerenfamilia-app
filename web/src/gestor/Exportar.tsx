import { useState } from 'react';
import { Cabecera } from './Cabecera.tsx';
import { descargarCsv } from './descargar.ts';

const DATASETS = [
  { id: 'resumen', label: 'Resumen de indicadores', hint: 'Una fila por indicador, con su definición al lado' },
  { id: 'familias', label: 'Familias', hint: 'Una fila por familia: adherencia, envíos, feedback' },
  { id: 'bitacora', label: 'Bitácora', hint: 'Una fila por entrada. El archivo granular del análisis' },
  { id: 'envios', label: 'Envíos', hint: 'Alcance semanal y categoría de precio de Meta' },
  { id: 'feedback', label: 'Feedback', hint: 'Mensajes de las familias y tiempos de respuesta' },
  { id: 'auditoria', label: 'Auditoría de accesos', hint: 'Quién abrió qué y cuándo' },
] as const;

export function Exportar() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(dataset: string) {
    setBusy(dataset);
    setError(null);
    try {
      await descargarCsv(dataset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Cabecera titulo="Exportar datos" />
      <div className="g-cuerpo">
        <p className="g-intro">
          Archivos CSV para el análisis del piloto. Van seudonimizados —sin teléfonos ni nombres— pero siguen siendo
          datos personales: guárdalos con el mismo cuidado que la plataforma. Cada exportación queda registrada con tu
          usuario, y el texto de las notas solo se incluye para las familias que lo autorizaron.
        </p>
        <div className="g-tabla-caja">
          <table className="g-tabla">
            <thead>
              <tr><th scope="col">Archivo</th><th scope="col">Contenido</th><th scope="col"><span className="visually-hidden">Descargar</span></th></tr>
            </thead>
            <tbody>
              {DATASETS.map((dataset) => (
                <tr key={dataset.id}>
                  <td className="g-celda-principal">{dataset.label}</td>
                  <td>{dataset.hint}</td>
                  <td>
                    <button type="button" className="g-btn g-btn--chico" disabled={busy !== null} onClick={() => void download(dataset.id)}>
                      {busy === dataset.id ? 'Generando…' : 'Descargar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error !== null && <p className="g-error" role="alert">{error}</p>}
      </div>
    </>
  );
}

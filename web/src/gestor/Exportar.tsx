import { useState } from 'react';
import { currentIdToken } from './auth.ts';

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
      const token = await currentIdToken();
      if (token === null) throw new Error('Sesión expirada');

      const response = await fetch(`/api/gestor/export/${dataset}.csv`, {
        headers: { authorization: token },
      });
      if (!response.ok) throw new Error(`Error ${response.status}`);

      // Fetched with the token rather than linked directly: an <a href> cannot carry the header.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nplp-${dataset}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2>Exportar</h2>
      <p className="small muted">
        Archivos CSV para el análisis del piloto. Van seudonimizados —sin teléfonos ni nombres— pero
        siguen siendo datos personales: guárdalos con el mismo cuidado que la plataforma.
      </p>
      <p className="consent-warning">
        Cada exportación queda registrada con tu usuario. El texto de las notas solo se incluye para
        las familias que lo autorizaron.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Archivo</th>
              <th scope="col">Contenido</th>
              <th scope="col"><span className="visually-hidden">Descargar</span></th>
            </tr>
          </thead>
          <tbody>
            {DATASETS.map((dataset) => (
              <tr key={dataset.id}>
                <td><strong>{dataset.label}</strong></td>
                <td className="small muted">{dataset.hint}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null}
                    onClick={() => void download(dataset.id)}
                  >
                    {busy === dataset.id ? 'Generando…' : 'Descargar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error !== null && <p className="banner banner--error">{error}</p>}
    </section>
  );
}

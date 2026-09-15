import { currentIdToken } from './auth.ts';

/**
 * Fetched with the token rather than linked: an <a href> cannot carry the header. Every export is
 * audited on the server (encargo §8).
 */
export async function descargarCsv(dataset: string): Promise<void> {
  const token = await currentIdToken();
  if (token === null) throw new Error('Sesión expirada');
  const response = await fetch(`/api/gestor/export/${dataset}.csv`, { headers: { authorization: token } });
  if (!response.ok) throw new Error(`Error ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `nplp-${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari can cancel the download if the object URL is revoked before it has started reading it;
  // deferring to the next tick lets the click's navigation begin first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

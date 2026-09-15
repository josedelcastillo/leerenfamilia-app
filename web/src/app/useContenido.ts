import { useEffect, useState } from 'react';
import { api, type ContentResponse } from '../shared/api.ts';

export type ContenidoState =
  | { readonly status: 'cargando' }
  | { readonly status: 'listo'; readonly content: ContentResponse }
  /** Offline with nothing cached yet. The screens still let the family log. */
  | { readonly status: 'sin_datos' };

export function useContenido(): ContenidoState {
  const [state, setState] = useState<ContenidoState>({ status: 'cargando' });

  useEffect(() => {
    let alive = true;
    api
      .getContent()
      .then((content) => alive && setState({ status: 'listo', content }))
      .catch(() => alive && setState({ status: 'sin_datos' }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

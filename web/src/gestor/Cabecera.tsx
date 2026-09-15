import type { ReactNode } from 'react';

/** The 60px header every manager view starts with: a title, and its actions on the right. */
export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <header className="g-cabecera">
      <div>
        <h1>{titulo}</h1>
        {subtitulo !== undefined && <p className="g-faint">{subtitulo}</p>}
      </div>
      {children !== undefined && <div className="g-cabecera__acciones">{children}</div>}
    </header>
  );
}

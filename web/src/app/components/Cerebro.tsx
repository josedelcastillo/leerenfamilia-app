import { useEffect, useRef, useState } from 'react';
import {
  ZONE_KINDS,
  ZONE_LABEL,
  brainDescription,
  nodeAt,
  parentOf,
  type BrainState,
} from './cerebro.ts';

/**
 * Inline SVG rather than an image or a chart library: it costs no dependency, stays crisp at any
 * density, animates with plain CSS, inherits the app's colour tokens, and is a few kilobytes the
 * service worker precaches — so it still draws with no signal, which is when it is most used.
 */
export function Cerebro({ state }: { state: BrainState }) {
  const previous = useRef<number | null>(null);
  const [growing, setGrowing] = useState(false);
  const total = state.branches.length;

  useEffect(() => {
    // Only celebrate an actual increase, and never on first render: arriving at the screen is not
    // an achievement.
    if (previous.current !== null && total > previous.current) {
      setGrowing(true);
      const timer = setTimeout(() => setGrowing(false), 1600);
      previous.current = total;
      return () => clearTimeout(timer);
    }
    previous.current = total;
    return undefined;
  }, [total]);

  return (
    <figure className={`cerebro${growing ? ' cerebro--creciendo' : ''}`}>
      <svg viewBox="8 10 180 142" role="img" aria-label={brainDescription(state)}>
        <g className="cerebro__silueta" aria-hidden="true">
          {/* Two hemispheres with a stem below: the stem is the single cue that stops the shape
              reading as a cloud. */}
          <path d="M98 24c-9-7-23-8-33-2-9 6-13 15-11 24-9 3-15 11-15 20 0 8 4 15 11 19-3 9-1 18 7 24 8 6 19 6 27 1 4 6 9 9 14 9V24Z" />
          <path d="M98 24c9-7 23-8 33-2 9 6 13 15 11 24 9 3 15 11 15 20 0 8-4 15-11 19 3 9 1 18-7 24-8 6-19 6-27 1-4 6-9 9-14 9V24Z" />
          {/* The stem. Filled rather than stroked, or it reads as a hollow tube. */}
          <path className="cerebro__tallo" d="M91 116c0 12 1 20 2 26h10c1-6 2-14 2-26Z" />
          <path className="cerebro__surco" d="M72 40c11 3 16 11 13 19s-13 11-19 7" />
          <path className="cerebro__surco" d="M124 40c-11 3-16 11-13 19s13 11 19 7" />
          <path className="cerebro__surco" d="M64 82c13 1 20 8 19 17s-10 14-19 12" />
          <path className="cerebro__surco" d="M132 82c-13 1-20 8-19 17s10 14 19 12" />
        </g>

        <g className="cerebro__red">
          {state.branches.map((branch) => {
            const node = nodeAt(branch.index);
            const from = parentOf(branch.index);
            const isNewest = branch.index === total - 1;
            return (
              <g
                key={branch.index}
                className={`cerebro__rama cerebro__rama--${branch.kind}${isNewest ? ' is-newest' : ''}`}
                style={{ ['--orden' as string]: String(branch.index) }}
              >
                <line x1={from.x} y1={from.y} x2={node.x} y2={node.y} />
                <circle cx={node.x} cy={node.y} r="2.4" />
              </g>
            );
          })}
        </g>
      </svg>

      <figcaption>
        {total === 0 ? (
          <p className="small muted">
            Cada día que pases un rato con tu bebé enciende una conexión nueva. Empieza cuando quieras.
          </p>
        ) : (
          <>
            <p className="cerebro__cifra">
              <strong>{state.distinctDays}</strong>{' '}
              {state.distinctDays === 1 ? 'día de encuentros' : 'días de encuentros'}
              {' · '}
              <strong>{total}</strong> {total === 1 ? 'conexión' : 'conexiones'}
            </p>
            <ul className="cerebro__leyenda">
              {ZONE_KINDS.map((kind) => (
                <li key={kind} className={`cerebro__rama--${kind}`}>
                  <span className="cerebro__punto" aria-hidden="true" />
                  {ZONE_LABEL[kind]}: {state.byKind[kind]}
                </li>
              ))}
            </ul>
          </>
        )}
      </figcaption>
    </figure>
  );
}

import { useRef, useState, type CSSProperties } from 'react';
import { formatClock } from '../formato.ts';

/**
 * A plain <audio> with the design's controls: a 56px coral button, a 6px bar and the two times.
 * No library. The service worker caches /assets/ audio (CacheFirst), so a song heard once plays
 * again with no signal.
 */
export function Reproductor({ src, titulo }: { src: string; titulo: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  function toggle() {
    const element = audio.current;
    if (element === null) return;
    if (element.paused) void element.play();
    else element.pause();
  }

  return (
    <div className="reproductor">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
      <button
        type="button"
        className="reproductor__boton"
        onClick={toggle}
        aria-label={playing ? `Pausar ${titulo}` : `Escuchar ${titulo}`}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>
      <div className="reproductor__pista">
        <div
          className="reproductor__barra"
          role="progressbar"
          aria-label="Avance"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          style={{ '--avance': `${progress}%` } as CSSProperties}
        >
          <span />
        </div>
        <div className="reproductor__tiempos">
          <span>{formatClock(time)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>
    </div>
  );
}

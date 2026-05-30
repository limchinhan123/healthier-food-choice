import { useEffect, useRef, useState } from 'react';
import { createHealthFoodChoiceGame } from './game/createHealthFoodChoiceGame';

type SpeedMode = 'practice' | 'cozy' | 'adventure';
type PlayerMode = 'pair' | 'rae' | 'cousin';

const speedLabels: Record<SpeedMode, string> = {
  practice: 'Practice',
  cozy: 'Cozy',
  adventure: 'Adventure',
};

const playerLabels: Record<PlayerMode, string> = {
  pair: 'Rae + Zoe',
  rae: 'Rae',
  cousin: 'Zoe',
};

export function App() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speedMode, setSpeedMode] = useState<SpeedMode>('cozy');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('pair');

  useEffect(() => {
    if (!gameHostRef.current) return;
    const game = createHealthFoodChoiceGame(gameHostRef.current);
    const pausedHandler = (event: Event) => {
      setIsPaused(Boolean((event as CustomEvent<{ paused: boolean }>).detail.paused));
    };

    window.addEventListener('hfcg:pause-state', pausedHandler);
    return () => {
      window.removeEventListener('hfcg:pause-state', pausedHandler);
      game.destroy(true);
    };
  }, []);

  const send = (name: string, detail?: unknown) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const setSpeed = (mode: SpeedMode) => {
    setSpeedMode(mode);
    send('hfcg:set-speed', { mode });
  };

  const setPlayers = (mode: PlayerMode) => {
    setPlayerMode(mode);
    setIsPaused(false);
    send('hfcg:set-player-mode', { mode });
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    send('hfcg:set-muted', { muted: next });
  };

  const requestMobileFullscreen = () => {
    const isTouchLandscape = window.matchMedia('(orientation: landscape)').matches
      && (navigator.maxTouchPoints > 0 || window.innerHeight <= 540);
    if (!isTouchLandscape || document.fullscreenElement) return;

    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    void request?.call(root)?.catch?.(() => undefined);
  };

  return (
    <main className="app-shell">
      <section
        className="game-stage"
        aria-label="Health Food Choice Game"
        onPointerDown={requestMobileFullscreen}
      >
        <div ref={gameHostRef} className="game-host" />
        <div className="portrait-hint" aria-hidden="true">
          <strong>Turn sideways</strong>
          <span>Landscape works best for little thumbs.</span>
        </div>
        <aside className="parent-panel" aria-label="Parent controls">
          <button
            className="panel-button"
            type="button"
            onClick={(event) => {
              send('hfcg:toggle-pause');
              event.currentTarget.blur();
            }}
          >
            {isPaused ? 'Resume' : 'Pause'} <span>P</span>
          </button>

          <label className="panel-control player-control">
            <span>Players</span>
            <select
              value={playerMode}
              onChange={(event) => {
                setPlayers(event.target.value as PlayerMode);
                event.currentTarget.blur();
              }}
            >
              {Object.keys(playerLabels).map((mode) => (
                <option key={mode} value={mode}>
                  {playerLabels[mode as PlayerMode]}
                </option>
              ))}
            </select>
          </label>

          <label className="panel-control speed-control">
            <span>Speed</span>
            <select
              value={speedMode}
              onChange={(event) => {
                setSpeed(event.target.value as SpeedMode);
                event.currentTarget.blur();
              }}
            >
              {Object.keys(speedLabels).map((mode) => (
                <option key={mode} value={mode}>
                  {speedLabels[mode as SpeedMode]}
                </option>
              ))}
            </select>
          </label>

          <button
            className="panel-button reset-button"
            type="button"
            onClick={(event) => {
              send('hfcg:reset-run');
              event.currentTarget.blur();
            }}
          >
            Stop & Reset
          </button>

          <button
            className="panel-button"
            type="button"
            onClick={(event) => {
              toggleMute();
              event.currentTarget.blur();
            }}
          >
            {isMuted ? 'Sound On' : 'Mute'}
          </button>
        </aside>
      </section>
    </main>
  );
}

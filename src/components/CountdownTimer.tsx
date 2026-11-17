import { useEffect, useState } from 'react';
import { formatTimer } from '../core/format';
import { useStore } from '../store/store';

/** Round countdown. When it hits zero it flashes red/white until it's clicked. */
export function CountdownTimer() {
  const endsAt = useStore((s) => s.roundEndsAt);
  const clear = useStore((s) => s.clearRoundTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt === null ? null : Math.max(0, (endsAt - now) / 1000);
  const timedOut = remaining === 0;
  const flashRed = timedOut && Math.floor(now / 500) % 2 === 0;

  return (
    <button
      className="timer-button"
      style={{ color: flashRed ? '#ff3b3b' : undefined }}
      onClick={() => timedOut && clear()}
      title={timedOut ? 'Click to dismiss' : undefined}
    >
      {remaining === null ? '--:--:--' : formatTimer(remaining)}
    </button>
  );
}

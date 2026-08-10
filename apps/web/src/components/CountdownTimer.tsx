import { useEffect, useState } from "react";

function format(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Purely cosmetic — the server is the only source of truth for expiry (see the Cotur Cidade sweep).
 * This just ticks down visually from `expiresAt`; nothing here decides anything.
 */
export function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = new Date(expiresAt).getTime() - now;
  return <div className="timer">{format(remaining)}</div>;
}

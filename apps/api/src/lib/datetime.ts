/** Combines a "YYYY-MM-DD" date and "HH:mm" time (interpreted in server-local time) into a Date. */
export function parseDateTime(data: string, horario: string): Date | null {
  const dt = new Date(`${data}T${horario}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** True when the given date/time is now or in the future — used to reject backdated ride requests. */
export function isFutureOrNow(data: string, horario: string): boolean {
  const dt = parseDateTime(data, horario);
  if (!dt) return false;
  return dt.getTime() >= Date.now();
}

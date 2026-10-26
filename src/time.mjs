// Time helpers. Facts carry UTC instants; the page prints US Central.

const CENTRAL = 'America/Chicago';

/** An ISO instant, or null when the input is not a date. */
export function instant(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const hoursBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 3_600_000;

/** "Sat Oct 24, 7:00 a.m. CDT" */
export function central(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CENTRAL,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const ampm = parts.dayPeriod === 'AM' ? 'a.m.' : 'p.m.';
  return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ${ampm} ${parts.timeZoneName}`;
}

/** The weekday in Chicago, "Mon".."Sun". */
export function centralWeekday(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, weekday: 'short' }).format(new Date(iso));
}

/** "3 h", "2 d 4 h", "20 min" */
export function age(hours) {
  if (hours < 0) hours = 0;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

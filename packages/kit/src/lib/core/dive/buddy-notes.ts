/** Buddy notes and the requests to sign a dive: how the pages word and pair them. */

const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The calendar day of an ISO date-time as written ("27 October"), with the year when it is not
 * `now`'s. The day is read from the string itself, so the server and the browser agree.
 */
export function signedOn(iso: string, now: Date = new Date()): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(iso)?.[0];
  if (!day) return iso;
  const date = new Date(`${day}T12:00:00Z`);
  const format = date.getUTCFullYear() === now.getFullYear() ? dayMonth : dayMonthYear;
  return format.format(date);
}

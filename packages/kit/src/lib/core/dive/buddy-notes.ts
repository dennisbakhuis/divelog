/** Buddy notes and the requests to sign a dive: how the pages word and pair them. */
import type {
  BuddyNote,
  PersonPrivate,
  SignRequest,
  SignRequestState,
  SignRequestsOut,
  SignSkipReason,
} from './types.js';

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
  const day = typeof iso === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(iso)?.[0] : undefined;
  if (!day) return String(iso ?? '');
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const format = date.getUTCFullYear() === now.getFullYear() ? dayMonth : dayMonthYear;
  return format.format(date);
}

/** One buddy of the dive in the editor: the person, the note and where the request stands. */
export type BuddyRow = {
  /** Person id, as the dive's `people_ids` hold it. */
  id: string;
  /** Person slug, as notes and sign requests name the buddy. */
  slug: string;
  name: string;
  email: string | null;
  note: BuddyNote | null;
  request: SignRequest | null;
  state: SignRequestState;
};

type BuddyPerson = Pick<PersonPrivate, 'id' | 'slug' | 'first_name' | 'email'>;

/**
 * The dive's buddies in `people_ids` order, each with its note and sign request. People ids
 * and slugs differ, and the API names notes and requests by slug, so they pair by the person
 * record. A note means signed whatever the request says; a request that says signed without
 * a note (deleted since) stands as expired once mailed, else as never asked.
 */
export function buddyRows(
  peopleIds: readonly string[],
  people: readonly BuddyPerson[],
  notes: readonly BuddyNote[],
  requests: readonly SignRequest[],
): BuddyRow[] {
  return peopleIds.flatMap((id) => {
    const person = people.find((p) => p.id === id);
    if (!person) return [];
    const note = notes.find((n) => n.person === person.slug) ?? null;
    const request = requests.find((r) => r.person === person.slug) ?? null;
    const unasked: SignRequestState = person.email ? 'none' : 'no_email';
    let state: SignRequestState = request?.state ?? unasked;
    if (note) state = 'signed';
    else if (state === 'signed') state = request?.sent_at ? 'expired' : unasked;
    return [
      {
        id: person.id,
        slug: person.slug,
        name: person.first_name,
        email: person.email,
        note,
        request,
        state,
      },
    ];
  });
}

/** "Kim", "Kim and Alex", "Kim, Alex and Robin". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const ASKED: readonly SignSkipReason[] = ['open', 'expired'];

/**
 * What the form says after asking the buddies to sign: whom it mailed ("Sent to Kim"), whom
 * not and why ("Alex was already asked"), or "Nobody new to ask".
 */
export function signRequestsMessage(
  result: Pick<SignRequestsOut, 'sent' | 'skipped'>,
  nameOf: (slug: string) => string,
): { kind: 'success' | 'info'; message: string } {
  const names = (reasons: readonly SignSkipReason[]) =>
    result.skipped.filter((s) => reasons.includes(s.reason)).map((s) => nameOf(s.person));
  const verb = (list: string[], one: string, many: string) =>
    `${listNames(list)} ${list.length === 1 ? one : many}`;
  const asked = names(ASKED);
  const signed = names(['signed']);
  const noEmail = names(['no_email']);
  const parts = [
    result.sent.length ? `Sent to ${listNames(result.sent.map(nameOf))}` : 'Nobody new to ask',
  ];
  if (asked.length) parts.push(verb(asked, 'was already asked', 'were already asked'));
  if (signed.length) parts.push(`${listNames(signed)} signed already`);
  if (noEmail.length) parts.push(verb(noEmail, 'has no e-mail address', 'have no e-mail address'));
  return { kind: result.sent.length ? 'success' : 'info', message: parts.join('; ') };
}

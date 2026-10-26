import { formatDistanceStrict } from 'date-fns';

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const LONG_DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "1 Oct 2026" */
export const formatDate = (iso: string) => DATE.format(new Date(iso));

/** "27 Oct 2026, 3:00 pm" */
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

/** "Tuesday, 27 October 2026" */
export const formatLongDate = (date: Date) => LONG_DATE.format(date);

/** "2026-10-27" in the viewer's own time zone (toISOString would give the UTC date) */
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "2 hours ago" / "in 22 hours" */
export const relativeTime = (iso: string, now: number = Date.now()) =>
  formatDistanceStrict(new Date(iso), now, { addSuffix: true });

/** "8 hours" */
export const durationSince = (iso: string, now: number = Date.now()) => formatDistanceStrict(new Date(iso), now);

export const isPast = (iso: string, now: number = Date.now()) => new Date(iso).getTime() <= now;

export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "priya.nair@banksphere.local" -> "Priya"; empty when the address has no usable name */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._+-]/).find((part) => /[a-z]/i.test(part)) ?? '';
  const letters = first.replace(/[^a-z]/gi, '');
  return letters ? letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() : '';
}

/** List endpoints cap a page at `limit` and return no totals: a full page means "at least this many" */
export const countLabel = (count: number, limit: number) => (count >= limit ? `${limit}+` : String(count));

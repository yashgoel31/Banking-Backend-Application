import { differenceInMinutes, formatDistanceStrict } from 'date-fns';
import { humanize } from '@/components/ui/primitives';

/** First 8 characters of a UUID: enough to tell people apart in a list, the full id is in the title/copy */
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');

/** "+919876543210" -> "+91 ••••• 3210" (staff tables show only what they need to match a caller) */
export function maskPhone(phone: string): string {
  const compact = phone.replace(/[\s-]/g, '');
  if (compact.length <= 4) return compact;
  const prefix = compact.startsWith('+') ? `${compact.slice(0, 3)} ` : '';
  return `${prefix}••••• ${compact.slice(-4)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
/** Dates of birth are calendar dates stored at UTC midnight: format them in UTC so they never shift a day */
const calendarFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

const toDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (iso: string | null | undefined) => {
  const date = toDate(iso);
  return date ? dateTimeFormatter.format(date) : '—';
};

export const formatDate = (iso: string | null | undefined) => {
  const date = toDate(iso);
  return date ? dateFormatter.format(date) : '—';
};

export const formatCalendarDate = (iso: string | null | undefined) => {
  const date = toDate(iso);
  return date ? calendarFormatter.format(date) : '—';
};

export type WaitTone = 'neutral' | 'warning' | 'danger';

/** How long a profile has been waiting for review, with a tone that escalates after one and three days */
export function waitingTime(iso: string, now: number = Date.now()): { label: string; tone: WaitTone } {
  const since = toDate(iso);
  if (!since) return { label: '—', tone: 'neutral' };
  const minutes = Math.max(0, differenceInMinutes(now, since));
  const label = minutes < 1 ? 'Just now' : formatDistanceStrict(since, now, { roundingMethod: 'floor' });
  const tone: WaitTone = minutes >= 72 * 60 ? 'danger' : minutes >= 24 * 60 ? 'warning' : 'neutral';
  return { label, tone };
}

/** "reviewedVersion" / "reviewed_version" -> "Reviewed version" */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX_TEXT = 500;

/**
 * Renders an arbitrary JSON value from an audit record as plain text. Values are only ever placed in text
 * nodes by the caller, so nothing here can become markup.
 */
export function describeValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') {
    const text = ISO_TIMESTAMP.test(value) ? formatCalendarDate(value) : value;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (depth < 2 && typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value)) {
    const change = value as { from?: unknown; to?: unknown };
    return `${describeValue(change.from, depth + 1)} → ${describeValue(change.to, depth + 1)}`;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
  } catch {
    return 'Unreadable value';
  }
}

/** key/value pairs of a details object, capped so one odd record can't flood the page */
export function detailEntries(details: Record<string, unknown> | null | undefined): Array<{ key: string; label: string; value: string }> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  return Object.entries(details)
    .slice(0, 20)
    .map(([key, value]) => ({ key, label: humanizeKey(key), value: describeValue(value) }));
}

const KYC_ACTIONS: Record<string, string> = {
  KYC_DECISION: 'KYC decision',
  IDENTITY_CHANGED: 'Identity details changed',
  IDENTITY_CHANGED_KYC_RESET: 'Identity details changed, KYC sent back for review',
};

export const kycActionLabel = (action: string) => KYC_ACTIONS[action] ?? humanize(action);

export const KYC_LABEL = { PENDING: 'Pending review', VERIFIED: 'Verified', REJECTED: 'Rejected' } as const;

export const ALERT_STATUS_LABEL = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
} as const;

/** Fraud rule reasons start with the side of the transaction that was scored: "[OUTBOUND] Amount ..." */
export function splitReason(reason: string): { direction: 'Outgoing' | 'Incoming' | null; text: string } {
  const match = /^\[(OUTBOUND|INBOUND)\]\s*/.exec(reason);
  if (!match) return { direction: null, text: reason };
  return { direction: match[1] === 'OUTBOUND' ? 'Outgoing' : 'Incoming', text: reason.slice(match[0].length) || reason };
}

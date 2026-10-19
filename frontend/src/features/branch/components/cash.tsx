import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { AccountType, CashOperationType, TellerSession } from '@/lib/api/types';
import type { Role } from '@/lib/auth/session';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';

/**
 * Shared by the teller desk and the supervisor cash pages. Branch business dates are IST calendar days, so
 * times are shown in IST whatever the device's time zone (every branch works on India time).
 */
export const IST = 'Asia/Kolkata';
export const PAGE_SIZE = 20;

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST,
});

const businessDateFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const isoDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

function parts(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
  return out;
}

/** "27 Oct 2026, 3:15 pm IST" (built from parts so every browser renders the same separators) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const p = parts(dateTimeFormatter, date);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()} IST`;
}

/** "2026-10-27" -> "Tue, 27 Oct 2026" (a calendar date, never shifted by time zones) */
export function formatBusinessDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return value ?? '—';
  const p = parts(businessDateFormatter, new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** Today's IST business date as YYYY-MM-DD, the same calendar the ledger uses */
export function istToday(now: Date = new Date()): string {
  return isoDayFormatter.format(now);
}

export const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

/**
 * placeholderData for the paged lists (keys shaped [area, list, status, offset]): keeps the current page on
 * screen while the next page of the SAME filter loads, but never shows one tab's rows under another tab.
 */
export function keepPageWithinFilter<T>(status: string | undefined) {
  return (previous: T | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined): T | undefined =>
    previousQuery && previousQuery.queryKey[2] === (status ?? 'all') ? previous : undefined;
}

/**
 * A session as supervisors see it. A first supervisor's count that disagreed with the teller is recorded
 * (who and when; the figure itself only after reconciliation) so a second administrator can confirm it.
 */
export type SupervisorSession = TellerSession & {
  disputedBy?: string | null;
  disputedAt?: string | null;
  disputedCount?: string | null;
};

/** True when two administrators' matching counts, not the teller's declaration, settled the session */
export function settledByDispute(s: SupervisorSession): boolean {
  if (s.status !== 'RECONCILED' || !s.disputedBy) return false;
  const integer = /^-?\d+$/;
  if (!integer.test(s.disputedCount ?? '') || !integer.test(s.expectedClosing ?? '') || !integer.test(s.discrepancy ?? '')) return false;
  const counted = (BigInt(s.expectedClosing as string) + BigInt(s.discrepancy as string)).toString();
  return counted === s.disputedCount && counted !== s.declaredClosing;
}

export const CASH_TYPE_LABEL: Record<CashOperationType, string> = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal' };
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { SAVINGS: 'Savings', CURRENT: 'Current' };

/** How a signed discrepancy (counted − expected) reads: words, sign and colour together */
export function describeDiscrepancy(paise: string | null | undefined): { label: string; tone: 'success' | 'danger' | 'warning' } | null {
  if (paise === null || paise === undefined || !/^-?\d+$/.test(paise)) return null;
  const value = BigInt(paise);
  if (value === 0n) return { label: 'Balanced', tone: 'success' };
  if (value < 0n) return { label: `Short by ${formatPaise(-value)}`, tone: 'danger' };
  return { label: `Over by ${formatPaise(value)}`, tone: 'warning' };
}

export function Discrepancy({ paise, className }: { paise: string | null | undefined; className?: string }) {
  const described = describeDiscrepancy(paise);
  if (!described) return <span className="text-muted-foreground">—</span>;
  const Icon = described.tone === 'success' ? CheckCircle2 : described.tone === 'danger' ? TrendingDown : TrendingUp;
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1.5 font-medium',
        described.tone === 'success' && 'text-success',
        described.tone === 'danger' && 'text-destructive',
        described.tone === 'warning' && 'text-warning',
        className
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{described.label}</span>
      {described.tone === 'success' ? null : (
        <span className="tnum text-[12.5px] font-normal text-muted-foreground">{formatPaise(paise, { sign: 'always' })}</span>
      )}
    </span>
  );
}

/**
 * Staff emails by id for one role (bounded to the first 100). Purely cosmetic: when the directory can't be
 * read the pages fall back to a short id instead of failing.
 */
export function useStaffDirectory(role: Extract<Role, 'TELLER' | 'BANK_ADMIN'>) {
  const api = useApi();
  const params = { role, limit: 100 } as const;
  const query = useQuery({
    queryKey: qk.directory(params),
    queryFn: () => api.admin.users(params),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const byId = new Map((query.data ?? []).map((u) => [u.id, u]));
  return {
    query,
    users: query.data ?? [],
    label: (id: string | null | undefined) => (id ? (byId.get(id)?.email ?? shortId(id)) : '—'),
  };
}

export interface StatusTab<T extends string> {
  value: T;
  label: string;
}

/** Status filter tabs over a single panel (the list for the selected status) */
export function StatusTabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
  children,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: ReadonlyArray<StatusTab<T>>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className={className}>
      <div className="px-4 pt-4 sm:px-5">
        <TabsList aria-label={label} className="w-full justify-start sm:w-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={value} className="mt-3">
        {children}
      </TabsContent>
    </Tabs>
  );
}

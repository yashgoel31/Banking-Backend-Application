import type { BankAccount, LedgerEntry } from '@/lib/api/types';
import { addPaise, type Paise } from '@/lib/money';
import { dayKey, formatShortDate } from './lib';

export interface AccountEntry {
  account: BankAccount;
  entry: LedgerEntry;
}

export interface DayFlow {
  key: string;
  label: string;
  inPaise: Paise;
  outPaise: Paise;
  /** Chart geometry only (never used for money maths or display) */
  in: number;
  /** Negative, so money out is drawn below the axis */
  out: number;
}

export interface CashFlow {
  days: DayFlow[];
  totalIn: Paise;
  totalOut: Paise;
  hasActivity: boolean;
  /** The day with the most money out, if any */
  busiestDay: DayFlow | null;
}

/**
 * Transactions that debited one of the customer's accounts and credited another of them: moving money
 * between your own accounts is neither income nor spending.
 */
export function internalTransactionIds(entries: AccountEntry[]): Set<string> {
  const debits = new Set<string>();
  const credits = new Set<string>();
  for (const { entry } of entries) (entry.entryType === 'DEBIT' ? debits : credits).add(entry.transactionId);
  return new Set([...debits].filter((id) => credits.has(id)));
}

/** Money in and out per local day for the last `days` days (today included), from statement entries */
export function buildCashFlow(entries: AccountEntry[], now = new Date(), days = 30): CashFlow {
  const internal = internalTransactionIds(entries);
  const buckets = new Map<string, { date: Date; in: Paise[]; out: Paise[] }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.set(dayKey(date), { date, in: [], out: [] });
  }
  for (const { entry } of entries) {
    if (internal.has(entry.transactionId)) continue;
    const bucket = buckets.get(dayKey(entry.createdAt));
    if (!bucket) continue;
    (entry.entryType === 'CREDIT' ? bucket.in : bucket.out).push(entry.amountInPaise);
  }

  const series: DayFlow[] = [...buckets.entries()].map(([key, bucket]) => {
    const inPaise = addPaise(bucket.in);
    const outPaise = addPaise(bucket.out);
    return { key, label: formatShortDate(bucket.date), inPaise, outPaise, in: Number(inPaise), out: -Number(outPaise) };
  });
  const totalIn = addPaise(series.map((d) => d.inPaise));
  const totalOut = addPaise(series.map((d) => d.outPaise));
  let busiestDay: DayFlow | null = null;
  for (const day of series) {
    if (BigInt(day.outPaise) > 0n && (!busiestDay || BigInt(day.outPaise) > BigInt(busiestDay.outPaise))) busiestDay = day;
  }
  return { days: series, totalIn, totalOut, hasActivity: totalIn !== '0' || totalOut !== '0', busiestDay };
}

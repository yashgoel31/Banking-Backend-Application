import { CopyButton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatAccountNumber } from '@/lib/validation';

/** A full account number grouped for reading (1001 2345 6789), with a copy button that copies the digits */
export function AccountNumber({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="font-mono text-[13px] tnum text-muted-foreground">{formatAccountNumber(value)}</span>
      <CopyButton value={value} label="Copy account number" />
    </span>
  );
}

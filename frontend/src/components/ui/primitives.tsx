import { forwardRef, useEffect, useRef, useState, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Copy, Check, Info, Loader2, OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatPaise } from '@/lib/money';
import { Input } from './input';

// --- Card -------------------------------------------------------------------------------------

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow-card', className)} {...props} />
));
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-3', className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-[15px] font-semibold leading-tight tracking-tight', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-2 sm:p-6 sm:pt-2', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-t px-5 py-3 sm:px-6', className)} {...props} />;
}

// --- Badge ------------------------------------------------------------------------------------

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/20 bg-primary-soft text-primary',
        success: 'border-success/20 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        danger: 'border-destructive/20 bg-destructive-soft text-destructive',
        info: 'border-info/20 bg-info-soft text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, dot, children, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  VERIFIED: 'success',
  EXECUTED: 'success',
  APPROVED: 'success',
  RESOLVED: 'success',
  RECONCILED: 'success',
  COMPLETED: 'success',
  SENT: 'success',
  OPEN: 'info',
  ISSUED: 'info',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  UNDER_REVIEW: 'warning',
  CLOSED: 'neutral',
  DISMISSED: 'neutral',
  CANCELLED: 'neutral',
  FROZEN: 'danger',
  REJECTED: 'danger',
  FAILED: 'danger',
  DEAD_LETTER: 'danger',
  DISABLED: 'danger',
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

/** Consistent colour + wording for every status enum the API returns */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot className={className}>
      {label ?? humanize(status)}
    </Badge>
  );
}

// --- Callout ----------------------------------------------------------------------------------

const calloutIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert };
const calloutTones = {
  info: 'border-info/25 bg-info-soft text-foreground [&_svg]:text-info',
  success: 'border-success/25 bg-success-soft text-foreground [&_svg]:text-success',
  warning: 'border-warning/30 bg-warning-soft text-foreground [&_svg]:text-warning',
  danger: 'border-destructive/25 bg-destructive-soft text-foreground [&_svg]:text-destructive',
};

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof calloutTones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = calloutIcons[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3.5 text-[13px]', calloutTones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold leading-5">{title}</p> : null}
        {children ? <div className="leading-5 text-muted-foreground [&_strong]:text-foreground">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

// --- Loading & empty states -------------------------------------------------------------------

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.04] before:to-transparent', className)}
      {...props}
    />
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {Icon ? (
        <div className="mb-1 flex size-11 items-center justify-center rounded-full border bg-muted/60">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// --- Page structure ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  loading?: boolean;
}) {
  const iconTone = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn('flex size-8 items-center justify-center rounded-lg', iconTone)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tnum">{loading ? <Skeleton className="h-8 w-32" /> : value}</div>
      {hint ? <div className="mt-1 text-[12.5px] text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

export function DescriptionList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('divide-y', className)}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm sm:col-span-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- Money ------------------------------------------------------------------------------------

/** An amount in paise; credits and debits are colour-coded and signed for scanning */
export function Amount({
  paise,
  direction,
  className,
}: {
  paise: string | null | undefined;
  direction?: 'CREDIT' | 'DEBIT';
  className?: string;
}) {
  const signed = direction === 'DEBIT' && paise ? `-${paise}` : paise;
  return (
    <span
      className={cn(
        'tnum whitespace-nowrap font-medium',
        direction === 'CREDIT' && 'text-success',
        direction === 'DEBIT' && 'text-foreground',
        className
      )}
    >
      {formatPaise(signed, { sign: direction ? 'always' : 'auto' })}
    </span>
  );
}

export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden="true">
      ₹
    </span>
    <Input ref={ref} inputMode="decimal" autoComplete="off" placeholder="0.00" className={cn('pl-7 tnum', className)} {...props} />
  </div>
));
MoneyInput.displayName = 'MoneyInput';

// --- Misc -------------------------------------------------------------------------------------

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split('@')[0]!
      .split(/[\s._-]+/)
      .filter((part) => /^\p{L}/u.test(part))
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary', className)}
    >
      {initials}
    </span>
  );
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={cn('inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer', className)}
      aria-label={copied ? 'Copied' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>;
}

/** Monospace, copyable identifier (UUIDs, references) shortened for tables */
export function Mono({ value, short = true, copy = false }: { value: string; short?: boolean; copy?: boolean }) {
  const text = short && value.length > 12 ? `${value.slice(0, 8)}…` : value;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[12.5px] text-muted-foreground" title={value}>
      {text}
      {copy ? <CopyButton value={value} label="Copy identifier" /> : null}
    </span>
  );
}

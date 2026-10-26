import { cn } from '@/lib/cn';

/** BankSphere mark: a sphere cut by a ledger line */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id="bs-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F7DFF" />
          <stop offset="1" stopColor="#1E40D8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#bs-mark)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M7.5 16h17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 7.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
    </svg>
  );
}

export function BrandLogo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className={cn('text-[17px] font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
        Bank<span className={inverted ? 'text-[#8EA8FF]' : 'text-primary'}>Sphere</span>
      </span>
    </span>
  );
}

import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Numbered steps with the current one marked for assistive technology (aria-current="step") */
export function StepProgress({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li key={step} aria-current={here ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tnum transition-colors',
                done && 'border-primary bg-primary text-primary-foreground',
                here && 'border-primary bg-primary-soft text-primary',
                !done && !here && 'bg-background text-muted-foreground'
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('whitespace-nowrap text-[13px] font-medium', here ? 'text-foreground' : 'text-muted-foreground')}>
              {step}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className={cn('h-px min-w-4 flex-1 bg-border', done && 'bg-primary')} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

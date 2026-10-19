import { Search, X } from 'lucide-react';
import { Field, Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

/** A labelled search box with a clear button; the caller debounces */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={cn('min-w-0', className)}>
      {(p) => (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            {...p}
            type="search"
            value={value}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && value) {
                e.preventDefault();
                onChange('');
              }
            }}
          />
          {value ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear search"
              onClick={() => onChange('')}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}
    </Field>
  );
}

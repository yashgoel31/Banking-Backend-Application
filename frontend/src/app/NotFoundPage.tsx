import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/layout/Brand';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <BrandLogo />
      <div className="flex size-12 items-center justify-center rounded-full border bg-background">
        <Compass className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">We couldn’t find that page</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be out of date, or the page may have moved.</p>
      </div>
      <Button asChild>
        <Link to="/">Go to my home page</Link>
      </Button>
    </div>
  );
}

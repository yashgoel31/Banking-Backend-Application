import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react';
import { BrandLogo } from './Brand';
import { ThemeToggle } from './AppShell';

const POINTS = [
  { icon: ShieldCheck, title: 'Bank-grade protection', text: 'Every transfer is double-entry, idempotent and checked against your limits.' },
  { icon: Fingerprint, title: 'Two-factor by design', text: 'Authenticator codes guard sign-in and every high-value action.' },
  { icon: LockKeyhole, title: 'Your session, sealed', text: 'Session keys never touch page scripts, and sign-out ends them everywhere.' },
];

/** Split-screen frame for every signed-out page */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col" aria-label="About BankSphere">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 40%, transparent 75%)',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -left-24 top-1/3 size-[420px] rounded-full bg-[#2F5BFF]/25 blur-[110px]" aria-hidden="true" />
        <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
          <BrandLogo inverted />
          <div className="max-w-md space-y-8">
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8EA8FF]">Modern banking, uncompromised</p>
              <h1 className="text-balance text-[2.1rem] font-semibold leading-[1.15] tracking-tight">
                Money that moves fast. Controls that never blink.
              </h1>
            </div>
            <ul className="space-y-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
                    <Icon className="size-[18px] text-[#9DB4FF]" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium">{title}</span>
                    <span className="block text-[13px] leading-relaxed text-white/60">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-white/45">© {new Date().getFullYear()} BankSphere. Deposits are held in integer paise and reconciled continuously.</p>
        </div>
      </section>
      <section className="relative flex flex-col bg-background">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <span className="lg:hidden">
            <BrandLogo />
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8">
          <div className="w-full max-w-[400px] animate-slide-up">
            <Outlet />
          </div>
        </div>
      </section>
    </div>
  );
}

export function AuthHeading({ title, description, icon }: { title: string; description?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-7 space-y-2">
      {icon ? <div className="mb-4">{icon}</div> : null}
      <h1 className="text-[1.6rem] font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function AuthIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-11 items-center justify-center rounded-xl border bg-primary-soft text-primary [&_svg]:size-5">{children}</span>;
}

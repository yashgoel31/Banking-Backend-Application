import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronsUpDown, LogOut, Menu, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth, useUser } from '@/lib/auth/AuthProvider';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { NAVIGATION, ROLE_LABEL, type NavSection } from '@/app/navigation';
import { Avatar } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
  Tooltip,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { BrandLogo } from './Brand';

function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="space-y-1">
          {section.title ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">{section.title}</p>
          ) : null}
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/teller'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-active text-white shadow-[inset_2px_0_0_0_#6E93FF]'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-active/70 hover:text-white'
                )
              }
            >
              <item.icon className="size-4 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const { preference, resolved, setTheme } = useTheme();
  const next = THEME_OPTIONS[(THEME_OPTIONS.findIndex((o) => o.value === preference) + 1) % THEME_OPTIONS.length]!;
  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <Tooltip content={`Theme: ${preference} (switch to ${next.label.toLowerCase()})`}>
      <Button variant="ghost" size="icon" aria-label={`Switch to ${next.label.toLowerCase()} theme`} onClick={() => setTheme(next.value)}>
        <Icon aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const user = useUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-active focus-visible:ring-2 focus-visible:ring-[#6E93FF] cursor-pointer',
            compact && 'w-auto'
          )}
          aria-label="Account menu"
        >
          <Avatar name={user.email} className="bg-[#1F2C4D] text-[#B9C8FF]" />
          {compact ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{user.email}</span>
              <span className="block truncate text-[12px] text-sidebar-muted">{ROLE_LABEL[user.role]}</span>
            </span>
          )}
          {compact ? null : <ChevronsUpDown className="size-4 text-sidebar-muted" aria-hidden="true" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate font-medium text-foreground">{user.email}</span>
          <span className="block">{ROLE_LABEL[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings/security')}>
          <ShieldCheck aria-hidden="true" /> Security settings
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await signOut();
            navigate('/login', { replace: true, state: { signedOut: true } });
          }}
        >
          <LogOut aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarFrame({ children, onNavigate }: { children?: ReactNode; onNavigate?: () => void }) {
  const user = useUser();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 border-b border-white/[0.06] px-5">
        <BrandLogo inverted />
      </div>
      <div className="px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] font-medium text-sidebar-foreground/90">
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          {ROLE_LABEL[user.role]}
        </span>
      </div>
      <SidebarNav sections={NAVIGATION[user.role]} onNavigate={onNavigate} />
      {children}
      <div className="border-t border-white/[0.06] p-3">
        <UserMenu />
      </div>
    </div>
  );
}

/** Authenticated application frame: sidebar on desktop, drawer on mobile */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-elevated"
      >
        Skip to content
      </a>
      {/* A full-height column whose contents stick to the viewport while the page scrolls */}
      <aside className="z-40 hidden w-[248px] shrink-0 bg-sidebar lg:block" aria-label="Sidebar">
        <div className="sticky top-0 h-dvh">
          <SidebarFrame />
        </div>
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" title="Navigation" className="w-[280px] border-0 bg-sidebar p-0">
          <SidebarFrame onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </DialogPrimitive.Root>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu aria-hidden="true" />
          </Button>
          <div className="lg:hidden">
            <BrandLogo />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex">
              <ShieldCheck className="size-3.5 text-success" aria-hidden="true" /> Secure session
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" key={location.pathname} className="mx-auto w-full max-w-[1280px] animate-fade-in px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

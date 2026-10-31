import { http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { apiUrl, fail, ok, renderRoute } from '@/test/render';
import { aMe } from '@/test/fixtures';
import type { Role } from '@/lib/auth/session';
import { ACCOUNT_LINKS, HOME, NAVIGATION } from './navigation';

const noSession = () => server.use(http.post(apiUrl('/auth/refresh'), () => fail(401, 'UNAUTHORIZED', 'no session')));

describe('route guards', () => {
  it('sends signed-out visitors to sign in and remembers where they were going', async () => {
    noSession();
    const { router } = await renderRoute('/payees', { role: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 30_000 });
    expect(router.state.location.state).toEqual({ from: '/payees' });
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('keeps an email-link token through sign-in', async () => {
    noSession();
    const { router } = await renderRoute('/mfa/enrol#token=emailed-enrolment-token-0123456789', { role: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 30_000 });
    expect(router.state.location.state).toEqual({ from: '/mfa/enrol#token=emailed-enrolment-token-0123456789' });
  });

  it.each<[Role, string]>([
    ['CUSTOMER', '/overview'],
    ['TELLER', '/dashboard'],
    ['KYC_OFFICER', '/teller'],
    ['FRAUD_ANALYST', '/approvals'],
    ['SUPPORT', '/transfer'],
    ['BANK_ADMIN', '/teller'],
  ])('keeps %s out of %s and sends them home', async (role, forbidden) => {
    server.use(http.all(apiUrl('/*'), () => ok([])));
    const { router } = await renderRoute(forbidden, { role });
    await waitFor(() => expect(router.state.location.pathname).toBe(HOME[role]), { timeout: 30_000 });
  });

  it('forces staff without a second factor to enrol first', async () => {
    const { router } = await renderRoute('/overview', { role: 'BANK_ADMIN', claims: { mfa: false } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/mfa/enrol'), { timeout: 30_000 });
  });

  it('sends a signed-in person from the sign-in page to their home page', async () => {
    server.use(http.all(apiUrl('/*'), () => ok([])));
    const { router } = await renderRoute('/login', { role: 'FRAUD_ANALYST' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/fraud'), { timeout: 30_000 });
  });

  it('resolves "/" to the role home page', async () => {
    server.use(http.all(apiUrl('/*'), () => ok([])));
    const { router } = await renderRoute('/', { role: 'TELLER' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/teller'), { timeout: 30_000 });
  });

  it('shows a friendly page for unknown URLs', async () => {
    await renderRoute('/no-such-page', { role: 'CUSTOMER' });
    expect(await screen.findByRole('heading', { name: /couldn’t find that page/i })).toBeInTheDocument();
  });

  it('renders the shell with one main navigation for the role, and settings in the account menu', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => ok(aMe())));
    const { user } = await renderRoute('/settings/security', { role: 'CUSTOMER' });
    // First load transforms the lazily imported page, which can take a moment under test
    expect(await screen.findByRole('heading', { name: 'Security', level: 1 }, { timeout: 8000 })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const item of NAVIGATION.CUSTOMER.flatMap((s) => s.items)) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    }
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    for (const link of ACCOUNT_LINKS.CUSTOMER) {
      expect(await screen.findByRole('menuitem', { name: link.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('puts what doesn’t fit in the phone tab bar behind “More”', async () => {
    server.use(http.all(apiUrl('/*'), () => ok([])));
    const { user } = await renderRoute('/overview', { role: 'BANK_ADMIN' });
    const nav = await screen.findByRole('navigation', { name: 'Main' }, { timeout: 8000 });
    const all = NAVIGATION.BANK_ADMIN.flatMap((s) => s.items);
    // Four destinations and "More" fill the five tab slots
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: 'Teller sessions' })).toHaveTextContent('Sessions');
    await user.click(within(nav).getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'All sections' });
    for (const item of all) expect(within(sheet).getByRole('link', { name: item.label })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('link', { name: 'Notifications' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All sections' })).not.toBeInTheDocument());
  });

  it('every navigation link points at a route the role may open', async () => {
    const { routes } = await import('./routes');
    const flat: string[] = [];
    const walk = (rs: typeof routes) =>
      rs.forEach((r) => {
        if (r.path) flat.push(r.path);
        if (r.children) walk(r.children);
      });
    walk(routes);
    for (const sections of Object.values(NAVIGATION)) {
      for (const item of sections.flatMap((s) => s.items)) {
        expect(flat).toContain(item.to);
        // A tab-bar label is a word of the full label, so the visible text stays part of the accessible name
        if (item.short) expect(item.label.toLowerCase()).toContain(item.short.toLowerCase());
      }
    }
    for (const links of Object.values(ACCOUNT_LINKS)) {
      for (const link of links) expect(flat).toContain(link.to);
    }
  });
});

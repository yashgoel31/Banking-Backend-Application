import { http } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { apiUrl, fail, ok, renderRoute } from '@/test/render';
import { aMe } from '@/test/fixtures';
import type { Role } from '@/lib/auth/session';
import { HOME, NAVIGATION } from './navigation';

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

  it('renders the shell with the navigation for the role', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => ok(aMe())));
    await renderRoute('/settings/security', { role: 'CUSTOMER' });
    // First load transforms the lazily imported page, which can take a moment under test
    expect(await screen.findByRole('heading', { name: 'Security', level: 1 }, { timeout: 8000 })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    for (const item of NAVIGATION.CUSTOMER.flatMap((s) => s.items)) {
      expect(nav).toHaveTextContent(item.label);
    }
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
      }
    }
  });
});

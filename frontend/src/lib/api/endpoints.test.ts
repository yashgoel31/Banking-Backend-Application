import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { createEndpoints, type Endpoints } from './endpoints';

interface Captured {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
  auth: string | null;
  idempotencyKey: string | null;
}

function setup(responseData: unknown = { ok: true }, status = 200) {
  const captured: Captured[] = [];
  server.use(
    http.all('http://localhost:3000/api/v1/*', async ({ request }) => {
      const u = new URL(request.url);
      const text = await request.text();
      captured.push({
        method: request.method,
        path: u.pathname.replace('/api/v1', ''),
        search: u.searchParams,
        body: text ? JSON.parse(text) : undefined,
        auth: request.headers.get('authorization'),
        idempotencyKey: request.headers.get('idempotency-key'),
      });
      return HttpResponse.json({ success: true, data: responseData }, { status });
    })
  );
  const client = new ApiClient({ getAccessToken: () => 'tok', refreshAccessToken: async () => 'tok', onSessionExpired: () => {} });
  return { api: createEndpoints(client), captured };
}

type Case = [name: string, call: (api: Endpoints) => Promise<unknown>, method: string, path: string, body?: unknown];

const cases: Case[] = [
  ['auth.login', (a) => a.auth.login('a@b.in', 'pw'), 'POST', '/auth/login', { email: 'a@b.in', password: 'pw' }],
  ['auth.loginMfa', (a) => a.auth.loginMfa('chal-token-1234567890', '123456'), 'POST', '/auth/login/mfa', { challengeToken: 'chal-token-1234567890', code: '123456' }],
  ['auth.register', (a) => a.auth.register('a@b.in', 'Pw-1234567'), 'POST', '/auth/register', { email: 'a@b.in', password: 'Pw-1234567' }],
  ['auth.verifyEmail', (a) => a.auth.verifyEmail('t'), 'POST', '/auth/email/verify', { token: 't' }],
  ['auth.resendVerification', (a) => a.auth.resendVerification('a@b.in'), 'POST', '/auth/email/resend-verification', { email: 'a@b.in' }],
  ['auth.forgotPassword', (a) => a.auth.forgotPassword('a@b.in'), 'POST', '/auth/password/forgot', { email: 'a@b.in' }],
  ['auth.resetPassword', (a) => a.auth.resetPassword('t', 'New-Pass-123'), 'POST', '/auth/password/reset', { token: 't', newPassword: 'New-Pass-123' }],
  ['auth.activateStaff', (a) => a.auth.activateStaff('t', 'New-Pass-123'), 'POST', '/auth/staff/activate', { token: 't', password: 'New-Pass-123' }],
  ['auth.me', (a) => a.auth.me(), 'GET', '/auth/me'],
  ['auth.changePassword', (a) => a.auth.changePassword('old', 'New-Pass-123'), 'POST', '/auth/password/change', { currentPassword: 'old', newPassword: 'New-Pass-123' }],
  ['auth.mfaSetup', (a) => a.auth.mfaSetup('pw'), 'POST', '/auth/mfa/setup', { password: 'pw' }],
  ['auth.mfaSetup staff', (a) => a.auth.mfaSetup('pw', 'enrol'), 'POST', '/auth/mfa/setup', { password: 'pw', enrolmentToken: 'enrol' }],
  ['auth.mfaEnable', (a) => a.auth.mfaEnable('123456'), 'POST', '/auth/mfa/enable', { code: '123456' }],
  ['auth.mfaDisable', (a) => a.auth.mfaDisable('pw', '123456'), 'POST', '/auth/mfa/disable', { password: 'pw', code: '123456' }],
  ['auth.stepUp', (a) => a.auth.stepUp('123456'), 'POST', '/auth/mfa/step-up', { code: '123456' }],
  ['admin.users', (a) => a.admin.users({ role: 'TELLER', q: 'ravi', limit: 20, offset: 0 }), 'GET', '/auth/admin/users'],
  ['admin.requestStaff', (a) => a.admin.requestStaff('t@bank.in', 'TELLER'), 'POST', '/auth/admin/users', { email: 't@bank.in', role: 'TELLER' }],
  ['admin.setUserActive', (a) => a.admin.setUserActive('u1', false), 'PATCH', '/auth/admin/users/u1/status', { isActive: false }],
  ['admin.resetMfa', (a) => a.admin.resetMfa('u1'), 'POST', '/auth/admin/users/u1/mfa/reset'],
  ['admin.requests', (a) => a.admin.requests({ status: 'PENDING' }), 'GET', '/auth/admin/requests'],
  ['admin.approveRequest', (a) => a.admin.approveRequest('r1'), 'POST', '/auth/admin/requests/r1/approve'],
  ['admin.rejectRequest', (a) => a.admin.rejectRequest('r1'), 'POST', '/auth/admin/requests/r1/reject'],
  ['customers.me', (a) => a.customers.me(), 'GET', '/customers/me'],
  ['customers.createMe', (a) => a.customers.createMe({ fullName: 'Asha Rao', phoneNumber: '+919876543210' }), 'POST', '/customers/me', { fullName: 'Asha Rao', phoneNumber: '+919876543210' }],
  ['customers.updateMe', (a) => a.customers.updateMe({ address: 'Pune' }), 'PATCH', '/customers/me', { address: 'Pune' }],
  ['customers.list', (a) => a.customers.list({ kycStatus: 'PENDING' }), 'GET', '/customers'],
  ['customers.get', (a) => a.customers.get('u1'), 'GET', '/customers/u1'],
  ['customers.decideKyc', (a) => a.customers.decideKyc('u1', 'VERIFIED', 3), 'PATCH', '/customers/u1/kyc', { kycStatus: 'VERIFIED', expectedVersion: 3 }],
  ['customers.kycHistory', (a) => a.customers.kycHistory('u1'), 'GET', '/customers/u1/kyc/history'],
  ['accounts.list', (a) => a.accounts.list(), 'GET', '/accounts'],
  ['accounts.get', (a) => a.accounts.get('a1'), 'GET', '/accounts/a1'],
  ['accounts.open', (a) => a.accounts.open('SAVINGS'), 'POST', '/accounts', { accountType: 'SAVINGS' }],
  ['accounts.setStatus', (a) => a.accounts.setStatus('a1', 'FROZEN'), 'PATCH', '/accounts/a1/status', { status: 'FROZEN' }],
  ['accounts.setDailyLimit', (a) => a.accounts.setDailyLimit('a1', '500000'), 'PATCH', '/accounts/a1/daily-limit', { dailyLimitPaise: '500000' }],
  ['accounts.lookup', (a) => a.accounts.lookup('100123456789'), 'GET', '/accounts/lookup'],
  ['ledger.balance', (a) => a.ledger.balance('a1'), 'GET', '/transactions/accounts/a1/balance'],
  ['ledger.history', (a) => a.ledger.history('a1', { limit: 20, offset: 40 }), 'GET', '/transactions/accounts/a1/history'],
  ['ledger.beneficiaries', (a) => a.ledger.beneficiaries(), 'GET', '/transactions/beneficiaries'],
  ['ledger.addBeneficiary', (a) => a.ledger.addBeneficiary('100123456789', 'Mom'), 'POST', '/transactions/beneficiaries', { accountNumber: '100123456789', nickname: 'Mom' }],
  ['ledger.removeBeneficiary', (a) => a.ledger.removeBeneficiary('b1'), 'DELETE', '/transactions/beneficiaries/b1'],
  ['ledger.createWithdrawalCode', (a) => a.ledger.createWithdrawalCode('a1', '100000'), 'POST', '/transactions/withdrawal-codes', { accountId: 'a1', amountInPaise: '100000' }],
  ['teller.currentSession', (a) => a.teller.currentSession(), 'GET', '/transactions/teller/sessions/current'],
  ['teller.acceptFloat', (a) => a.teller.acceptFloat('5000000'), 'POST', '/transactions/teller/sessions/accept', { countedFloatPaise: '5000000' }],
  ['teller.closeSession', (a) => a.teller.closeSession('0'), 'POST', '/transactions/teller/sessions/close', { countedCashPaise: '0' }],
  ['teller.cashOperations', (a) => a.teller.cashOperations({ status: 'PENDING_APPROVAL' }), 'GET', '/transactions/cash-operations'],
  ['supervisor.sessions', (a) => a.supervisor.sessions({ status: 'CLOSED' }), 'GET', '/transactions/teller/sessions'],
  ['supervisor.issueFloat', (a) => a.supervisor.issueFloat('t1', '5000000'), 'POST', '/transactions/teller/sessions', { tellerId: 't1', openingFloatPaise: '5000000' }],
  ['supervisor.cancelFloat', (a) => a.supervisor.cancelFloat('s1'), 'POST', '/transactions/teller/sessions/s1/cancel'],
  ['supervisor.signOff', (a) => a.supervisor.signOff('s1', '5000000'), 'POST', '/transactions/teller/sessions/s1/sign-off', { countedCashPaise: '5000000' }],
  ['supervisor.rejectCash', (a) => a.supervisor.rejectCash('c1'), 'POST', '/transactions/cash-operations/c1/reject'],
  ['fraud.alerts', (a) => a.fraud.alerts({ status: 'OPEN' }), 'GET', '/fraud/alerts'],
  ['fraud.updateAlert', (a) => a.fraud.updateAlert('al1', 'UNDER_REVIEW'), 'PATCH', '/fraud/alerts/al1', { status: 'UNDER_REVIEW' }],
  ['fraud.updateAlert note', (a) => a.fraud.updateAlert('al1', 'RESOLVED', 'Customer confirmed'), 'PATCH', '/fraud/alerts/al1', { status: 'RESOLVED', note: 'Customer confirmed' }],
  ['fraud.history', (a) => a.fraud.history('al1'), 'GET', '/fraud/alerts/al1/history'],
  ['notifications.logs', (a) => a.notifications.logs({ recipient: 'a@b.in' }), 'GET', '/notifications/logs'],
];

describe('endpoint contracts', () => {
  it.each(cases)('%s → %s %s', async (_name, call, method, path, body) => {
    const { api, captured } = setup();
    await call(api);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ method, path });
    expect(captured[0]?.body).toEqual(body);
  });

  it('never sends the access token to public auth endpoints', async () => {
    const { api, captured } = setup();
    await api.auth.login('a@b.in', 'pw');
    await api.auth.register('a@b.in', 'Pw-1234567');
    await api.auth.forgotPassword('a@b.in');
    expect(captured.map((c) => c.auth)).toEqual([null, null, null]);
  });

  it('sends query filters', async () => {
    const { api, captured } = setup([]);
    await api.admin.users({ role: 'TELLER', q: 'ravi', limit: 20, offset: 0 });
    await api.accounts.lookup('100123456789');
    await api.accounts.list('cust-1');
    expect(Object.fromEntries(captured[0]!.search)).toEqual({ role: 'TELLER', q: 'ravi', limit: '20', offset: '0' });
    expect(captured[1]!.search.get('accountNumber')).toBe('100123456789');
    expect(captured[2]!.search.get('customerId')).toBe('cust-1');
  });

  it('carries the idempotency key on every money-moving call', async () => {
    const { api, captured } = setup({ status: 'EXECUTED' }, 201);
    await api.ledger.transfer({ sourceAccountId: 'a1', destinationAccountId: 'a2', amountInPaise: '100' }, 'k-transfer-1');
    await api.teller.deposit({ accountId: 'a1', amountInPaise: '100' }, 'k-deposit-1');
    await api.teller.withdraw({ accountId: 'a1', amountInPaise: '100', authorizationCode: '12345678' }, 'k-withdraw-1');
    await api.supervisor.approveCash('c1', 'k-approve-1');
    expect(captured.map((c) => c.idempotencyKey)).toEqual(['k-transfer-1', 'k-deposit-1', 'k-withdraw-1', 'k-approve-1']);
    expect(captured[0]!.body).toEqual({ sourceAccountId: 'a1', destinationAccountId: 'a2', amountInPaise: '100' });
    expect(captured[2]!.body).toMatchObject({ authorizationCode: '12345678' });
  });

  it('tells an immediate admin change apart from a four-eyes request', async () => {
    let { api } = setup({ requestId: 'r1', status: 'PENDING' }, 202);
    await expect(api.admin.setUserActive('u1', false)).resolves.toEqual({
      queued: true,
      request: { requestId: 'r1', status: 'PENDING' },
    });
    ({ api } = setup({ id: 'u1', email: 'x@y.in', role: 'CUSTOMER', isActive: false }));
    await expect(api.admin.setUserActive('u1', false)).resolves.toMatchObject({ queued: false, result: { isActive: false } });
  });

  it('returns the message of public endpoints that have no data payload', async () => {
    server.use(
      http.post('http://localhost:3000/api/v1/auth/password/forgot', () =>
        HttpResponse.json({ success: true, message: 'If the address can receive email…' }, { status: 202 })
      )
    );
    const client = new ApiClient({ getAccessToken: () => null, refreshAccessToken: async () => null, onSessionExpired: () => {} });
    await expect(createEndpoints(client).auth.forgotPassword('a@b.in')).resolves.toEqual({
      message: 'If the address can receive email…',
    });
  });

  it('url-encodes path identifiers', async () => {
    const { api, captured } = setup();
    await api.accounts.get('a/../b');
    expect(captured[0]!.path).toBe('/accounts/a%2F..%2Fb');
  });
});

import type { ApiClient } from './client';
import type {
  AccountLookup,
  AccountStatus,
  AccountType,
  AdminRequest,
  AdminRequestStatus,
  AlertStatus,
  Balance,
  BankAccount,
  Beneficiary,
  CashInput,
  CashOperation,
  CashOperationResult,
  CashOperationStatus,
  CustomerProfile,
  DirectoryUser,
  Envelope,
  FraudAlert,
  FraudAlertEvent,
  KycEvent,
  KycStatus,
  LedgerEntry,
  LoginResult,
  LoginSuccess,
  Me,
  MfaSetup,
  NotificationLog,
  Page,
  ProfileInput,
  QueuedRequest,
  SessionTokens,
  StaffActivation,
  TellerSession,
  TellerSessionStatus,
  TransactionResult,
  TransferInput,
  WithdrawalCode,
} from './types';
import type { Role, StaffRole } from '@/lib/auth/session';

const id = (value: string) => encodeURIComponent(value);

/** 200 with the changed user, or 202 with a four-eyes request for a second administrator */
export type MaybeQueued<T> = { queued: true; request: QueuedRequest } | { queued: false; result: T };

function queuedOr<T>(data: unknown): MaybeQueued<T> {
  const candidate = data as Partial<QueuedRequest> | undefined;
  if (candidate && typeof candidate.requestId === 'string') {
    return { queued: true, request: candidate as QueuedRequest };
  }
  return { queued: false, result: data as T };
}

export function createEndpoints(client: ApiClient) {
  const get = async <T>(path: string, query?: object) =>
    (await client.request<Envelope<T>>(path, { query: query as Record<string, string | number | undefined> })).data;
  const send = async <T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    extra: { auth?: boolean; idempotencyKey?: string } = {}
  ) => {
    const envelope = await client.request<Envelope<T> | undefined>(path, { method, body, ...extra });
    return envelope?.data as T;
  };
  const publicPost = async <T = { message: string }>(path: string, body: unknown) => {
    const envelope = await client.request<Envelope<T> & { message?: string }>(path, { method: 'POST', body, auth: false });
    return (envelope.data ?? { message: envelope.message }) as T;
  };

  return {
    auth: {
      login: (email: string, password: string) => send<LoginResult>('POST', '/auth/login', { email, password }, { auth: false }),
      loginMfa: (challengeToken: string, code: string) =>
        send<LoginSuccess>('POST', '/auth/login/mfa', { challengeToken, code }, { auth: false }),
      register: (email: string, password: string) => publicPost('/auth/register', { email, password }),
      verifyEmail: (token: string) => publicPost('/auth/email/verify', { token }),
      resendVerification: (email: string) => publicPost('/auth/email/resend-verification', { email }),
      forgotPassword: (email: string) => publicPost('/auth/password/forgot', { email }),
      resetPassword: (token: string, newPassword: string) => publicPost('/auth/password/reset', { token, newPassword }),
      activateStaff: (token: string, password: string) =>
        send<StaffActivation>('POST', '/auth/staff/activate', { token, password }, { auth: false }),
      me: () => get<Me>('/auth/me'),
      changePassword: (currentPassword: string, newPassword: string) =>
        send<{ tokens: SessionTokens }>('POST', '/auth/password/change', { currentPassword, newPassword }),
      mfaSetup: (password: string, enrolmentToken?: string) =>
        send<MfaSetup>('POST', '/auth/mfa/setup', enrolmentToken ? { password, enrolmentToken } : { password }),
      mfaEnable: (code: string, enrolmentToken?: string) =>
        send<{ tokens: SessionTokens }>('POST', '/auth/mfa/enable', enrolmentToken ? { code, enrolmentToken } : { code }),
      mfaDisable: (password: string, code: string) => send<undefined>('POST', '/auth/mfa/disable', { password, code }),
      stepUp: (code: string) => send<SessionTokens>('POST', '/auth/mfa/step-up', { code }),
    },

    admin: {
      users: (params: { role?: Role; q?: string } & Page = {}) => get<DirectoryUser[]>('/auth/admin/users', params),
      requestStaff: (email: string, role: StaffRole) => send<QueuedRequest>('POST', '/auth/admin/users', { email, role }),
      setUserActive: async (userId: string, isActive: boolean) =>
        queuedOr<Pick<DirectoryUser, 'id' | 'email' | 'role' | 'isActive'>>(
          await send('PATCH', `/auth/admin/users/${id(userId)}/status`, { isActive })
        ),
      resetMfa: async (userId: string) => queuedOr<undefined>(await send('POST', `/auth/admin/users/${id(userId)}/mfa/reset`)),
      requests: (params: { status?: AdminRequestStatus } & Page = {}) => get<AdminRequest[]>('/auth/admin/requests', params),
      approveRequest: (requestId: string) =>
        send<{ request: AdminRequest; outcome: unknown }>('POST', `/auth/admin/requests/${id(requestId)}/approve`),
      rejectRequest: (requestId: string) =>
        send<{ id: string; status: AdminRequestStatus }>('POST', `/auth/admin/requests/${id(requestId)}/reject`),
    },

    customers: {
      me: () => get<CustomerProfile>('/customers/me'),
      createMe: (input: ProfileInput) => send<CustomerProfile>('POST', '/customers/me', input),
      updateMe: (input: Partial<ProfileInput>) => send<CustomerProfile>('PATCH', '/customers/me', input),
      list: (params: { kycStatus?: KycStatus; q?: string } & Page = {}) => get<CustomerProfile[]>('/customers', params),
      get: (userId: string) => get<CustomerProfile>(`/customers/${id(userId)}`),
      decideKyc: (userId: string, kycStatus: KycStatus, expectedVersion: number) =>
        send<CustomerProfile>('PATCH', `/customers/${id(userId)}/kyc`, { kycStatus, expectedVersion }),
      kycHistory: (userId: string) => get<KycEvent[]>(`/customers/${id(userId)}/kyc/history`),
    },

    accounts: {
      list: (customerId?: string) => get<BankAccount[]>('/accounts', { customerId }),
      get: (accountId: string) => get<BankAccount>(`/accounts/${id(accountId)}`),
      open: (accountType: AccountType) => send<BankAccount>('POST', '/accounts', { accountType }),
      setStatus: (accountId: string, status: AccountStatus) =>
        send<BankAccount>('PATCH', `/accounts/${id(accountId)}/status`, { status }),
      setDailyLimit: (accountId: string, dailyLimitPaise: string) =>
        send<BankAccount>('PATCH', `/accounts/${id(accountId)}/daily-limit`, { dailyLimitPaise }),
      lookup: (accountNumber: string) => get<AccountLookup>('/accounts/lookup', { accountNumber }),
    },

    ledger: {
      balance: (accountId: string) => get<Balance>(`/transactions/accounts/${id(accountId)}/balance`),
      history: (accountId: string, page: Page = {}) =>
        get<LedgerEntry[]>(`/transactions/accounts/${id(accountId)}/history`, { ...page }),
      transfer: (input: TransferInput, idempotencyKey: string) =>
        send<TransactionResult>('POST', '/transactions/transfer', input, { idempotencyKey }),
      beneficiaries: () => get<Beneficiary[]>('/transactions/beneficiaries'),
      addBeneficiary: (accountNumber: string, nickname: string) =>
        send<Beneficiary>('POST', '/transactions/beneficiaries', { accountNumber, nickname }),
      removeBeneficiary: (beneficiaryId: string) => send<undefined>('DELETE', `/transactions/beneficiaries/${id(beneficiaryId)}`),
      createWithdrawalCode: (accountId: string, amountInPaise: string) =>
        send<WithdrawalCode>('POST', '/transactions/withdrawal-codes', { accountId, amountInPaise }),
    },

    teller: {
      currentSession: () => get<TellerSession | null>('/transactions/teller/sessions/current'),
      acceptFloat: (countedFloatPaise: string) =>
        send<TellerSession>('POST', '/transactions/teller/sessions/accept', { countedFloatPaise }),
      closeSession: (countedCashPaise: string) =>
        send<TellerSession>('POST', '/transactions/teller/sessions/close', { countedCashPaise }),
      deposit: (input: CashInput, idempotencyKey: string) =>
        send<CashOperationResult>('POST', '/transactions/deposit', input, { idempotencyKey }),
      withdraw: (input: CashInput & { authorizationCode: string }, idempotencyKey: string) =>
        send<CashOperationResult>('POST', '/transactions/withdraw', input, { idempotencyKey }),
      cashOperations: (params: { status?: CashOperationStatus } & Page = {}) =>
        get<CashOperation[]>('/transactions/cash-operations', params),
    },

    supervisor: {
      sessions: (params: { status?: TellerSessionStatus } & Page = {}) => get<TellerSession[]>('/transactions/teller/sessions', params),
      issueFloat: (tellerId: string, openingFloatPaise: string) =>
        send<TellerSession>('POST', '/transactions/teller/sessions', { tellerId, openingFloatPaise }),
      cancelFloat: (sessionId: string) => send<{ id: string; status: 'CANCELLED' }>('POST', `/transactions/teller/sessions/${id(sessionId)}/cancel`),
      signOff: (sessionId: string, countedCashPaise: string) =>
        send<TellerSession>('POST', `/transactions/teller/sessions/${id(sessionId)}/sign-off`, { countedCashPaise }),
      approveCash: (cashOperationId: string, idempotencyKey: string) =>
        send<CashOperationResult>('POST', `/transactions/cash-operations/${id(cashOperationId)}/approve`, undefined, { idempotencyKey }),
      rejectCash: (cashOperationId: string) =>
        send<{ cashOperationId: string; status: 'REJECTED' }>('POST', `/transactions/cash-operations/${id(cashOperationId)}/reject`),
    },

    fraud: {
      alerts: (params: { status?: AlertStatus } & Page = {}) => get<FraudAlert[]>('/fraud/alerts', params),
      updateAlert: (alertId: string, status: AlertStatus, note?: string) =>
        send<FraudAlert>('PATCH', `/fraud/alerts/${id(alertId)}`, note ? { status, note } : { status }),
      history: (alertId: string) => get<FraudAlertEvent[]>(`/fraud/alerts/${id(alertId)}/history`),
    },

    notifications: {
      logs: (params: { recipient?: string } & Page = {}) => get<NotificationLog[]>('/notifications/logs', params),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;

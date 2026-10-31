import type { Role, StaffRole } from '@/lib/auth/session';

/** Every successful API response */
export interface Envelope<T> {
  success: true;
  data: T;
  pagination?: { limit: number; offset: number };
  message?: string;
}

export interface Page {
  limit?: number;
  offset?: number;
}

// --- auth -----------------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
}

/** In cookie transport the refresh token is never in the body */
export interface SessionTokens {
  accessToken: string;
  expiresInSeconds: number;
}

export interface LoginSuccess {
  user: PublicUser;
  tokens: SessionTokens;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

export type LoginResult = LoginSuccess | MfaChallenge;

export const isMfaChallenge = (result: LoginResult): result is MfaChallenge =>
  (result as MfaChallenge).mfaRequired === true;

export interface Me {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  passwordChangedAt: string | null;
  createdAt: string;
}

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
}

export interface StaffActivation {
  tokens: SessionTokens;
  enrolmentToken: string;
}

export type AdminRequestType = 'CREATE_STAFF' | 'SET_USER_ACTIVE' | 'RESET_MFA';
export type AdminRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminRequest {
  id: string;
  type: AdminRequestType;
  status: AdminRequestStatus;
  payload: { email?: string; role?: StaffRole; userId?: string; isActive?: boolean };
  targetUserId: string | null;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface DirectoryUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface QueuedRequest {
  requestId: string;
  status: AdminRequestStatus;
}

// --- customers ------------------------------------------------------------------------------

export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface CustomerProfile {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  address: string | null;
  dateOfBirth: string | null;
  kycStatus: KycStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  fullName: string;
  phoneNumber: string;
  address?: string;
  dateOfBirth?: string;
}

export interface KycEvent {
  id: string;
  userId: string;
  actorId: string;
  action: string;
  fromStatus: KycStatus | null;
  toStatus: KycStatus | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// --- accounts -------------------------------------------------------------------------------

export type AccountType = 'SAVINGS' | 'CURRENT';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface BankAccount {
  id: string;
  accountNumber: string;
  customerId: string;
  accountType: AccountType;
  status: AccountStatus;
  currency: 'INR';
  dailyLimitPaise: string;
  /** A limit set by the bank: the owner can lower the limit but not raise it above this */
  bankLimitCeilingPaise?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// --- ledger ---------------------------------------------------------------------------------

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'CASH_TRANSFER';

export interface Balance {
  accountId: string;
  balanceInPaise: string;
  currency: string;
}

export interface LedgerEntry {
  entryId: string;
  transactionId: string;
  referenceId: string;
  type: TransactionType;
  entryType: 'DEBIT' | 'CREDIT';
  amountInPaise: string;
  balanceAfterInPaise: string;
  description: string | null;
  createdAt: string;
}

export interface TransactionResult {
  transactionId: string;
  referenceId: string;
  type: TransactionType;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  amountInPaise: string;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  createdAt: string;
}

export interface TransferInput {
  sourceAccountId: string;
  destinationAccountId?: string;
  destinationAccountNumber?: string;
  amountInPaise: string;
  description?: string;
}

export interface Beneficiary {
  id: string;
  customerId: string;
  accountId: string;
  accountNumber: string;
  nickname: string;
  activatesAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface WithdrawalCode {
  authorizationCode: string;
  accountId: string;
  amountInPaise: string;
  expiresAt: string;
}

export type TellerSessionStatus = 'ISSUED' | 'OPEN' | 'CLOSED' | 'RECONCILED' | 'CANCELLED';

export interface TellerSession {
  id: string;
  tellerId: string;
  businessDate: string;
  /** Supervisor views only */
  drawerAccountId?: string;
  /** Hidden (null) from the teller while ISSUED: the float is counted blind */
  openingFloat: string | null;
  issuedBy: string | null;
  status: TellerSessionStatus;
  /** Supervisor views only, and only once RECONCILED: the counts are blind until sign-off */
  declaredClosing?: string | null;
  expectedClosing?: string | null;
  discrepancy?: string | null;
  /** A supervisor count that disagreed with the teller (supervisor views); a different admin can settle it */
  disputedBy?: string | null;
  disputedAt?: string | null;
  openedAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
}

export type CashOperationType = 'DEPOSIT' | 'WITHDRAWAL';
export type CashOperationStatus = 'PENDING_APPROVAL' | 'EXECUTED' | 'REJECTED';

export interface CashOperation {
  id: string;
  type: CashOperationType;
  status: CashOperationStatus;
  accountId: string;
  amountInPaise: string;
  description: string | null;
  requestedBy: string;
  approvedBy: string | null;
  decidedAt: string | null;
  transactionId: string | null;
  createdAt: string;
}

export type CashOperationResult =
  | { status: 'EXECUTED'; cashOperationId: string; transaction: TransactionResult }
  | { status: 'PENDING_APPROVAL'; cashOperationId: string };

export interface CashInput {
  accountId: string;
  amountInPaise: string;
  description?: string;
}

export interface AccountLookup {
  id: string;
  accountNumber: string;
  customerId: string;
  accountType: AccountType;
  status: AccountStatus;
}

// --- fraud & notifications ------------------------------------------------------------------

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface FraudAlert {
  id: string;
  transactionId: string;
  accountId: string;
  severity: RiskLevel;
  reason: string;
  status: AlertStatus;
  reviewedBy: string | null;
  initiatedBy: string | null;
  cashOperationId: string | null;
  closeRequestedBy: string | null;
  closeRequestedStatus: AlertStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface FraudAlertEvent {
  id: string;
  alertId: string;
  actorId: string;
  fromStatus: AlertStatus;
  toStatus: AlertStatus;
  note: string | null;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  recipient: string;
  channel: 'EMAIL' | 'SMS';
  subject: string;
  body: string;
  status: string;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

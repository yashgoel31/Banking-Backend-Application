import { BankAccount } from '../../generated/client';

export { getAuthenticatedUser, isStaff } from '@banksphere/common';

export type BankAccountView = Omit<BankAccount, 'dailyLimit' | 'bankLimitCeiling'> & {
  dailyLimit: string;
  dailyLimitPaise: string;
  /** Daily limit last set by the bank: the owner can raise the limit only up to this (and the customer cap) */
  bankLimitCeilingPaise: string | null;
};

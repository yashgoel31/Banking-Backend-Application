import {
  ArrowLeftRight,
  Banknote,
  BellRing,
  ClipboardCheck,
  HandCoins,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  ScanFace,
  Search,
  ShieldCheck,
  Siren,
  Stamp,
  UserRound,
  Users,
  Vault,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const security: NavItem = { to: '/settings/security', label: 'Security', icon: ShieldCheck };

export const NAVIGATION: Record<Role, NavSection[]> = {
  CUSTOMER: [
    { items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard }, { to: '/accounts', label: 'Accounts', icon: Wallet }] },
    {
      title: 'Move money',
      items: [
        { to: '/transfer', label: 'Transfer', icon: ArrowLeftRight },
        { to: '/payees', label: 'Payees', icon: Users },
        { to: '/cash-withdrawal', label: 'Cash withdrawal', icon: Banknote },
      ],
    },
    { title: 'Settings', items: [{ to: '/profile', label: 'Profile & KYC', icon: UserRound }, security] },
  ],
  TELLER: [
    {
      title: 'Branch',
      items: [
        { to: '/teller', label: 'Cash desk', icon: Landmark },
        { to: '/teller/operations', label: 'My operations', icon: ReceiptText },
      ],
    },
    { title: 'Settings', items: [security] },
  ],
  KYC_OFFICER: [
    {
      title: 'Compliance',
      items: [
        { to: '/kyc', label: 'KYC review', icon: ScanFace },
        { to: '/customers', label: 'Customers', icon: Search },
      ],
    },
    { title: 'Settings', items: [security] },
  ],
  FRAUD_ANALYST: [
    {
      title: 'Risk',
      items: [
        { to: '/fraud', label: 'Fraud alerts', icon: Siren },
        { to: '/notifications', label: 'Notification log', icon: BellRing },
      ],
    },
    { title: 'Settings', items: [security] },
  ],
  SUPPORT: [
    {
      title: 'Customers',
      items: [
        { to: '/customers', label: 'Customer lookup', icon: Search },
        { to: '/directory', label: 'User directory', icon: Users },
      ],
    },
    {
      title: 'Operations',
      items: [
        { to: '/teller-sessions', label: 'Teller sessions', icon: Vault },
        { to: '/cash-operations', label: 'Cash operations', icon: HandCoins },
        { to: '/fraud', label: 'Fraud alerts', icon: Siren },
        { to: '/notifications', label: 'Notification log', icon: BellRing },
      ],
    },
    { title: 'Settings', items: [security] },
  ],
  BANK_ADMIN: [
    {
      items: [
        { to: '/overview', label: 'Overview', icon: LayoutDashboard },
        { to: '/approvals', label: 'Approvals', icon: Stamp },
      ],
    },
    {
      title: 'Branch cash',
      items: [
        { to: '/teller-sessions', label: 'Teller sessions', icon: Vault },
        { to: '/cash-operations', label: 'Cash approvals', icon: HandCoins },
      ],
    },
    {
      title: 'People & accounts',
      items: [
        { to: '/directory', label: 'Staff & users', icon: Users },
        { to: '/customers', label: 'Customers', icon: Search },
        { to: '/kyc', label: 'KYC status', icon: ClipboardCheck },
      ],
    },
    {
      title: 'Oversight',
      items: [
        { to: '/fraud', label: 'Fraud alerts', icon: Siren },
        { to: '/notifications', label: 'Notification log', icon: BellRing },
      ],
    },
    { title: 'Settings', items: [security] },
  ],
};

export const HOME: Record<Role, string> = {
  CUSTOMER: '/dashboard',
  TELLER: '/teller',
  KYC_OFFICER: '/kyc',
  FRAUD_ANALYST: '/fraud',
  SUPPORT: '/customers',
  BANK_ADMIN: '/overview',
};

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Personal banking',
  TELLER: 'Teller',
  KYC_OFFICER: 'KYC officer',
  FRAUD_ANALYST: 'Fraud analyst',
  SUPPORT: 'Customer support',
  BANK_ADMIN: 'Bank administrator',
};

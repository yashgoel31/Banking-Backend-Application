import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, ShieldCheck, ShieldX } from 'lucide-react';
import type { CustomerProfile, KycStatus, ProfileInput } from '@/lib/api/types';
import { describeError, isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Callout, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, PageHeader, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { useProfile } from './hooks';
import { formatDate } from './lib';
import {
  normaliseName,
  profileSchema,
  toApiDate,
  toDateInput,
  type ProfileFormInput,
  type ProfileFormValues,
} from './profileSchema';

const FIELDS = ['fullName', 'phoneNumber', 'dateOfBirth', 'address'] as const;
type FieldName = (typeof FIELDS)[number];
type ProfileForm = UseFormReturn<ProfileFormInput, unknown, ProfileFormValues>;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Puts the bank's field errors next to the matching inputs; returns false if none matched */
function applyFieldErrors(form: ProfileForm, error: unknown): boolean {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return false;
  let matched = false;
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if ((FIELDS as readonly string[]).includes(field)) {
      form.setError(field as FieldName, { message }, { shouldFocus: !matched });
      matched = true;
    }
  }
  return matched;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const query = useProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile & KYC" description="Your personal details, and where your identity check stands." />
      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : query.isPending ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : query.data === null ? (
        <CreateProfile email={user?.email} />
      ) : (
        <>
          <KycStatusCard profile={query.data} />
          <EditProfile profile={query.data} email={user?.email} />
        </>
      )}
    </div>
  );
}

const KYC_COPY: Record<KycStatus, { title: string; body: string; icon: typeof ShieldCheck; tone: string }> = {
  VERIFIED: {
    title: 'Identity verified',
    body: 'You can open accounts and use every BankSphere service.',
    icon: ShieldCheck,
    tone: 'bg-success-soft text-success',
  },
  PENDING: {
    title: 'Verification in progress',
    body: 'We’re checking your details. You can open accounts once it’s done; any accounts you already have keep working meanwhile.',
    icon: Clock,
    tone: 'bg-warning-soft text-warning',
  },
  REJECTED: {
    title: 'We couldn’t verify your identity',
    body: 'Please contact the bank to find out what’s needed. If a detail below is wrong, correct it and we’ll check again.',
    icon: ShieldX,
    tone: 'bg-destructive-soft text-destructive',
  },
};

function KycStatusCard({ profile }: { profile: CustomerProfile }) {
  const copy = KYC_COPY[profile.kycStatus];
  const Icon = copy.icon;
  return (
    <Card role="region" aria-label="Identity verification">
      <div className="flex gap-4 p-5 sm:p-6">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', copy.tone)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold">{copy.title}</p>
            <StatusBadge status={profile.kycStatus} />
          </div>
          <p className="text-[13px] text-muted-foreground">{copy.body}</p>
          <p className="text-[12px] text-muted-foreground">Profile last updated {formatDate(profile.updatedAt)}</p>
        </div>
      </div>
    </Card>
  );
}

function EmailRow({ email }: { email: string | undefined }) {
  if (!email) return null;
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-medium">Email</p>
      <p className="text-sm">{email}</p>
      <p className="text-[12.5px] text-muted-foreground">Your sign-in email. Contact the bank to change it.</p>
    </div>
  );
}

function ProfileFields({ form, addressOptional }: { form: ProfileForm; addressOptional: boolean }) {
  const { errors } = form.formState;
  return (
    <>
      <Field label="Full name" error={errors.fullName?.message} hint="As it appears on your government ID">
        {(p) => <Input {...p} {...form.register('fullName')} autoComplete="name" maxLength={120} />}
      </Field>
      <Field label="Mobile number" error={errors.phoneNumber?.message} hint="With the country code, for example +91 98765 43210">
        {(p) => <Input {...p} {...form.register('phoneNumber')} type="tel" inputMode="tel" autoComplete="tel" />}
      </Field>
      <Field label="Date of birth" error={errors.dateOfBirth?.message}>
        {(p) => <Input {...p} {...form.register('dateOfBirth')} type="date" max={today()} autoComplete="bday" className="sm:max-w-[14rem]" />}
      </Field>
      <Field label="Address" optional={addressOptional} error={errors.address?.message} hint="Your home address, as on your ID">
        {(p) => <Textarea {...p} {...form.register('address')} autoComplete="street-address" maxLength={255} rows={3} />}
      </Field>
    </>
  );
}

function CreateProfile({ email }: { email: string | undefined }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const form: ProfileForm = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema({ requireDateOfBirth: true, keepAddress: false })),
    defaultValues: { fullName: '', phoneNumber: '', dateOfBirth: '', address: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setProblem(null);
    const address = values.address.trim();
    const input: ProfileInput = {
      fullName: values.fullName,
      phoneNumber: values.phoneNumber,
      dateOfBirth: toApiDate(values.dateOfBirth),
      ...(address ? { address } : {}),
    };
    try {
      const created = await api.customers.createMe(input);
      queryClient.setQueryData(qk.profile, created);
      notifySuccess('Profile created', 'We’ll verify your identity next. You can open accounts once it’s done.');
    } catch (error) {
      if (applyFieldErrors(form, error)) return;
      if (isApiError(error) && error.code === 'CONFLICT') {
        // Created meanwhile (another tab): show it
        void queryClient.invalidateQueries({ queryKey: qk.profile });
        return;
      }
      setProblem(describeError(error));
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Create your profile</CardTitle>
          <CardDescription>
            We need a few details to verify your identity, as banking rules require, before you can open an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <EmailRow email={email} />
          {problem ? (
            <Callout tone="danger" title={problem.title}>
              {problem.description}
            </Callout>
          ) : null}
          <ProfileFields form={form} addressOptional />
          <p className="text-[12.5px] text-muted-foreground">
            We use these details only to verify your identity and to contact you about your accounts.
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

const toForm = (profile: CustomerProfile): ProfileFormInput => ({
  fullName: profile.fullName,
  phoneNumber: profile.phoneNumber,
  dateOfBirth: toDateInput(profile.dateOfBirth),
  address: profile.address ?? '',
});

function EditProfile({ profile, email }: { profile: CustomerProfile; email: string | undefined }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const form: ProfileForm = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema({ requireDateOfBirth: Boolean(profile.dateOfBirth), keepAddress: Boolean(profile.address) })),
    defaultValues: toForm(profile),
  });
  const [name, dateOfBirth, address] = form.watch(['fullName', 'dateOfBirth', 'address']);
  const identityChanged =
    normaliseName(name ?? '') !== profile.fullName ||
    (dateOfBirth ?? '') !== toDateInput(profile.dateOfBirth) ||
    (address ?? '').trim() !== (profile.address ?? '');
  const resetsKyc = identityChanged && profile.kycStatus !== 'PENDING';

  const onSubmit = form.handleSubmit(async (values) => {
    setProblem(null);
    const changes: Partial<ProfileInput> = {};
    if (values.fullName !== profile.fullName) changes.fullName = values.fullName;
    if (values.phoneNumber !== profile.phoneNumber) changes.phoneNumber = values.phoneNumber;
    if (values.dateOfBirth && values.dateOfBirth !== toDateInput(profile.dateOfBirth)) changes.dateOfBirth = toApiDate(values.dateOfBirth);
    const newAddress = values.address.trim();
    if (newAddress && newAddress !== (profile.address ?? '')) changes.address = newAddress;
    if (Object.keys(changes).length === 0) {
      // Only spacing changed: nothing the bank would store differently
      form.reset(toForm(profile));
      return;
    }
    try {
      const updated = await api.customers.updateMe(changes);
      queryClient.setQueryData(qk.profile, updated);
      form.reset(toForm(updated));
      if (updated.kycStatus === 'PENDING' && profile.kycStatus !== 'PENDING') {
        notifySuccess('Profile sent for verification', 'We’ll check your updated details. Your accounts keep working meanwhile.');
      } else {
        notifySuccess('Profile updated');
      }
    } catch (error) {
      if (applyFieldErrors(form, error)) return;
      setProblem(describeError(error));
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Keep these up to date so we can reach you and keep your accounts secure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <EmailRow email={email} />
          {problem ? (
            <Callout tone="danger" title={problem.title}>
              {problem.description}
            </Callout>
          ) : null}
          <ProfileFields form={form} addressOptional={!profile.address} />
          {resetsKyc ? (
            <Callout tone="warning" title="This sends your profile back for verification">
              Changing your name, date of birth or address means we need to verify your identity again. Until then you can’t open new
              accounts, but your existing accounts keep working. Changing only your mobile number doesn’t need a new check.
            </Callout>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
          {form.formState.isDirty ? (
            <Button variant="ghost" onClick={() => form.reset(toForm(profile))} disabled={form.formState.isSubmitting}>
              Discard changes
            </Button>
          ) : null}
          <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            {resetsKyc ? 'Save and send for verification' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

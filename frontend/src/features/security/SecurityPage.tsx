import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff, UserRound } from 'lucide-react';
import { useAuth, useUser } from '@/lib/auth/AuthProvider';
import { isStaffRole } from '@/lib/auth/session';
import { describeError, isApiError } from '@/lib/api/errors';
import { qk } from '@/lib/query';
import { notifySuccess } from '@/lib/notify';
import { passwordSchema, totpSchema } from '@/lib/validation';
import { ROLE_LABEL } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { Field, OtpInput, PasswordInput } from '@/components/ui/input';
import { Badge, Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, DescriptionList, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/overlays';
import { ErrorState } from '@/components/ui/data';
import { PasswordChecklist } from '@/features/auth/components/PasswordFields';
import { AuthenticatorSetup } from './AuthenticatorSetup';

function Section({ icon, title, description, children, aside }: { icon: ReactNode; title: string; description: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card>
      <section aria-labelledby={`sec-${title}`}>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary [&_svg]:size-[18px]">{icon}</span>
            <div className="space-y-1">
              <CardTitle id={`sec-${title}`}>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {aside}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </section>
    </Card>
  );
}

const changeSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), password: passwordSchema, confirm: z.string().min(1, 'Confirm your new password') })
  .refine((v) => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] })
  .refine((v) => v.password !== v.currentPassword, { message: 'Choose a password you haven’t used here', path: ['password'] });
type ChangeValues = z.infer<typeof changeSchema>;

function ChangePassword() {
  const { api, applyTokens } = useAuth();
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const form = useForm<ChangeValues>({ resolver: zodResolver(changeSchema), defaultValues: { currentPassword: '', password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, password }) => {
    setProblem(null);
    try {
      const { tokens } = await api.auth.changePassword(currentPassword, password);
      applyTokens(tokens);
      form.reset();
      notifySuccess('Password updated', 'Every other device has been signed out.');
    } catch (error) {
      if (isApiError(error) && error.code === 'INVALID_PASSWORD') {
        form.setError('currentPassword', { message: 'The current password is incorrect' });
      } else if (isApiError(error) && error.code === 'PASSWORD_REUSED') {
        form.setError('password', { message: 'Choose a password you haven’t used here' });
      } else {
        setProblem(describeError(error));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
      {problem ? (
        <Callout tone="danger" title={problem.title}>
          {problem.description}
        </Callout>
      ) : null}
      <Field label="Current password" error={errors.currentPassword?.message}>
        {(p) => <PasswordInput {...p} {...form.register('currentPassword')} autoComplete="current-password" />}
      </Field>
      <Field label="New password" error={errors.password?.message}>
        {(p) => <PasswordInput {...p} {...form.register('password')} autoComplete="new-password" />}
      </Field>
      <PasswordChecklist value={form.watch('password')} />
      <Field label="Confirm new password" error={errors.confirm?.message}>
        {(p) => <PasswordInput {...p} {...form.register('confirm')} autoComplete="new-password" />}
      </Field>
      <div>
        <Button type="submit" loading={isSubmitting}>
          Update password
        </Button>
      </div>
    </form>
  );
}

const disableSchema = z.object({ password: z.string().min(1, 'Enter your password'), code: totpSchema });

function DisableMfaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { api, endLocalSession } = useAuth();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string>();
  const form = useForm<{ password: string; code: string }>({ resolver: zodResolver(disableSchema), defaultValues: { password: '', code: '' } });
  const onSubmit = form.handleSubmit(async ({ password, code }) => {
    setProblem(undefined);
    try {
      await api.auth.mfaDisable(password, code);
      // The server signed every session out
      endLocalSession();
      navigate('/login', { replace: true });
    } catch (error) {
      form.setValue('code', '');
      setProblem(
        isApiError(error) && (error.code === 'INVALID_PASSWORD' || error.code === 'INVALID_MFA_CODE')
          ? 'The password or code is incorrect.'
          : describeError(error).description
      );
    }
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !form.formState.isSubmitting && onOpenChange(next)}>
      <DialogContent size="sm">
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <DialogHeader
            title="Turn off two-factor authentication?"
            description="Your account will be protected by your password alone, high-value actions will be unavailable, and you’ll be signed out everywhere."
          />
          {problem ? <Callout tone="danger" title={problem} /> : null}
          <Field label="Password" error={form.formState.errors.password?.message}>
            {(p) => <PasswordInput {...p} {...form.register('password')} autoComplete="current-password" />}
          </Field>
          <Field label="Authenticator code" error={form.formState.errors.code?.message}>
            {(p) => <OtpInput {...p} value={form.watch('code')} onValueChange={(v) => form.setValue('code', v)} />}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Keep it on
            </Button>
            <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
              Turn off two-factor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TwoFactor({ enabled }: { enabled: boolean }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [settingUp, setSettingUp] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const staff = isStaffRole(user.role);

  if (enabled) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-success-soft/60 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Authenticator app is on</p>
              <p className="text-[13px] text-muted-foreground">
                {user.mfaSince ? `Added ${format(new Date(user.mfaSince * 1000), 'd MMM yyyy')}. ` : ''}
                Codes are required at sign-in and for high-value actions.
              </p>
            </div>
          </div>
          {staff ? null : (
            <Button variant="outline" size="sm" onClick={() => setDisabling(true)}>
              <ShieldOff aria-hidden="true" /> Turn off
            </Button>
          )}
        </div>
        {staff ? (
          <p className="text-[13px] text-muted-foreground">
            Two-factor authentication is required for all staff. If you lose your phone, two administrators must approve a reset.
          </p>
        ) : null}
        <DisableMfaDialog open={disabling} onOpenChange={setDisabling} />
      </div>
    );
  }

  if (settingUp) {
    return (
      <div className="max-w-xl">
        <AuthenticatorSetup
          onCancel={() => setSettingUp(false)}
          onComplete={() => {
            setSettingUp(false);
            void queryClient.invalidateQueries({ queryKey: qk.me });
            notifySuccess('Two-factor authentication is on', 'Other devices were signed out. Use your app’s code next time you sign in.');
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
      <div className="max-w-lg">
        <p className="text-sm font-medium">Protect your money with an authenticator app</p>
        <p className="text-[13px] text-muted-foreground">
          Needed for transfers of ₹1,00,000 or more, instant payees and large cash withdrawals.
        </p>
      </div>
      <Button onClick={() => setSettingUp(true)}>Set up authenticator</Button>
    </div>
  );
}

export default function SecurityPage() {
  const user = useUser();
  const { api, signOut } = useAuth();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: qk.me, queryFn: () => api.auth.me() });

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Manage how you sign in and keep your account protected." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section icon={<KeyRound aria-hidden="true" />} title="Password" description="Use a long, unique password. Changing it signs out your other devices.">
            <ChangePassword />
          </Section>
          <Section
            icon={<ShieldCheck aria-hidden="true" />}
            title="Two-factor authentication"
            description="A second step at sign-in using codes from your phone."
            aside={me.data ? <Badge tone={me.data.mfaEnabled ? 'success' : 'warning'} dot>{me.data.mfaEnabled ? 'On' : 'Off'}</Badge> : null}
          >
            {me.isPending ? <Skeleton className="h-20 w-full" /> : me.isError ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : <TwoFactor enabled={me.data.mfaEnabled} />}
          </Section>
        </div>
        <div className="space-y-6">
          <Section icon={<UserRound aria-hidden="true" />} title="Account" description="Your sign-in identity.">
            <DescriptionList
              items={[
                { label: 'Email', value: <span className="break-all">{user.email}</span> },
                { label: 'Role', value: ROLE_LABEL[user.role] },
                { label: 'Member since', value: me.data ? format(new Date(me.data.createdAt), 'd MMM yyyy') : '—' },
                {
                  label: 'Password changed',
                  value: me.data?.passwordChangedAt ? format(new Date(me.data.passwordChangedAt), 'd MMM yyyy') : 'Never',
                },
              ]}
            />
          </Section>
          <Section icon={<MonitorSmartphone aria-hidden="true" />} title="This device" description="Sessions end automatically after inactivity.">
            <Button
              variant="outline"
              block
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true, state: { signedOut: true } });
              }}
            >
              <LogOut aria-hidden="true" /> Sign out of this device
            </Button>
          </Section>
        </div>
      </div>
    </div>
  );
}

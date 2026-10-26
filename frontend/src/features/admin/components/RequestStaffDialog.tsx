import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { describeError, isApiError, type ErrorDescription } from '@/lib/api/errors';
import { qk } from '@/lib/query';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/overlays';
import { ROLE_INFO, STAFF_ROLES } from './roles';

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter their corporate email address')
    .max(254, 'Use at most 254 characters')
    .email('Enter a valid email address'),
  role: z.enum(STAFF_ROLES, { error: 'Choose a role' }),
});
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

/** Four-eyes staff onboarding: one administrator asks, a second approves, the colleague activates by email */
export function RequestStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setSent(null);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <DialogHeader
          icon={
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <UserPlus className="size-4" aria-hidden="true" />
            </span>
          }
          title="Request a new staff member"
          description="A second administrator must approve this before the account is created."
        />
        {sent ? (
          <Sent email={sent} onAnother={() => setSent(null)} onDone={() => close(false)} />
        ) : (
          <StaffForm onSent={setSent} onCancel={() => close(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Sent({ email, onAnother, onDone }: { email: string; onAnother: () => void; onDone: () => void }) {
  return (
    <>
      <Callout tone="success" title="Sent for approval">
        A second administrator must approve this request. Once approved, <strong>{email}</strong> receives an activation
        email to set their own password and authenticator. Administrators never see staff passwords.
      </Callout>
      <DialogFooter>
        <Button variant="outline" onClick={onAnother}>
          Request another
        </Button>
        <Button onClick={onDone} autoFocus>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function StaffForm({ onSent, onCancel }: { onSent: (email: string) => void; onCancel: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const id = useId();
  const [problem, setProblem] = useState<ErrorDescription | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const roleErrorId = `${id}-role-error`;

  const onSubmit = form.handleSubmit(async ({ email, role }) => {
    setProblem(null);
    try {
      await api.admin.requestStaff(email, role);
      void queryClient.invalidateQueries({ queryKey: qk.adminRequestsAll });
      onSent(email);
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === 'STAFF_EMAIL_DOMAIN') {
          // The service names the required domain ("…must use an @bank.example address"): more useful than the generic copy
          const message = error.message.includes('@') ? error.message : describeError(error).description;
          form.setError('email', { message }, { shouldFocus: true });
          return;
        }
        if (error.code === 'CONFLICT') {
          form.setError('email', { message: 'An account with this email already exists.' }, { shouldFocus: true });
          return;
        }
        if (error.code === 'INVALID_ROLE') {
          form.setError('role', { message: 'Choose one of the staff roles.' });
          return;
        }
        const fields = error.fieldErrors;
        if (error.code === 'VALIDATION_ERROR' && (fields.email || fields.role)) {
          if (fields.email) form.setError('email', { message: fields.email });
          if (fields.role) form.setError('role', { message: fields.role });
          return;
        }
      }
      setProblem(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {problem ? (
        <Callout tone="danger" title={problem.title}>
          {problem.description}
          {problem.reference ? ` (Ref: ${problem.reference})` : null}
        </Callout>
      ) : null}
      <Field
        label="Corporate email"
        error={errors.email?.message}
        hint="Their address on the bank’s email domain. The activation link is sent here."
      >
        {(p) => (
          <Input {...p} {...form.register('email')} type="email" inputMode="email" autoComplete="off" spellCheck={false} autoFocus />
        )}
      </Field>

      <fieldset aria-describedby={errors.role ? roleErrorId : undefined}>
        <legend className="text-[13px] font-medium text-foreground">Role</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {STAFF_ROLES.map((role) => {
            const info = ROLE_INFO[role];
            return (
              <label
                key={role}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50',
                  'focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-primary has-[:checked]:bg-primary-soft',
                  role === 'BANK_ADMIN' && 'sm:col-span-2'
                )}
              >
                <input
                  type="radio"
                  value={role}
                  {...form.register('role')}
                  aria-labelledby={`${id}-${role}-label`}
                  aria-describedby={`${id}-${role}-description`}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0 space-y-0.5">
                  <span id={`${id}-${role}-label`} className="block text-sm font-medium">
                    {info.label}
                  </span>
                  <span id={`${id}-${role}-description`} className="block text-[12.5px] leading-snug text-muted-foreground">
                    {info.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.role ? (
          <p id={roleErrorId} role="alert" className="mt-1.5 text-[13px] font-medium text-destructive">
            {errors.role.message}
          </p>
        ) : null}
      </fieldset>

      <p className="text-[13px] text-muted-foreground">
        Nobody chooses a password for them: once approved, they activate their own account from the email.
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Send for approval
        </Button>
      </DialogFooter>
    </form>
  );
}

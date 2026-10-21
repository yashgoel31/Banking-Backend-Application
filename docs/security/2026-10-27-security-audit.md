# Security audit — 27 October 2026

Scope: the whole backend (gateway, seven services, shared package, migrations, Docker/Kafka/Redis/Postgres
infrastructure) after three earlier review rounds. Four independent reviewers each traced every finding end to end
(route → middleware → service → SQL); each finding was then fixed test-first and verified on a real stack.

Severity: **High** = exploitable for money, identity or privilege, or a deploy-day outage; **Medium** = a control
that can be bypassed or a reliability failure under realistic conditions; **Low** = defence in depth, scale, hygiene.

Status legend: ✅ fixed and tested · 📄 documented limitation.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| S-01 | High | Gateway/all | Staff-network allowlist was path-based; many staff actions share customer paths (KYC decisions, account unfreeze/limits, staff reads). | _pending integration_ |
| S-02 | High | Kafka | Shared `<topic>.retry` topics let one service forge another's events; retry envelopes were trusted; bad retry messages stalled consumers forever. | _pending_ |
| S-03 | High | Ledger | A mismatched teller close was unrecoverable; the "blind" supervisor count could copy the teller's declared figure; mismatch audits were rolled back. | _pending_ |
| S-04 | High | Auth/UI | Wrong passwords on authenticated endpoints returned 401, so browsers treated them as expired sessions and signed people out. | _pending_ |
| S-05 | Med | Auth | The target of a four-eyes request could reject it (block their own disablement). | _pending_ |
| S-06 | Med | Auth | TOTP failure budget was check-then-act (parallel guesses exceeded it). | _pending_ |
| S-07 | Med | Auth | `/mfa/disable`, password change and MFA setup didn't count failed passwords/codes. | _pending_ |
| S-08 | Med | Auth | `mfa_enabled_at` was never backfilled: earlier MFA users could never pass step-up. | _pending_ |
| S-09 | Med | Accounts | A customer could immediately undo a bank-imposed daily-limit reduction. | _pending_ |
| S-10 | Med | Accounts/KYC | Some staff reads of customer data (KYC history, account list/detail) were not access-logged. | _pending_ |
| S-11 | Med | Ledger | New-payee first-day cap reset by removing and re-adding the payee; no notification when a payee is added. | _pending_ |
| S-12 | Med | Ledger | Wrong withdrawal codes made a transaction wait for a second pooled connection (pool exhaustion). | _pending_ |
| S-13 | Med | Ledger | Reconciliation would silently stop at scale (30 s statement timeout, no alert key). | _pending_ |
| S-14 | Med | Notifications | SMTP infrastructure errors (DNS, TLS, auth) treated as permanent: alerts lost. | _pending_ |
| S-15 | Med | Fraud | 1-paisa ping-pong transfers flooded HIGH alerts and security emails. | _pending_ |
| S-16 | Med | Fraud | Cash structuring across several tellers was not detected. | _pending_ |
| S-17 | Med | Fraud | Administrators (including the cash approver) could close fraud alerts. | _pending_ |
| S-18 | Med | Infra | Postgres healthcheck passed during initdb; `migrate` could fail on a fresh `up`. | _pending_ |
| S-19 | Med | Infra | Slow SMTP starved Kafka heartbeats; the public gateway waited on async services' health. | _pending_ |
| S-20 | Low | Ledger | Tellers could read their own drawer balance (the expected figure) and saw the issued float before counting. | _pending_ |
| S-21 | Low | Ledger | Unconditional session updates after unlocked reads (cancel/close races). | _pending_ |
| S-22 | Low | Ledger | Payee add limit raceable; failed look-ups free (account-number probing). | _pending_ |
| S-23 | Low | Ledger | Policy env values `''`/NaN silently disabled controls or caused 500s. | _pending_ |
| S-24 | Low | Accounts | Admin freeze of an already customer-frozen account wasn't recorded (single-admin unfreeze). | _pending_ |
| S-25 | Low | Accounts | Account-number space of 9 M; ledger collisions not retried. | _pending_ |
| S-26 | Low | Accounts | Ledger activation failure after commit returned 502 (duplicate accounts on retry). | _pending_ |
| S-27 | Low | Customers | Profile validation gaps (future DOB, zero-width/bidi characters). | _pending_ |
| S-28 | Low | Customers | Cache-aside race could cache a stale profile. | _pending_ |
| S-29 | Low | Auth | Expired admin requests stayed PENDING forever. | _pending_ |
| S-30 | Low | Auth | Anyone could pre-register a future staff email address. | _pending_ |
| S-31 | Low | Gateway | Upstream dying mid-response left the client hanging. | _pending_ |
| S-32 | Low | Auth | MFA-enable token created after commit (race with password reset). | _pending_ |
| S-33 | Low | Auth | Full token-version sync blocked start-up. | _pending_ |
| S-34 | Low | Notifications | Duplicate emails on retries; PII in logs; own-account transfer sent one notice. | _pending_ |
| S-35 | Low | Fraud | Rule windows unbounded and unindexed. | _pending_ |
| S-36 | Low | Outbox | Unbounded purge DELETE. | _pending_ |
| S-37 | Low | Infra | `CHANGE_ME` placeholders accepted as real secrets. | _pending_ |

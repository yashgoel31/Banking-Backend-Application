import { PrismaClient, NotificationStatus, NotificationChannel } from '../../generated/client';
import { EmailProvider } from '../providers/email.provider';
import {
  TransactionCompletedEvent,
  AccountCreatedEvent,
  AccountStatusChangedEvent,
  FraudAlertCreatedEvent,
  UserRegisteredEvent,
  WithdrawalCodeCreatedEvent,
  EmailDispatchOptions,
} from '../types';
import { MoneyUtil, TransientError, isTransientError, logger, redactEmails, redactErrorForLog } from '@banksphere/common';

export interface KafkaDLQPublisher {
  publish(topic: string, key: string, payload: any): Promise<void>;
}

export interface NotificationServiceOptions {
  securityTeamEmail?: string;
  dlqTopic?: string;
  /** After an SMTP infrastructure failure, no email is attempted for this long (then one probe) */
  smtpCircuitOpenMs?: number;
}

/** Outcome of one email: sent now, already sent (or settled) earlier, or permanently rejected */
export type DispatchOutcome = 'SENT' | 'ALREADY_SENT' | 'DEAD_LETTER';

/**
 * Masks an account number for display in emails: 100112345678 -> XXXXXXXX5678
 */
function maskAccountNumber(accountNumber: string): string {
  return accountNumber.length > 4 ? `${'X'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}` : accountNumber;
}

/** How long to keep retrying an event whose recipient's contact details haven't arrived yet */
const CONTACT_WAIT_MS = 15 * 60 * 1000;

/**
 * Circuit breaker for the mail server. While it is open no SMTP connection is attempted at all (each attempt
 * against a dead server costs its connection timeout); after the cool-down a single probe is let through.
 */
class SmtpCircuit {
  private openUntil = 0;
  private probing = false;

  constructor(private readonly openMs: number) {}

  /** True when this caller may talk to the mail server */
  public tryAcquire(): boolean {
    if (this.openUntil === 0) return true; // closed
    if (Date.now() < this.openUntil || this.probing) return false;
    this.probing = true; // half-open: exactly one probe
    return true;
  }

  /** The server answered (accepted or rejected this message) */
  public succeeded(): void {
    this.openUntil = 0;
    this.probing = false;
  }

  /** The mail infrastructure failed */
  public failed(): void {
    this.openUntil = Date.now() + this.openMs;
    this.probing = false;
  }

  /** A probe ended without reaching the server (e.g. the database failed first) */
  public release(): void {
    this.probing = false;
  }
}

function emailDomain(address: string): string | undefined {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : undefined;
}

export class NotificationService {
  private readonly securityTeamEmail: string;
  private readonly dlqTopic: string;
  private readonly smtpCircuit: SmtpCircuit;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailProvider: EmailProvider,
    private readonly dlqPublisher?: KafkaDLQPublisher | null,
    options: NotificationServiceOptions = {}
  ) {
    this.securityTeamEmail = options.securityTeamEmail ?? (process.env.SECURITY_ALERT_EMAIL || 'security-team@banksphere.com');
    this.dlqTopic = options.dlqTopic ?? (process.env.KAFKA_DLQ_TOPIC || 'notifications.dlq');
    this.smtpCircuit = new SmtpCircuit(options.smtpCircuitOpenMs ?? Number(process.env.SMTP_CIRCUIT_OPEN_MS || 30_000));
  }

  /**
   * Evaluates if a Kafka event was already processed to guarantee consumer idempotency
   */
  public async isEventProcessed(eventId: string): Promise<boolean> {
    const existing = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });
    return !!existing;
  }

  /**
   * Marks an event as processed. A unique violation means another consumer instance
   * finished the same event concurrently, which is fine for at-least-once delivery.
   */
  private async markEventProcessed(eventId: string, eventType: string): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: { eventId, eventType },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
    }
  }

  private async resolveEmail(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const contact = await this.prisma.userContact.findUnique({ where: { userId } });
    return contact?.email ?? null;
  }

  private async resolveAccountOwnerEmail(accountId?: string, customerId?: string): Promise<string | null> {
    if (customerId) return this.resolveEmail(customerId);
    if (!accountId) return null;
    const owner = await this.prisma.accountOwner.findUnique({ where: { accountId } });
    return this.resolveEmail(owner?.customerId);
  }

  /**
   * Events travel on different topics, so a transaction alert can arrive before the owner's
   * user.registered event. Retry for a while (transient) rather than silently dropping a mandatory alert.
   */
  private contactMissing(eventId: string, eventTimestamp: string | undefined): void {
    const age = Date.now() - new Date(eventTimestamp ?? Date.now()).getTime();
    if (age < CONTACT_WAIT_MS) {
      throw new TransientError(`Contact details not yet available for event ${eventId}`);
    }
    logger.error({ eventId, alert: 'NOTIFICATION_RECIPIENT_UNKNOWN' }, 'No contact on file for recipient; notification skipped');
  }

  /**
   * Handles 'user.registered.v1': maintains the local email directory (no email is sent).
   * Insert-only: an event can never overwrite an existing user's address (a forged or replayed event
   * must not be able to redirect someone's bank notifications).
   */
  public async handleUserRegistered(event: UserRegisteredEvent): Promise<boolean> {
    if (typeof event.userId !== 'string' || typeof event.email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(event.email)) {
      throw new Error('Malformed user.registered.v1 event');
    }
    const result = await this.prisma.userContact.createMany({
      data: [{ userId: event.userId, email: event.email }],
      skipDuplicates: true,
    });
    if (result.count === 0) {
      const existing = await this.prisma.userContact.findUnique({ where: { userId: event.userId } });
      if (existing && existing.email !== event.email) {
        logger.warn({ userId: event.userId, alert: 'CONTACT_OVERWRITE_ATTEMPT' }, 'Ignored user.registered.v1 with a different email');
      }
    }
    return true;
  }

  /**
   * Handles 'transaction.completed.v1' Kafka event idempotently: each party is told about their side
   */
  public async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<boolean> {
    if (await this.isEventProcessed(event.eventId)) {
      logger.info({ eventId: event.eventId }, 'Duplicate notification event skipped');
      return false;
    }

    const formattedAmount = MoneyUtil.formatINR(event.amountInPaise);
    // `side` is part of the delivery key: on a transfer between a customer's own accounts the same address
    // gets both the debit and the credit notice
    const parties: Array<{ email: string | null; direction: 'debited from' | 'credited to'; side: 'debit' | 'credit' }> = [];

    if (event.sourceAccountId) {
      parties.push({
        email: await this.resolveAccountOwnerEmail(event.sourceAccountId, event.sourceCustomerId),
        direction: 'debited from',
        side: 'debit',
      });
    }
    if (event.destinationAccountId) {
      parties.push({
        email: await this.resolveAccountOwnerEmail(event.destinationAccountId, event.destinationCustomerId),
        direction: 'credited to',
        side: 'credit',
      });
    }

    for (const party of parties) {
      if (!party.email) {
        this.contactMissing(event.eventId, event.timestamp);
        continue;
      }
      await this.dispatchEmail(
        event.eventId,
        event.eventType,
        {
          recipient: party.email,
          subject: `BankSphere Alert: ${formattedAmount} ${party.direction} your account`,
          body: `Dear Customer,\n\n${formattedAmount} has been ${party.direction} your account (${event.type}).\n\nTransaction Reference: ${event.referenceId}\nTimestamp: ${event.timestamp}\n\nIf you did not authorise this transaction, contact BankSphere immediately.\n\nThank you for banking with BankSphere.`,
          metadata: { transactionId: event.transactionId, referenceId: event.referenceId },
        },
        party.side
      );
    }

    await this.markEventProcessed(event.eventId, event.eventType);
    return true;
  }

  /**
   * Handles 'account.created.v1' Kafka event idempotently
   */
  public async handleAccountCreated(event: AccountCreatedEvent): Promise<boolean> {
    // Always refresh the read model, even for a duplicate event (insert-only, idempotent)
    await this.prisma.accountOwner.createMany({
      data: [{ accountId: event.accountId, customerId: event.customerId, accountNumber: event.accountNumber }],
      skipDuplicates: true,
    });

    if (await this.isEventProcessed(event.eventId)) {
      logger.info({ eventId: event.eventId }, 'Duplicate notification event skipped');
      return false;
    }

    const recipient = await this.resolveEmail(event.customerId);
    if (recipient) {
      await this.dispatchEmail(event.eventId, event.eventType, {
        recipient,
        subject: 'Welcome to BankSphere! Your New Account Details',
        body: `Dear Customer,\n\nYour new ${event.accountType} account has been successfully opened!\n\nAccount Number: ${maskAccountNumber(event.accountNumber)}\nCurrency: ${event.currency}\n\nThank you for choosing BankSphere.`,
        metadata: { accountId: event.accountId },
      });
    } else {
      this.contactMissing(event.eventId, event.timestamp);
    }

    await this.markEventProcessed(event.eventId, event.eventType);
    return true;
  }

  /**
   * Handles 'account.status.changed.v1': tells the customer their account was frozen / unfrozen / closed
   */
  public async handleAccountStatusChanged(event: AccountStatusChangedEvent): Promise<boolean> {
    if (await this.isEventProcessed(event.eventId)) {
      return false;
    }

    const recipient = await this.resolveEmail(event.customerId);
    if (recipient) {
      await this.dispatchEmail(event.eventId, event.eventType, {
        recipient,
        subject: `BankSphere: your account is now ${event.status}`,
        body: `Dear Customer,\n\nThe status of one of your accounts changed from ${event.previousStatus} to ${event.status}.\n\nIf you did not request this change, contact BankSphere immediately.`,
        metadata: { accountId: event.accountId },
      });
    } else {
      this.contactMissing(event.eventId, event.timestamp);
    }

    await this.markEventProcessed(event.eventId, event.eventType);
    return true;
  }

  /** A cash withdrawal code was created: tell the customer, in case it wasn't them */
  public async handleWithdrawalCodeCreated(event: WithdrawalCodeCreatedEvent): Promise<boolean> {
    if (await this.isEventProcessed(event.eventId)) {
      return false;
    }
    const recipient = await this.resolveEmail(event.customerId);
    if (recipient) {
      await this.dispatchEmail(event.eventId, event.eventType, {
        recipient,
        subject: 'BankSphere: a cash withdrawal code was created',
        body: `Dear Customer,\n\nA one-time code to withdraw ${MoneyUtil.formatINR(event.amountInPaise)} in cash at a branch was created from your online banking session. It expires at ${event.expiresAt}.\n\nIf this was not you, contact BankSphere immediately and change your password.`,
        metadata: { accountId: event.accountId },
      });
    } else {
      this.contactMissing(event.eventId, event.timestamp);
    }
    await this.markEventProcessed(event.eventId, event.eventType);
    return true;
  }

  /**
   * Handles 'fraud.alert.created.v1' Kafka event idempotently
   */
  public async handleFraudAlert(event: FraudAlertCreatedEvent): Promise<boolean> {
    if (await this.isEventProcessed(event.eventId)) {
      logger.info({ eventId: event.eventId }, 'Duplicate notification event skipped');
      return false;
    }

    const emailOptions: EmailDispatchOptions = {
      recipient: this.securityTeamEmail,
      subject: `URGENT SECURITY ALERT: [${event.severity}] Risk Activity Detected`,
      body: `Security Operations team,\n\nA transaction has triggered risk rule evaluation.\n\nTransaction ID: ${event.transactionId}\nAccount ID: ${event.accountId}\nSeverity: ${event.severity}\nReason: ${event.reason}\n\nPlease review immediately.`,
      metadata: { alertId: event.alertId, transactionId: event.transactionId },
    };

    await this.dispatchEmail(event.eventId, event.eventType, emailOptions);
    await this.markEventProcessed(event.eventId, event.eventType);
    return true;
  }

  /**
   * Sends one email for (event, recipient[, purpose]) at most once across retries, redeliveries and
   * concurrent consumers. One SMTP attempt per Kafka try: the consumer's in-place retries and delayed-retry
   * topic do the retrying (with heartbeats), so a slow or dead mail server can't hold a partition.
   * - the delivery is CLAIMED (unique row) before sending, so a redelivered message never sends it again
   * - sent -> SENT log
   * - mail infrastructure failure (down, DNS/TLS/auth/protocol, 4xx) -> claim released and TransientError:
   *   the Kafka message is retried later and the event is NOT marked processed. While the SMTP circuit is
   *   open nothing is attempted at all.
   * - permanent rejection of this message (bad recipient, 5xx on RCPT/DATA) -> DEAD_LETTER log + notifications.dlq
   * `purpose` tells several emails of one event to the same address apart (e.g. the debit and credit notices).
   */
  public async dispatchEmail(
    eventId: string,
    eventType: string,
    options: EmailDispatchOptions,
    purpose?: string
  ): Promise<DispatchOutcome> {
    const deliveryKey = purpose ? `${eventId}:${purpose}` : eventId;
    if (!this.smtpCircuit.tryAcquire()) {
      // The mail server is known to be down: don't spend a connection timeout on every message
      throw new TransientError('SMTP circuit open: email not attempted');
    }

    try {
      try {
        await this.prisma.notificationDelivery.create({ data: { eventId: deliveryKey, recipient: options.recipient } });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        logger.info({ eventId, eventType, purpose }, 'Notification already sent (or settled) for this recipient; not resending');
        return 'ALREADY_SENT';
      }

      try {
        await this.emailProvider.sendEmail(options);
      } catch (err: any) {
        if (isTransientError(err)) {
          this.smtpCircuit.failed();
          await this.releaseClaim(eventId, deliveryKey, options.recipient);
          logger.warn({ eventId, eventType, err: redactErrorForLog(err) }, 'Email not sent: mail infrastructure unavailable; will retry');
          // The mail server (not the message) is the problem: let Kafka retry later, never dead-letter
          throw new TransientError(`Email provider unavailable: ${redactEmails(String(err?.message ?? err))}`);
        }
        this.smtpCircuit.succeeded(); // the server is up: it rejected this particular message
        await this.deadLetter(eventId, eventType, options, err);
        return 'DEAD_LETTER';
      }

      this.smtpCircuit.succeeded();
      try {
        await this.prisma.notificationLog.create({
          data: {
            recipient: options.recipient,
            channel: NotificationChannel.EMAIL,
            subject: options.subject,
            body: options.body,
            status: NotificationStatus.SENT,
            retryCount: 0,
            metadata: options.metadata,
          },
        });
      } catch (err) {
        // The email went out and its delivery is claimed: a missing audit row must never trigger a resend
        logger.error(
          { eventId, eventType, err: redactErrorForLog(err), alert: 'NOTIFICATION_LOG_WRITE_FAILED' },
          'Email sent but its audit log row could not be written'
        );
      }
      return 'SENT';
    } finally {
      this.smtpCircuit.release();
    }
  }

  /** Frees a delivery claim after a transient failure so a later try can send the email */
  private async releaseClaim(eventId: string, deliveryKey: string, recipient: string): Promise<void> {
    try {
      await this.prisma.notificationDelivery.deleteMany({ where: { eventId: deliveryKey, recipient } });
    } catch (err) {
      logger.error(
        { eventId, deliveryKey, err: redactErrorForLog(err), alert: 'NOTIFICATION_CLAIM_STUCK' },
        'Could not release a delivery claim; the email is not retried until its notification_deliveries row is removed'
      );
    }
  }

  /**
   * Records a permanently rejected email. The recipient stays in notification_logs (the staff-only audit
   * table); error text and the notifications.dlq payload carry no address: the DLQ references the log row.
   */
  private async deadLetter(eventId: string, eventType: string, options: EmailDispatchOptions, err: unknown): Promise<void> {
    const reason = redactEmails(String((err as any)?.message || 'Email delivery failure')).slice(0, 1000);
    logger.error({ eventId, eventType, err: redactErrorForLog(err) }, 'Permanent notification failure. Routing to Dead-Letter Queue.');

    const log = await this.prisma.notificationLog.create({
      data: {
        recipient: options.recipient,
        channel: NotificationChannel.EMAIL,
        subject: options.subject,
        body: options.body,
        status: NotificationStatus.DEAD_LETTER,
        retryCount: 0,
        lastError: reason,
        metadata: options.metadata,
      },
    });

    if (this.dlqPublisher) {
      try {
        await this.dlqPublisher.publish(this.dlqTopic, eventId, {
          originalEventId: eventId,
          originalEventType: eventType,
          notificationLogId: log?.id,
          failureReason: reason,
          recipientDomain: emailDomain(options.recipient),
          subject: options.subject,
          failedAt: new Date().toISOString(),
        });
      } catch (dlqErr) {
        logger.error({ err: redactErrorForLog(dlqErr), eventId }, 'Failed to publish message to DLQ topic');
      }
    }
  }

  /**
   * Queries notification history for audit
   */
  public async getNotificationLogs(recipient?: string, limit = 20, offset = 0) {
    return this.prisma.notificationLog.findMany({
      where: recipient ? { recipient } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}

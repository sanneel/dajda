import type { Prisma } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { prisma } from './db';

/**
 * Append-only audit trail.
 *
 * Accepts a transaction client so that an audit row is written in the same
 * transaction as the change it describes - an action and its log entry either
 * both land or neither does.
 */

export const AUDIT_ACTIONS = {
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_SUSPENDED: 'user.suspended',
  USER_REINSTATED: 'user.reinstated',
  USER_ROLE_CHANGED: 'user.role_changed',
  /** The owner closed their own account; distinct from an admin suspension. */
  USER_CLOSED_ACCOUNT: 'user.closed_account',
  /**
   * A Google identity was attached to an existing password account. Changes
   * who can open the account, so it is logged like a password change.
   */
  USER_GOOGLE_LINKED: 'user.google_linked',

  ANALYST_APPLIED: 'analyst.applied',
  ANALYST_APPROVED: 'analyst.approved',
  ANALYST_REJECTED: 'analyst.rejected',
  ANALYST_SUSPENDED: 'analyst.suspended',

  /** The analyst set their subscription price - money-facing, so audited. */
  PLAN_CREATED: 'plan.created',
  PLAN_REPRICED: 'plan.repriced',

  PREDICTION_CREATED: 'prediction.created',
  PREDICTION_PUBLISHED: 'prediction.published',
  PREDICTION_EDIT_REJECTED: 'prediction.edit_rejected',
  /** The author declared the event over and handed the bet to an admin. */
  PREDICTION_FINISHED: 'prediction.finished',
  PREDICTION_CORRECTED: 'prediction.corrected',
  PREDICTION_SETTLED: 'prediction.settled',

  POST_PUBLISHED: 'post.published',
  POST_DELETED: 'post.deleted',
  /** An analyst opened a live session; this is what notifies their audience. */
  LIVE_ANNOUNCED: 'live.announced',

  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  /** A gateway-scheduled charge extended the paid period. */
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
  SUBSCRIPTION_EXPIRED: 'subscription.expired',

  PAYMENT_CREATED: 'payment.created',
  TICKET_PURCHASED: 'ticket.purchased',
  TICKET_PURCHASE_REVOKED: 'ticket.purchase_revoked',
  PAYMENT_STATUS_CHANGED: 'payment.status_changed',
  PAYMENT_WEBHOOK_RECEIVED: 'payment.webhook_received',
  PAYMENT_WEBHOOK_REJECTED: 'payment.webhook_rejected',
  PAYMENT_REFUNDED: 'payment.refunded',

  BALANCE_CREDITED: 'balance.credited',
  BALANCE_DEBITED: 'balance.debited',

  PAYOUT_REQUESTED: 'payout.requested',
  PAYOUT_SENT: 'payout.sent',
  PAYOUT_REJECTED: 'payout.rejected',
  PAYOUT_FAILED: 'payout.failed',

  REPORT_FILED: 'report.filed',
  REPORT_RESOLVED: 'report.resolved',

  TELEGRAM_LINKED: 'telegram.linked',
  TELEGRAM_UNLINKED: 'telegram.unlinked',
  /** An analyst wrote to their whole audience. Capped, so worth logging. */
  BROADCAST_SENT: 'broadcast.sent',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  actorId?: string | null;
  actorRole?: UserRole | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export async function writeAuditLog(
  input: AuditInput,
  client: AuditClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    },
  });
}

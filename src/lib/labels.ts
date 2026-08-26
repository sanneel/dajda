import {
  AnalystStatus,
  BalanceEntryKind,
  BillingPeriod,
  ConfidenceLevel,
  EditOutcome,
  PaymentStatus,
  PayoutStatus,
  PlanTier,
  PredictionStatus,
  PredictionVisibility,
  ReportReason,
  ReportStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from '@/generated/prisma/enums';

/**
 * Georgian display strings for every enum. Kept in one place so the UI never
 * hand-writes a translation and no enum can be rendered raw.
 *
 * This module imports only from the generated `enums` file (plain objects, no
 * Node built-ins), so it is safe in client components.
 */

export const PREDICTION_STATUS_KA: Record<PredictionStatus, string> = {
  PENDING: 'მოლოდინში',
  WON: 'დაჯდა',
  LOST: 'ვერ დაჯდა',
  VOID: 'ბათილი',
  PUSH: 'დაბრუნებული',
};

export const PREDICTION_VISIBILITY_KA: Record<PredictionVisibility, string> = {
  PUBLIC: 'ღია',
  PREMIUM: 'Premium',
  VIP: 'VIP',
};

export const CONFIDENCE_KA: Record<ConfidenceLevel, string> = {
  LOW: 'დაბალი',
  MEDIUM: 'საშუალო',
  HIGH: 'მაღალი',
};

export const ANALYST_STATUS_KA: Record<AnalystStatus, string> = {
  PENDING: 'განხილვის პროცესში',
  APPROVED: 'დამოწმებული',
  REJECTED: 'უარყოფილი',
  SUSPENDED: 'შეჩერებული',
};

export const USER_ROLE_KA: Record<UserRole, string> = {
  USER: 'მომხმარებელი',
  ANALYST: 'ანალიტიკოსი',
  ADMIN: 'ადმინისტრატორი',
};

export const USER_STATUS_KA: Record<UserStatus, string> = {
  ACTIVE: 'აქტიური',
  SUSPENDED: 'შეჩერებული',
  DELETED: 'წაშლილი',
};

export const PLAN_TIER_KA: Record<PlanTier, string> = {
  FREE: 'უფასო',
  PREMIUM: 'Premium',
  VIP: 'VIP',
};

export const BILLING_PERIOD_KA: Record<BillingPeriod, string> = {
  MONTHLY: 'თვეში',
  QUARTERLY: 'კვარტალში',
};

export const BALANCE_KIND_KA: Record<BalanceEntryKind, string> = {
  TOPUP: 'შევსება',
  SUBSCRIPTION_PAYMENT: 'გამოწერის გადახდა',
  TOPUP_REVERSAL: 'შევსების დაბრუნება',
  ADJUSTMENT: 'კორექცია',
  ANALYST_EARNING: 'დარიცხვა გამომწერისგან',
  ANALYST_EARNING_REVERSAL: 'დარიცხვის დაბრუნება',
  WITHDRAWAL: 'გატანა',
  WITHDRAWAL_REVERSAL: 'გატანის დაბრუნება',
};

export const PAYOUT_STATUS_KA: Record<PayoutStatus, string> = {
  REQUESTED: 'მოთხოვნილი',
  APPROVED: 'დამტკიცებული',
  PAID: 'გატანილი',
  REJECTED: 'უარყოფილი',
  FAILED: 'ვერ შესრულდა',
};

export const SUBSCRIPTION_STATUS_KA: Record<SubscriptionStatus, string> = {
  PENDING: 'დადასტურების მოლოდინში',
  ACTIVE: 'აქტიური',
  CANCELED: 'გაუქმებული',
  EXPIRED: 'ვადაგასული',
  PAST_DUE: 'გადაუხდელი',
};

export const PAYMENT_STATUS_KA: Record<PaymentStatus, string> = {
  CREATED: 'შექმნილი',
  PROCESSING: 'მუშავდება',
  SUCCEEDED: 'წარმატებული',
  FAILED: 'ვერ შესრულდა',
  CANCELED: 'გაუქმებული',
  REFUNDED: 'დაბრუნებული',
  DISPUTED: 'სადავო',
  EXPIRED: 'ვადაგასული',
};

export const EDIT_OUTCOME_KA: Record<EditOutcome, string> = {
  APPLIED: 'შესრულდა',
  REJECTED_IMMUTABLE: 'უარყოფილი: უცვლელი ჩანაწერი',
  APPLIED_AS_CORRECTION: 'შესრულდა როგორც შესწორება',
};

export const REPORT_REASON_KA: Record<ReportReason, string> = {
  MISLEADING_RESULT: 'შედეგი შეცდომაში შემყვანია',
  SPAM: 'სპამი',
  ABUSIVE_CONTENT: 'შეურაცხმყოფელი შინაარსი',
  IMPERSONATION: 'სხვისი სახელით წარდგენა',
  GUARANTEED_PROFIT_CLAIM: 'გარანტირებული მოგების დაპირება',
  OTHER: 'სხვა',
};

export const REPORT_STATUS_KA: Record<ReportStatus, string> = {
  OPEN: 'ახალი',
  REVIEWING: 'განიხილება',
  RESOLVED: 'დახურული',
  DISMISSED: 'უარყოფილი',
};

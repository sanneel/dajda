-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ANALYST', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AnalystStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'PUSH');

-- CreateEnum
CREATE TYPE "PredictionVisibility" AS ENUM ('PUBLIC', 'PREMIUM', 'VIP');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('RESOLVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "TeamScope" AS ENUM ('HOME', 'AWAY', 'BOTH', 'MATCH', 'PLAYER');

-- CreateEnum
CREATE TYPE "MarketPeriod" AS ENUM ('FULL_MATCH', 'FIRST_HALF', 'SECOND_HALF', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4', 'OVERTIME');

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('OVER', 'UNDER', 'YES', 'NO', 'HOME', 'DRAW', 'AWAY', 'EXACT');

-- CreateEnum
CREATE TYPE "SettlementRule" AS ENUM ('OVER_UNDER_LINE', 'BINARY_OCCURRENCE', 'THREE_WAY_RESULT', 'EXACT_VALUE', 'PLAYER_STAT_LINE');

-- CreateEnum
CREATE TYPE "EditOutcome" AS ENUM ('APPLIED', 'REJECTED_IMMUTABLE', 'APPLIED_AS_CORRECTION');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM', 'VIP');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'DISPUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransitionSource" AS ENUM ('WEBHOOK', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('ANALYST', 'PREDICTION');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('MISLEADING_RESULT', 'SPAM', 'ABUSIVE_CONTENT', 'IMPERSONATION', 'GUARANTEED_PROFIT_CLAIM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "ageConfirmedAt" TIMESTAMP(3),
    "telegramUsername" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalystProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "headline" TEXT,
    "status" "AnalystStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "rejectionReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalystSport" (
    "analystProfileId" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystSport_pkey" PRIMARY KEY ("analystProfileId","sportId")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameKa" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameKa" TEXT NOT NULL,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "externalRef" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalMarket" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameKa" TEXT NOT NULL,
    "descriptionKa" TEXT,
    "sportId" UUID,
    "settlementRule" "SettlementRule" NOT NULL,
    "requiresLine" BOOLEAN NOT NULL DEFAULT false,
    "requiresPlayer" BOOLEAN NOT NULL DEFAULT false,
    "allowedScopes" "TeamScope"[],
    "allowedSelections" "SelectionType"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMarketMapping" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "sportId" UUID NOT NULL,
    "canonicalMarketId" UUID NOT NULL,
    "teamScope" "TeamScope" NOT NULL,
    "period" "MarketPeriod" NOT NULL,
    "defaultLineMilli" INTEGER,
    "defaultSelection" "SelectionType",
    "playerScoped" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" UUID,
    "supersededAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderMarketMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "providerId" UUID,
    "rawLabel" TEXT,
    "canonicalMarketId" UUID,
    "mappingId" UUID,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "teamScope" "TeamScope" NOT NULL,
    "period" "MarketPeriod" NOT NULL,
    "playerName" TEXT,
    "lineMilli" INTEGER,
    "selection" "SelectionType" NOT NULL,
    "oddsMilli" INTEGER NOT NULL,
    "stakeUnitsCenti" INTEGER NOT NULL DEFAULT 100,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "titleKa" TEXT NOT NULL,
    "analysisKa" TEXT NOT NULL,
    "visibility" "PredictionVisibility" NOT NULL DEFAULT 'PUBLIC',
    "publishedAt" TIMESTAMP(3),
    "matchStartsAt" TIMESTAMP(3) NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "correctionOfId" UUID,
    "supersededAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionResult" (
    "id" UUID NOT NULL,
    "predictionId" UUID NOT NULL,
    "outcome" "PredictionStatus" NOT NULL,
    "profitUnitsCenti" INTEGER NOT NULL,
    "actualValueMilli" INTEGER,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementSource" TEXT NOT NULL,
    "note" TEXT,
    "settledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionEdit" (
    "id" UUID NOT NULL,
    "predictionId" UUID NOT NULL,
    "actorId" UUID,
    "outcome" "EditOutcome" NOT NULL,
    "reason" TEXT,
    "changedFields" TEXT[],
    "previousValue" JSONB,
    "attemptedValue" JSONB,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "PredictionEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionView" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "predictionId" UUID NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedAnalyst" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "analystProfileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAnalyst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" UUID NOT NULL,
    "analystProfileId" UUID,
    "tier" "PlanTier" NOT NULL,
    "nameKa" TEXT NOT NULL,
    "descriptionKa" TEXT NOT NULL,
    "featuresKa" TEXT[],
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID,
    "subscriptionId" UUID,
    "providerCode" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "failureReason" TEXT,
    "maskedCard" TEXT,
    "cardType" TEXT,
    "rrn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatusTransition" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus" "PaymentStatus" NOT NULL,
    "source" "TransitionSource" NOT NULL,
    "reason" TEXT,
    "webhookEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentStatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "providerCode" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingResult" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporterId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "analystProfileId" UUID,
    "predictionId" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emailOnNewPrediction" BOOLEAN NOT NULL DEFAULT true,
    "emailOnSettlement" BOOLEAN NOT NULL DEFAULT true,
    "emailProductUpdates" BOOLEAN NOT NULL DEFAULT false,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramUsername" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalystProfile_userId_key" ON "AnalystProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalystProfile_slug_key" ON "AnalystProfile"("slug");

-- CreateIndex
CREATE INDEX "AnalystProfile_status_idx" ON "AnalystProfile"("status");

-- CreateIndex
CREATE INDEX "AnalystProfile_createdAt_idx" ON "AnalystProfile"("createdAt");

-- CreateIndex
CREATE INDEX "AnalystSport_sportId_idx" ON "AnalystSport"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_code_key" ON "Sport"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE INDEX "League_sportId_idx" ON "League"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "League_sportId_slug_key" ON "League"("sportId", "slug");

-- CreateIndex
CREATE INDEX "Match_startsAt_idx" ON "Match"("startsAt");

-- CreateIndex
CREATE INDEX "Match_leagueId_startsAt_idx" ON "Match"("leagueId", "startsAt");

-- CreateIndex
CREATE INDEX "Match_sportId_startsAt_idx" ON "Match"("sportId", "startsAt");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalMarket_code_key" ON "CanonicalMarket"("code");

-- CreateIndex
CREATE INDEX "CanonicalMarket_sportId_idx" ON "CanonicalMarket"("sportId");

-- CreateIndex
CREATE INDEX "CanonicalMarket_isActive_idx" ON "CanonicalMarket"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_code_key" ON "Provider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMarketMapping_supersededById_key" ON "ProviderMarketMapping"("supersededById");

-- CreateIndex
CREATE INDEX "ProviderMarketMapping_providerId_isActive_idx" ON "ProviderMarketMapping"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ProviderMarketMapping_normalizedLabel_idx" ON "ProviderMarketMapping"("normalizedLabel");

-- CreateIndex
CREATE INDEX "ProviderMarketMapping_canonicalMarketId_idx" ON "ProviderMarketMapping"("canonicalMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMarketMapping_providerId_sportId_normalizedLabel_pe_key" ON "ProviderMarketMapping"("providerId", "sportId", "normalizedLabel", "period", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_correctionOfId_key" ON "Prediction"("correctionOfId");

-- CreateIndex
CREATE INDEX "Prediction_status_idx" ON "Prediction"("status");

-- CreateIndex
CREATE INDEX "Prediction_publishedAt_idx" ON "Prediction"("publishedAt");

-- CreateIndex
CREATE INDEX "Prediction_authorId_status_idx" ON "Prediction"("authorId", "status");

-- CreateIndex
CREATE INDEX "Prediction_authorId_publishedAt_idx" ON "Prediction"("authorId", "publishedAt");

-- CreateIndex
CREATE INDEX "Prediction_sportId_status_idx" ON "Prediction"("sportId", "status");

-- CreateIndex
CREATE INDEX "Prediction_leagueId_idx" ON "Prediction"("leagueId");

-- CreateIndex
CREATE INDEX "Prediction_matchId_idx" ON "Prediction"("matchId");

-- CreateIndex
CREATE INDEX "Prediction_resolutionStatus_idx" ON "Prediction"("resolutionStatus");

-- CreateIndex
CREATE INDEX "Prediction_visibility_idx" ON "Prediction"("visibility");

-- CreateIndex
CREATE INDEX "Prediction_matchStartsAt_idx" ON "Prediction"("matchStartsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionResult_predictionId_key" ON "PredictionResult"("predictionId");

-- CreateIndex
CREATE INDEX "PredictionResult_settledAt_idx" ON "PredictionResult"("settledAt");

-- CreateIndex
CREATE INDEX "PredictionResult_outcome_idx" ON "PredictionResult"("outcome");

-- CreateIndex
CREATE INDEX "PredictionEdit_predictionId_attemptedAt_idx" ON "PredictionEdit"("predictionId", "attemptedAt");

-- CreateIndex
CREATE INDEX "PredictionEdit_outcome_idx" ON "PredictionEdit"("outcome");

-- CreateIndex
CREATE INDEX "PredictionView_userId_viewedAt_idx" ON "PredictionView"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionView_userId_predictionId_key" ON "PredictionView"("userId", "predictionId");

-- CreateIndex
CREATE INDEX "SavedAnalyst_analystProfileId_idx" ON "SavedAnalyst"("analystProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedAnalyst_userId_analystProfileId_key" ON "SavedAnalyst"("userId", "analystProfileId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_analystProfileId_tier_key" ON "SubscriptionPlan"("analystProfileId", "tier");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "UserSubscription_status_currentPeriodEnd_idx" ON "UserSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "UserSubscription_planId_idx" ON "UserSubscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerCode_providerPaymentId_key" ON "Payment"("providerCode", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentStatusTransition_paymentId_createdAt_idx" ON "PaymentStatusTransition"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_signatureValid_idx" ON "WebhookEvent"("signatureValid");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_providerCode_eventId_key" ON "WebhookEvent"("providerCode", "eventId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_idx" ON "Report"("targetType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystProfile" ADD CONSTRAINT "AnalystProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystProfile" ADD CONSTRAINT "AnalystProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystSport" ADD CONSTRAINT "AnalystSport_analystProfileId_fkey" FOREIGN KEY ("analystProfileId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystSport" ADD CONSTRAINT "AnalystSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalMarket" ADD CONSTRAINT "CanonicalMarket_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMarketMapping" ADD CONSTRAINT "ProviderMarketMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMarketMapping" ADD CONSTRAINT "ProviderMarketMapping_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMarketMapping" ADD CONSTRAINT "ProviderMarketMapping_canonicalMarketId_fkey" FOREIGN KEY ("canonicalMarketId") REFERENCES "CanonicalMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMarketMapping" ADD CONSTRAINT "ProviderMarketMapping_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ProviderMarketMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMarketMapping" ADD CONSTRAINT "ProviderMarketMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AnalystProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_canonicalMarketId_fkey" FOREIGN KEY ("canonicalMarketId") REFERENCES "CanonicalMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "ProviderMarketMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionResult" ADD CONSTRAINT "PredictionResult_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionResult" ADD CONSTRAINT "PredictionResult_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionEdit" ADD CONSTRAINT "PredictionEdit_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionEdit" ADD CONSTRAINT "PredictionEdit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionView" ADD CONSTRAINT "PredictionView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionView" ADD CONSTRAINT "PredictionView_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAnalyst" ADD CONSTRAINT "SavedAnalyst_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAnalyst" ADD CONSTRAINT "SavedAnalyst_analystProfileId_fkey" FOREIGN KEY ("analystProfileId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_analystProfileId_fkey" FOREIGN KEY ("analystProfileId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusTransition" ADD CONSTRAINT "PaymentStatusTransition_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusTransition" ADD CONSTRAINT "PaymentStatusTransition_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "WebhookEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_analystProfileId_fkey" FOREIGN KEY ("analystProfileId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Alert } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ადმინი',
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [
    users,
    pendingAnalysts,
    predictions,
    unsettled,
    needsReview,
    openReports,
    failedWebhooks,
    pendingPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.analystProfile.count({ where: { status: 'PENDING' } }),
    prisma.prediction.count({ where: { publishedAt: { not: null } } }),
    prisma.prediction.count({
      where: { publishedAt: { not: null }, status: 'PENDING', supersededAt: null },
    }),
    prisma.prediction.count({ where: { finishedAt: { not: null }, status: 'PENDING' } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.webhookEvent.count({ where: { signatureValid: false } }),
    prisma.payment.count({ where: { status: { in: ['CREATED', 'PROCESSING'] } } }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          მიმოხილვა
        </h1>
        <p className="mt-1.5 text-ink-muted">
          პლატფორმის მდგომარეობა და მოსაგვარებელი საკითხები.
        </p>
      </header>

      {/* Anything that needs a human decision is surfaced first. */}
      <div className="mb-5 space-y-3">
        {needsReview > 0 ? (
          <Alert tone="warning" title="სკრინშოტი ელოდება განხილვას">
            {needsReview} ფსონი ავტორმა დაასრულა და შედეგს ელოდება.{' '}
            <Link href="/admin/predictions?review=awaiting" className="underline">
              განხილვა
            </Link>
          </Alert>
        ) : null}

        {failedWebhooks > 0 ? (
          <Alert tone="error" title="ხელმოწერის შემოწმება ჩავარდა">
            {failedWebhooks} webhook მიღებულია არასწორი ხელმოწერით და არ
            გამოყენებულა. შეამოწმეთ პროვაიდერის კონფიგურაცია.
          </Alert>
        ) : null}

        {pendingAnalysts > 0 ? (
          <Alert tone="info">
            {pendingAnalysts} ანალიტიკოსი ელოდება დამოწმებას.{' '}
            <Link href="/admin/analysts" className="underline">
              განხილვა
            </Link>
          </Alert>
        ) : null}
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="მომხმარებელი" value={users} size="lg" />
            <Stat label="გამოქვეყნებული ფსონი" value={predictions} size="lg" />
            <Stat
              label="დასათვლელი"
              value={unsettled}
              size="lg"
              hint="მოლოდინში მყოფი"
            />
            <Stat label="ღია საჩივარი" value={openReports} size="lg" />
          </div>
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader title="სწრაფი მოქმედებები" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/admin/predictions"
                  className="text-accent hover:underline"
                >
                  სკრინშოტების განხილვა და შედეგის დაფიქსირება
                </Link>
              </li>
              <li>
                <Link href="/admin/audit" className="text-accent hover:underline">
                  აუდიტის ჟურნალის ნახვა
                </Link>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="გადახდები" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="დაუდასტურებელი" value={pendingPayments} />
              <Stat
                label="უარყოფილი webhook"
                value={failedWebhooks}
                tone={failedWebhooks > 0 ? 'negative' : 'default'}
              />
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              გამოწერა აქტიურდება მხოლოდ სერვერული webhook-ის შემდეგ. ბრაუზერის
              დაბრუნება არასდროს არის დადასტურება.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

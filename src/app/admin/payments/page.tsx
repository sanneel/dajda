import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa, formatMoney } from '@/lib/format';
import { PAYMENT_STATUS_KA, SUBSCRIPTION_STATUS_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'გადახდები · ადმინი',
  robots: { index: false, follow: false },
};

export default async function AdminPaymentsPage() {
  await requireAdmin();

  const [payments, webhooks, invalidCount] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        providerCode: true,
        providerOrderId: true,
        providerPaymentId: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        maskedCard: true,
        user: { select: { email: true } },
        subscription: { select: { status: true } },
        transitions: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            source: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.webhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        providerCode: true,
        eventId: true,
        signatureValid: true,
        receivedAt: true,
        processedAt: true,
        processingResult: true,
      },
    }),
    prisma.webhookEvent.count({ where: { signatureValid: false } }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          გადახდები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ტრანზაქციები და webhook-ების ჟურნალი.
        </p>
      </header>

      {invalidCount > 0 ? (
        <div className="mb-5">
          <Alert tone="error" title="არასწორი ხელმოწერა">
            {invalidCount} webhook უარყოფილია ხელმოწერის შემოწმებაზე. არცერთს
            არ შეუცვლია გადახდის სტატუსი.
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title={`ტრანზაქციები (${payments.length})`} />
        <CardBody>
          {payments.length === 0 ? (
            <EmptyState title="გადახდა ჯერ არ დაფიქსირებულა" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-sm">
                <caption className="sr-only">გადახდების სია</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      მომხმარებელი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      შეკვეთა
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      პროვაიდერი
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium text-ink-muted">
                      თანხა
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      სტატუსი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      გამოწერა
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-line last:border-0 align-top"
                    >
                      <td className="py-3 text-ink-muted">
                        {payment.user.email}
                        <div className="text-xs text-ink-faint">
                          {formatDateTimeKa(payment.createdAt)}
                        </div>
                      </td>
                      <td className="py-3">
                        <code className="text-xs text-ink-faint">
                          {payment.providerOrderId.slice(0, 20)}…
                        </code>
                        {payment.transitions.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {payment.transitions.map((transition) => (
                              <div
                                key={transition.id}
                                className="text-xs text-ink-faint"
                              >
                                {transition.fromStatus ?? '·'} →{' '}
                                {transition.toStatus} ({transition.source})
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-ink-muted">
                        {payment.providerCode}
                        <div className="text-xs text-ink-faint">
                          {payment.maskedCard ?? '·'}
                        </div>
                      </td>
                      <td className="tabular py-3 text-right text-ink">
                        {formatMoney(payment.amountMinor, payment.currency)}
                      </td>
                      <td className="py-3">
                        <Badge
                          tone={
                            payment.status === 'SUCCEEDED'
                              ? 'accent'
                              : payment.status === 'FAILED' ||
                                  payment.status === 'DISPUTED'
                                ? 'loss'
                                : 'neutral'
                          }
                        >
                          {PAYMENT_STATUS_KA[payment.status]}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-ink-muted">
                        {payment.subscription
                          ? SUBSCRIPTION_STATUS_KA[payment.subscription.status]
                          : '·'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="Webhook-ების ჟურნალი"
            description="ყველა მიღებული შეტყობინება: მათ შორის უარყოფილი."
          />
          <CardBody>
            {webhooks.length === 0 ? (
              <EmptyState title="webhook ჯერ არ მიღებულა" />
            ) : (
              <ul className="space-y-2">
                {webhooks.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-canvas px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-ink-muted">
                        {event.providerCode} ·{' '}
                        <code className="text-xs">{event.eventId}</code>
                      </span>
                      {event.processingResult ? (
                        <div className="text-xs text-ink-faint">
                          {event.processingResult}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={event.signatureValid ? 'accent' : 'loss'}>
                        {event.signatureValid
                          ? 'ხელმოწერა სწორია'
                          : 'ხელმოწერა არასწორია'}
                      </Badge>
                      <span className="text-xs text-ink-faint">
                        {formatDateTimeKa(event.receivedAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

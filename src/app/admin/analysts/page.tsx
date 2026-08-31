import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateKa } from '@/lib/format';
import { ANALYST_STATUS_KA } from '@/lib/labels';
import { decideAnalystAction } from '@/actions/admin';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { ActionButton } from '@/components/admin/action-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ანალიტიკოსები · ადმინი',
  robots: { index: false, follow: false },
};

export default async function AdminAnalystsPage() {
  await requireAdmin();

  const profiles = await prisma.analystProfile.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      displayName: true,
      slug: true,
      headline: true,
      status: true,
      isDemo: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      referralSource: true,
      monthlyMinimum: true,
      termsAcceptedAt: true,
      identityDocumentId: true,
      bio: true,
      primarySport: { select: { nameKa: true } },
      user: { select: { email: true } },
      sports: { select: { sport: { select: { nameKa: true } } } },
      _count: { select: { predictions: true } },
    },
  });

  const pending = profiles.filter((profile) => profile.status === 'PENDING');
  const rest = profiles.filter((profile) => profile.status !== 'PENDING');

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          ანალიტიკოსები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          განაცხადების განხილვა და პროფილების სტატუსი. მხოლოდ დამოწმებულ
          ავტორებს შეუძლიათ გამოქვეყნება.
        </p>
      </header>

      <Card>
        <CardHeader
          title={`დასამოწმებელი (${pending.length})`}
          description="ახალი განაცხადები."
        />
        <CardBody>
          {pending.length === 0 ? (
            <EmptyState title="ახალი განაცხადი არ არის" />
          ) : (
            <ul className="space-y-3">
              {pending.map((profile) => (
                <li
                  key={profile.id}
                  className="rounded border border-line bg-canvas p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={profile.displayName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {profile.displayName}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {profile.user.email} · {formatDateKa(profile.createdAt)}
                      </p>
                      {profile.headline ? (
                        <p className="mt-1 text-sm text-ink-muted">
                          {profile.headline}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {profile.sports.map((entry) => (
                          <Badge key={entry.sport.nameKa}>
                            {entry.sport.nameKa}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-muted">სახელი და გვარი</dt>
                      <dd className="text-ink">
                        {profile.firstName || profile.lastName
                          ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
                          : 'მითითებული არაა'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">ძირითადი მიმართულება</dt>
                      <dd className="text-ink">
                        {profile.primarySport?.nameKa ?? 'მითითებული არაა'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">რეფერალი</dt>
                      <dd className="text-ink">
                        {profile.referralSource ?? 'მითითებული არაა'}
                      </dd>
                    </div>
                    <div>
                      {/* The floor they committed to under clause 6.4 - what
                          suspension is later measured against. */}
                      <dt className="text-xs text-ink-muted">
                        დეკლარირებული / თვე
                      </dt>
                      <dd className="tabular text-ink">
                        {profile.monthlyMinimum !== null
                          ? `${profile.monthlyMinimum} პროგნოზი`
                          : 'მითითებული არაა'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">წესებზე თანხმობა</dt>
                      <dd className="text-ink">
                        {profile.termsAcceptedAt
                          ? formatDateKa(profile.termsAcceptedAt)
                          : 'არ დაფიქსირებულა'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-ink-muted">პირადობა</dt>
                      <dd className="text-ink">
                        {profile.identityDocumentId ? (
                          <a
                            href={`/admin/identity-documents/${profile.identityDocumentId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            დოკუმენტის ნახვა
                          </a>
                        ) : (
                          'ატვირთული არაა'
                        )}
                      </dd>
                    </div>
                    {profile.bio ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-ink-muted">აღწერა</dt>
                        <dd className="text-ink-muted">{profile.bio}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    <ActionButton
                      action={decideAnalystAction}
                      fields={{
                        analystProfileId: profile.id,
                        decision: 'APPROVED',
                      }}
                      label="დამოწმება"
                      tone="accent"
                    />
                    <ActionButton
                      action={decideAnalystAction}
                      fields={{
                        analystProfileId: profile.id,
                        decision: 'REJECTED',
                      }}
                      label="უარყოფა"
                      tone="danger"
                      confirm={`უარვყოთ ${profile.displayName}?`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="mt-5">
        <Card>
          <CardHeader title={`ყველა პროფილი (${rest.length})`} />
          <CardBody>
            {rest.length === 0 ? (
              <EmptyState title="პროფილები ჯერ არ არის" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-sm">
                  <caption className="sr-only">ანალიტიკოსების პროფილები</caption>
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th scope="col" className="pb-2 font-medium text-ink-muted">
                        ავტორი
                      </th>
                      <th scope="col" className="pb-2 font-medium text-ink-muted">
                        სტატუსი
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium text-ink-muted">
                        ფსონი
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium text-ink-muted">
                        მოქმედება
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((profile) => (
                      <tr
                        key={profile.id}
                        className="border-b border-line last:border-0"
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/analysts/${profile.slug}`}
                              className="font-medium text-ink hover:text-accent"
                            >
                              {profile.displayName}
                            </Link>
                            {profile.isDemo ? <DemoBadge /> : null}
                          </div>
                          <div className="text-xs text-ink-faint">
                            {profile.user.email}
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            tone={
                              profile.status === 'APPROVED'
                                ? 'accent'
                                : profile.status === 'SUSPENDED' ||
                                    profile.status === 'REJECTED'
                                  ? 'loss'
                                  : 'pending'
                            }
                          >
                            {ANALYST_STATUS_KA[profile.status]}
                          </Badge>
                        </td>
                        <td className="tabular py-3 text-right text-ink-muted">
                          {profile._count.predictions}
                        </td>
                        <td className="py-3 text-right">
                          {profile.status === 'APPROVED' ? (
                            <ActionButton
                              action={decideAnalystAction}
                              fields={{
                                analystProfileId: profile.id,
                                decision: 'SUSPENDED',
                              }}
                              label="შეჩერება"
                              tone="danger"
                              confirm={`შევაჩეროთ ${profile.displayName}?`}
                            />
                          ) : (
                            <ActionButton
                              action={decideAnalystAction}
                              fields={{
                                analystProfileId: profile.id,
                                decision: 'APPROVED',
                              }}
                              label="აღდგენა"
                              tone="accent"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

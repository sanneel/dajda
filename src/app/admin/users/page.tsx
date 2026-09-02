import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateKa } from '@/lib/format';
import { USER_ROLE_KA, USER_STATUS_KA } from '@/lib/labels';
import { setUserStatusAction } from '@/actions/admin';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { ActionButton } from '@/components/admin/action-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'მომხმარებლები · ადმინი',
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            // `mode: 'insensitive'` keeps this a parameterised query - the
            // value is never interpolated into SQL.
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isDemo: true,
      createdAt: true,
      emailVerifiedAt: true,
      _count: { select: { subscriptions: true } },
    },
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          მომხმარებლები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ანგარიშების ძებნა და სტატუსის მართვა.
        </p>
      </header>

      <Card>
        <CardHeader
          title={`სია (${users.length})`}
          action={
            <form method="get" className="flex gap-2">
              <label htmlFor="user-search" className="sr-only">
                ძებნა
              </label>
              <input
                id="user-search"
                name="q"
                defaultValue={query}
                placeholder="სახელი ან ელფოსტა"
                className="min-h-11 rounded-md border border-line bg-elevated px-3 text-sm text-ink"
              />
              <button
                type="submit"
                className="min-h-11 rounded-md border border-line px-3 text-sm text-ink"
              >
                ძებნა
              </button>
            </form>
          }
        />
        <CardBody>
          {users.length === 0 ? (
            <EmptyState title="მომხმარებელი ვერ მოიძებნა" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">მომხმარებლების სია</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      მომხმარებელი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      როლი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      სტატუსი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      რეგისტრაცია
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium text-ink-muted">
                      მოქმედება
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-line last:border-0">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{user.name}</span>
                          {user.isDemo ? <DemoBadge /> : null}
                        </div>
                        <div className="text-xs text-ink-faint">{user.email}</div>
                      </td>
                      <td className="py-3 text-ink-muted">
                        {USER_ROLE_KA[user.role]}
                      </td>
                      <td className="py-3">
                        <Badge
                          tone={user.status === 'ACTIVE' ? 'accent' : 'loss'}
                        >
                          {USER_STATUS_KA[user.status]}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-ink-muted">
                        {formatDateKa(user.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        {user.role === 'ADMIN' ? (
                          <span className="text-xs text-ink-faint">
                            დაცული ანგარიში
                          </span>
                        ) : user.status === 'ACTIVE' ? (
                          <ActionButton
                            action={setUserStatusAction}
                            fields={{ userId: user.id, status: 'SUSPENDED' }}
                            label="შეჩერება"
                            tone="danger"
                            confirm={`შევაჩეროთ ${user.email}? ყველა სესია დაიხურება.`}
                          />
                        ) : (
                          <ActionButton
                            action={setUserStatusAction}
                            fields={{ userId: user.id, status: 'ACTIVE' }}
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
  );
}

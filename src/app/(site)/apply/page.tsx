import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/authorization';
import { ANALYST_STATUS_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { AnalystApplyForm } from './apply-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ანალიტიკოსად გახდომა',
  robots: { index: false, follow: false },
};

/**
 * The application form.
 *
 * Somebody who has already applied sees where their application stands rather
 * than a second empty form: applying twice is not a thing they can want, and
 * "we have it, it is being read" is the answer they came for.
 */
export default async function AnalystApplyPage() {
  // Redirect rather than throw. requireUser() raises UNAUTHENTICATED, which a
  // page render turns into a 500 error screen; every other signed-in area of
  // the app sends a logged-out visitor to the login form, and this page is
  // linked from the public site, so it is the one most likely to be opened
  // by somebody who has not signed in yet.
  const actor = await getCurrentUser();
  if (!actor) redirect('/login');

  const [existing, sports] = await Promise.all([
    prisma.analystProfile.findUnique({
      where: { userId: actor.userId },
      select: { status: true, rejectionReason: true, slug: true },
    }),
    prisma.sport.findMany({
      where: { isActive: true },
      orderBy: { nameKa: 'asc' },
      select: { id: true, nameKa: true },
    }),
  ]);

  if (existing?.status === 'APPROVED') redirect('/analyst');

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          ანალიტიკოსად გახდომა
        </h1>
        <p className="mt-1.5 text-ink-muted">
          განაცხადს ხელით განიხილავს ადმინისტრაცია. დამტკიცების შემდეგ შეძლებთ
          პროგნოზების გამოქვეყნებას და საკუთარი გამოწერის შეთავაზებას.
        </p>
      </header>

      {existing ? (
        <Alert
          tone={existing.status === 'REJECTED' ? 'error' : 'info'}
          title={`განაცხადის სტატუსი: ${ANALYST_STATUS_KA[existing.status]}`}
        >
          {existing.status === 'PENDING'
            ? 'განაცხადი მიღებულია და განიხილება. პასუხს მიიღებთ ელფოსტაზე.'
            : (existing.rejectionReason ??
              'განაცხადი განხილულია. დამატებითი ინფორმაციისთვის დაგვიკავშირდით.')}
        </Alert>
      ) : (
        <Card>
          <CardHeader
            title="განაცხადი"
            level={2}
            description="ყველა ველი გამოიყენება მხოლოდ განაცხადის განსახილველად."
          />
          <CardBody>
            <AnalystApplyForm sports={sports} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

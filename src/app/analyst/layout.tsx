import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/feedback';

/**
 * The analyst's own area.
 *
 * Access is resolved from the session server-side and requires an APPROVED
 * profile, not merely the ANALYST role: an application that is still pending
 * or has been suspended must not be able to post to the public record.
 */
export default async function AnalystLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect('/login');

  const profile = actor.analystProfileId
    ? await prisma.analystProfile.findUnique({
        where: { id: actor.analystProfileId },
        select: { status: true, displayName: true },
      })
    : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6"
      >
        {!profile ? (
          <Alert tone="warning" title="ანალიტიკოსის პროფილი არ გაქვთ">
            ფსონების გამოსაქვეყნებლად საჭიროა დამოწმებული ავტორის პროფილი.
          </Alert>
        ) : profile.status !== 'APPROVED' ? (
          <Alert tone="warning" title="პროფილი ჯერ არ არის დამოწმებული">
            თქვენი განაცხადის სტატუსია {profile.status}. დამოწმებამდე
            გამოქვეყნება შეუძლებელია.
          </Alert>
        ) : (
          children
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

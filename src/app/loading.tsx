import { PageSkeleton } from '@/components/layout/page-skeleton';
import { SiteHeaderShell } from '@/components/layout/site-header-shell';

/**
 * The loading state for entering a section with its own layout: the
 * account, the analyst workspace, admin, the dashboard.
 *
 * Those layouts check the session before anything renders, and Next cannot
 * show a loading state that sits below a layout still doing that. So the
 * boundary sits here, above them, and has to draw its own header: the
 * section's real one is part of what is loading. Moving between public
 * pages uses (site)/loading.tsx instead, which keeps the real header.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeaderShell />
      <PageSkeleton />
    </div>
  );
}

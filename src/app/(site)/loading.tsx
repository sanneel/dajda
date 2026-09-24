import { PageSkeleton } from '@/components/layout/page-skeleton';

/**
 * What a reader sees between clicking a link and the page arriving.
 *
 * Every page here is rendered on request, and the server is an ocean away
 * from most readers, so a click used to leave the old page up, unchanged,
 * for as long as that took. The header and nav stay (they belong to the
 * layout above), the body is swapped for an outline at once, and Next
 * prefetches this file so the swap needs no round trip.
 */
export default function Loading() {
  return <PageSkeleton />;
}

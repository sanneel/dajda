import { PageSkeleton } from '@/components/layout/page-skeleton';

/**
 * Moving between pages inside this section: the section's layout (its
 * header and nav) stays, and the body shows an outline until the page
 * arrives. Entering the section from outside uses app/loading.tsx.
 */
export default function Loading() {
  // The layout's <main> already provides the width and padding.
  return <PageSkeleton className="" />;
}

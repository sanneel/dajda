import { permanentRedirect } from 'next/navigation';

/**
 * The account moved to /account, where its settings became a tab instead of
 * a second page. This path is in bookmarks, in the notification bell's links
 * and in mail already sent, so it keeps working.
 */
export default function DashboardRedirect(): never {
  permanentRedirect('/account');
}

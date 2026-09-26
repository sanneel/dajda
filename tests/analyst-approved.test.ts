import { describe, expect, it } from 'vitest';
import {
  ANALYST_HOME_PATH,
  renderAnalystApprovedNotice,
} from '@/lib/notifications/analyst-approved';

/**
 * What an applicant is told when an administrator approves them.
 *
 * Pinned down because the first line is what the inbox shows under the
 * subject, and it has to carry the news on its own: whose profile, and that
 * they can post now.
 */
describe('analyst approved notice', () => {
  const notice = renderAnalystApprovedNotice({ displayName: 'gulfishdog8' });

  it('says what happened in the subject', () => {
    expect(notice.subjectKa).toBe('ანალიტიკოსის პროფილი დადასტურდა');
  });

  it('names the profile and what it can do now in the first line', () => {
    const first = notice.bodyKa.split('\n')[0];
    expect(first).toContain('gulfishdog8');
    expect(first).toContain('ბილეთების დამატება');
  });

  it('points at the author page, where the onboarding notice is', () => {
    expect(notice.linkPath).toBe(ANALYST_HOME_PATH);
    expect(ANALYST_HOME_PATH).toBe('/analyst');
  });
});

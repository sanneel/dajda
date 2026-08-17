import { prisma } from '@/lib/db';
import type { DispatchPort } from './dispatcher';

/**
 * Production DispatchPort. Kept apart from the dispatch logic for the same
 * reason payments split webhook.ts from prisma-port.ts: the logic is
 * exercised in tests against in-memory fakes, and importing prisma there
 * would drag a database requirement into a deliberately DB-free suite.
 */
export const prismaDispatchPort: DispatchPort = {
  async findPendingEmails(limit) {
    return prisma.notification.findMany({
      where: { channel: 'EMAIL', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        destination: true,
        subjectKa: true,
        bodyKa: true,
        linkPath: true,
      },
    });
  },

  async markSent(id) {
    await prisma.notification.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), failureReason: null },
    });
  },

  async markFailed(id, reason) {
    await prisma.notification.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    });
  },
};

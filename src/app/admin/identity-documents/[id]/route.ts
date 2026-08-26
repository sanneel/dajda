import { requireAdmin } from '@/lib/auth/authorization';
import { readIdentityDocument } from '@/lib/uploads';

/**
 * Serves an analyst's identity document to an administrator.
 *
 * The ONLY reader of that table. Two things make it safe to have at all:
 * requireAdmin() throws before anything is read, and the response is marked
 * no-store and private so the image does not sit in a shared cache or a CDN
 * afterwards. Bet slips are cached hard by their own route precisely because
 * they are public; this one must not be.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Throws for anyone who is not an administrator, before the id is used.
    await requireAdmin();
  } catch {
    /*
     * 404 rather than 403 on purpose. A 403 would confirm that a document
     * exists at this id to anyone who guesses one, which is exactly the fact
     * worth withholding from a person who is not allowed to see it.
     */
    return new Response('Not found', { status: 404 });
  }

  const { id } = await params;
  const document = await readIdentityDocument(id);

  if (!document) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(document.bytes), {
    headers: {
      'content-type': document.mimeType,
      'cache-control': 'private, no-store, max-age=0',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

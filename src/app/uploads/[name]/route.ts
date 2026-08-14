import { readStoredScreenshot } from '@/lib/uploads';

/**
 * Serves stored screenshots.
 *
 * Images live in the database rather than on disk, so nothing is reachable by
 * static path and this handler is the only way to read one. That means the
 * content type is always the one recorded at upload, never one inferred from
 * a filename.
 *
 * Deliberately unauthenticated: a screenshot is the evidence behind a public
 * record, and the record it belongs to is public. Gated ANALYSIS text is a
 * separate thing and is still checked on the page. If bet slips ever need to
 * be subscriber-only, the check belongs here.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const image = await readStoredScreenshot(name);

  if (!image) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'content-type': image.mimeType,
      // Filenames are random and content never changes under one, so this can
      // be cached hard.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    },
  });
}

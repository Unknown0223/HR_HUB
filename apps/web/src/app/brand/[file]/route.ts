import { NextResponse } from 'next/server';
import { seasonFromDate } from '@/lib/season';

export const dynamic = 'force-dynamic';

const FILES = new Set([
  'favicon.svg',
  'apple-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]);

/** Favicon / PWA icons for the current season: /brand/<file> → /icons/<season>/<file>. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILES.has(file)) return new NextResponse(null, { status: 404 });
  const season = seasonFromDate(new Date());
  // Relative Location: behind the proxy request.url is the container address (0.0.0.0:8080).
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/icons/${season}/${file}`,
      'Cache-Control': 'public, max-age=21600',
    },
  });
}

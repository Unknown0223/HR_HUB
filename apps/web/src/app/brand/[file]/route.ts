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
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILES.has(file)) return new NextResponse(null, { status: 404 });
  const season = seasonFromDate(new Date());
  const res = NextResponse.redirect(new URL(`/icons/${season}/${file}`, request.url), 307);
  res.headers.set('Cache-Control', 'public, max-age=21600');
  return res;
}

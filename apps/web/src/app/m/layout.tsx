import type { Metadata, Viewport } from 'next';
import MobileBodyFlag from './_components/MobileBodyFlag';

export const metadata: Metadata = {
  title: 'HR HUB Mobile',
  description: 'HR HUB — qatnashish, so‘rovlar, to‘lov',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'HR HUB',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d1017',
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MobileBodyFlag />
      {children}
    </>
  );
}

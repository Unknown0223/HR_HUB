import type { Metadata, Viewport } from 'next';
import MobileBodyFlag from './_components/MobileBodyFlag';

export const metadata: Metadata = {
  title: 'HR HUB Mobile',
  description:
    'Legacy PWA prototip. Asosiy mobil ilova: apps/mobile (qarang docs/MOBILE_SOURCE_OF_TRUTH.md)',
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

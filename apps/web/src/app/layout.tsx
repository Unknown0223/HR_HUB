import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { DeferredIconStyles } from '@/components/DeferredIconStyles';
import { Providers } from '@/components/Providers';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'HR HUB',
  description: 'Multi-tenant HR + attendance + payroll',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f6fb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={plusJakarta.variable}>
      <head>
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
      </head>
      <body className={plusJakarta.className}>
        <DeferredIconStyles />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

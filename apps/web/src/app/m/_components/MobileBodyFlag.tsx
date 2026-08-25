'use client';

import { useEffect } from 'react';

/** Paints the dark /m plane on <body> and restores the desktop skin on exit. */
export default function MobileBodyFlag() {
  useEffect(() => {
    document.body.dataset.app = 'mobile';
    return () => {
      delete document.body.dataset.app;
    };
  }, []);
  return null;
}

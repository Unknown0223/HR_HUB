'use client';

import { useEffect } from 'react';

const FA_HREF =
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
const FA_INTEGRITY =
  'sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==';

/** Non-blocking Font Awesome — does not stall first paint. */
export function DeferredIconStyles() {
  useEffect(() => {
    if (document.querySelector(`link[data-fa="5"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FA_HREF;
    link.integrity = FA_INTEGRITY;
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    link.dataset.fa = '5';
    document.head.appendChild(link);
  }, []);
  return null;
}

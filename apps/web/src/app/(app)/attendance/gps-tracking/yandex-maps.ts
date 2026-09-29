/* eslint-disable @typescript-eslint/no-explicit-any */

/** Yandex Maps JS API 2.1 has no bundled types; the surface we use is small. */
export type YMaps = any;

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

let loader: Promise<YMaps> | null = null;

export function loadYandexMaps(): Promise<YMaps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (loader) return loader;
  loader = new Promise<YMaps>((resolve, reject) => {
    const ready = () => window.ymaps!.ready(() => resolve(window.ymaps));
    if (window.ymaps?.ready) {
      ready();
      return;
    }
    const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim();
    const script = document.createElement('script');
    script.src =
      'https://api-maps.yandex.ru/2.1/?lang=ru_RU' + (key ? `&apikey=${encodeURIComponent(key)}` : '');
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      loader = null;
      reject(new Error('Не удалось загрузить Яндекс Карты'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/** «Chrome · Windows», «Worklyn ilovasi · Android» — enough for the user to recognise the device. */
export function describeDevice(ua: string | null | undefined) {
  const s = String(ua ?? '');
  if (!s) return 'noma’lum qurilma';
  const os = /android/i.test(s)
    ? 'Android'
    : /iphone|ipad|ios/i.test(s)
      ? 'iOS'
      : /windows/i.test(s)
        ? 'Windows'
        : /mac os|macintosh/i.test(s)
          ? 'macOS'
          : /linux/i.test(s)
            ? 'Linux'
            : '';
  const app = /dart|okhttp|worklyn/i.test(s)
    ? 'Worklyn ilovasi'
    : /edg\//i.test(s)
      ? 'Edge'
      : /opr\/|opera/i.test(s)
        ? 'Opera'
        : /yabrowser/i.test(s)
          ? 'Yandex Browser'
          : /firefox/i.test(s)
            ? 'Firefox'
            : /chrome|crios/i.test(s)
              ? 'Chrome'
              : /safari/i.test(s)
                ? 'Safari'
                : 'brauzer';
  return os ? `${app} · ${os}` : app;
}

export function formatWhen(d = new Date()) {
  return d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' });
}

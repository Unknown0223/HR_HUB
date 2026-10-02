'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UZ } from './i18n-uz';

export type Lang = 'ru' | 'uz';

export const LANGS: Array<{ id: Lang; label: string; short: string }> = [
  { id: 'ru', label: 'Русский', short: 'RU' },
  { id: 'uz', label: 'O‘zbekcha', short: 'UZ' },
];

const LANG_KEY = 'hrhub.lang';

export function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'uz' ? 'uz' : 'ru';
  } catch {
    return 'ru';
  }
}

/** Russian source text is the key; a missing Uzbek entry falls back to Russian. */
function translate(lang: Lang, ru: string, vars?: Record<string, string | number>) {
  let out = lang === 'uz' ? (UZ[ru] ?? ru) : ru;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (ru: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx>({
  lang: 'ru',
  setLang: () => undefined,
  t: (ru, vars) => translate('ru', ru, vars),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru');

  useEffect(() => {
    setLangState(storedLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (ru, vars) => translate(lang, ru, vars) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

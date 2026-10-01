export type ThemeMode = 'light' | 'dark';

export const THEME_KEY = 'hrhub.theme';

/**
 * Runs in <head> before first paint so a saved dark theme never flashes light.
 * The /m employee shell has its own light palette and is never darkened.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var p=location.pathname;if(p==='/m'||p.indexOf('/m/')===0){d.dataset.theme='light';return;}var t=localStorage.getItem('${THEME_KEY}');if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.dataset.theme=t;}catch(e){d.dataset.theme='light';}})();`;

export function storedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

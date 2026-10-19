export const THEME_STORAGE_KEY = 'autopost_theme';

export function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  const safeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = safeTheme;
  document.documentElement.style.colorScheme = safeTheme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
  } catch {
    // Theme still applies for this page even when browser storage is disabled.
  }
}

import { t as baseT } from '../languages/index.js';

/**
 * Resolve a translation key from src/languages/{es,en}.js with {var}
 * interpolation. Falls back to the key itself if the path is missing
 * (so we never crash; the missing key shows up obviously in output).
 */
export function t(language, key, vars = {}) {
  const lang = language === 'en' || language === 'es' ? language : 'es';
  let s = baseT(lang, key);
  if (s === key) return s;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/**
 * Pick the language for a guild: explicit per-guild config first, then
 * Discord's own preferredLocale as a fallback, default to Spanish.
 */
export function pickLanguage(config, guild) {
  if (config?.language === 'en' || config?.language === 'es') return config.language;
  const locale = guild?.preferredLocale || '';
  if (locale.startsWith('en')) return 'en';
  return 'es';
}

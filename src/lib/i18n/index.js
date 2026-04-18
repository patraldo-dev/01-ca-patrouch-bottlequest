import { writable, derived } from 'svelte/store';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

const translations = { en, es, fr };

export const locale = writable('es');

export const locales = ['en', 'es', 'fr'];

export const t = derived(locale, ($locale) => {
  return (key) => {
    let translation = translations[$locale]?.[key];
    if (!translation) {
      translation = translations[$locale]?.[key.toLowerCase()];
    }
    return translation || key;
  };
});

export function setLocale(newLocale) {
  if (locales.includes(newLocale)) {
    locale.set(newLocale);
  }
}

export function getLocale() {
  let currentLocale;
  locale.subscribe(value => currentLocale = value)();
  return currentLocale;
}

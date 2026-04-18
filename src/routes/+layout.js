import { locale, setLocale } from '$lib/i18n';

export async function load({ data }) {
  const initLocale = data.serverLocale || 'es';
  setLocale(initLocale);
  return { ...data };
}

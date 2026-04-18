export async function handle({ event, resolve }) {
  const localeCookie = event.cookies.get('preferredLanguage') || event.cookies.get('locale');
  event.locals.locale = ['en', 'es', 'fr'].includes(localeCookie) ? localeCookie : 'es';

  return resolve(event);
}

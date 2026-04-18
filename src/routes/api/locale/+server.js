import { redirect } from '@sveltejs/kit';

export async function GET({ url, cookies }) {
  const lang = url.searchParams.get('lang');
  const redirectTo = url.searchParams.get('redirect') || '/';

  if (!['en', 'es', 'fr'].includes(lang)) {
    throw redirect(302, redirectTo);
  }

  cookies.set('preferredLanguage', lang, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    sameSite: 'lax',
    httpOnly: false
  });

  throw redirect(302, redirectTo);
}

export async function POST({ request, cookies }) {
  const { locale } = await request.json();
  
  if (!['en', 'es', 'fr'].includes(locale)) {
    return new Response(JSON.stringify({ error: 'Invalid locale' }), { status: 400 });
  }

  cookies.set('preferredLanguage', locale, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    sameSite: 'lax',
    httpOnly: false
  });

  const referer = request.headers.get('referer') || '/';
  return new Response(JSON.stringify({ success: true, redirect: referer }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function load({ locals }) {
    return { serverLocale: locals.locale || 'es' };
}

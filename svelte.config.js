import { dev } from '$app/environment';
import { adapter } from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter({
            platformProxy: {
                enabled: dev ? true : undefined
            }
        })
    }
};

export default config;

<script>
    import { browser } from '$app/environment';
    import { t, locale, getLocale } from '$lib/i18n';
    import { get } from 'svelte/store';
    import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
    import '../app.css';

    let { children, data } = $props();
    let dark = $state(true);
    let currentLocale = $state(data?.serverLocale || getLocale());

    function toggleTheme() {
        dark = !dark;
        const theme = dark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        document.cookie = `theme=${theme};path=/;max-age=31536000;SameSite=Lax`;
    }

    $effect(() => {
        if (browser) {
            const saved = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme');
            dark = saved !== 'light';
        }
    });
</script>

<nav class="navbar" aria-label="{$t('nav.label')}">
    <div class="container">
        <a href="/" class="nav-brand">🍾 Bottle Quest</a>
        <div class="nav-links">
            <a href="/">{$t('nav.map')}</a>
            <a href="/about">{$t('nav.about')}</a>
            <LanguageSwitcher serverLocale={currentLocale} />
            <button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
                {dark ? '☀️' : '🌙'}
            </button>
        </div>
    </div>
</nav>

{@render children()}

<footer class="footer" role="contentinfo">
    <div class="container">
        <p>{$t('footer.text')} · <a href="https://patrouch.ca">{$t('footer.patrouch')}</a></p>
    </div>
</footer>

<style>
    /* component-scoped styles override none — global in app.css */
</style>

<script>
    import { browser } from '$app/environment';
    import { t, locale, getLocale } from '$lib/i18n';
    import { get } from 'svelte/store';
    import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
    import '../app.css';

    let { children, data } = $props();
    let dark = $state(true);
    let showHelp = $state(false);
    let mobileOpen = $state(false);
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
        <button class="hamburger" onclick={() => mobileOpen = !mobileOpen} aria-label="Menu" aria-expanded={mobileOpen}>
            <span class="ham-line"></span><span class="ham-line"></span><span class="ham-line"></span>
        </button>
        <div class="nav-links" class:mobile-open={mobileOpen}>
            <a href="/" onclick={() => mobileOpen = false}>{$t('nav.map')}</a>
            <a href="/about" onclick={() => mobileOpen = false}>{$t('nav.about')}</a>
            <LanguageSwitcher serverLocale={currentLocale} />
            <button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
                {dark ? '☀️' : '🌙'}
            </button>
            <button class="help-btn" onclick={() => { showHelp = !showHelp; mobileOpen = false; }} aria-label="{$t('help.title')}">?</button>
        </div>
    </div>
</nav>

{#if showHelp}
<div class="help-overlay" onclick={() => showHelp = false} role="dialog" aria-modal="true" aria-label="{$t('help.title')}">
  <div class="help-modal" onclick={(e) => e.stopPropagation()}>
    <button class="help-close" onclick={() => showHelp = false} aria-label="{$t('help.close')}">✕</button>
    <h2>{$t('help.title')}</h2>
    <div class="help-body">
      <div class="help-section">
        <h3>{$t('help.what_title')}</h3>
        <p>{$t('help.what_text')}</p>
      </div>
      <div class="help-section">
        <h3>{$t('help.how_title')}</h3>
        <ul>
          <li>{$t('help.how_1')}</li>
          <li>{$t('help.how_2')}</li>
          <li>{$t('help.how_3')}</li>
          <li>{$t('help.how_4')}</li>
        </ul>
      </div>
      <div class="help-section">
        <h3>{$t('help.tips_title')}</h3>
        <ul>
          <li>{$t('help.tip_1')}</li>
          <li>{$t('help.tip_2')}</li>
          <li>{$t('help.tip_3')}</li>
        </ul>
      </div>
      <a href="/about" class="help-link" onclick={() => showHelp = false}>{$t('help.more')} →</a>
    </div>
  </div>
</div>
{/if}

{@render children()}

<footer class="footer" role="contentinfo">
    <div class="container">
        <p>{$t('footer.text')} · <a href="https://patrouch.ca">{$t('footer.patrouch')}</a></p>
    </div>
</footer>

<style>
    /* Help modal */
    .help-btn {
        background: var(--border);
        border: none;
        border-radius: 50%;
        width: 28px; height: 28px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--fg);
        transition: background 0.2s;
        font-family: var(--font-body);
    }
    .help-btn:hover { background: var(--accent); color: #fff; }
    /* Hamburger */
    .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-direction: column; gap: 4px; justify-content: center; }
    .ham-line { display: block; width: 20px; height: 2px; background: var(--fg); border-radius: 2px; transition: transform 0.2s, opacity 0.2s; }
    .hamburger[aria-expanded="true"] .ham-line:nth-child(1) { transform: translateY(6px) rotate(45deg); }
    .hamburger[aria-expanded="true"] .ham-line:nth-child(2) { opacity: 0; }
    .hamburger[aria-expanded="true"] .ham-line:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
    .help-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        z-index: 9000; display: flex; align-items: center; justify-content: center;
        padding: 1.5rem;
    }
    .help-modal {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 2rem; max-width: 520px;
        width: 100%; max-height: 80vh; overflow-y: auto; position: relative;
    }
    .help-close {
        position: absolute; top: 0.75rem; right: 0.75rem;
        background: none; border: none; color: var(--muted); cursor: pointer;
        font-size: 1.2rem; padding: 0.25rem; line-height: 1;
    }
    .help-close:hover { color: var(--fg); }
    .help-modal h2 { font-family: var(--font-heading); font-size: 1.4rem; color: var(--fg); margin-bottom: 1.25rem; }
    .help-section { margin-bottom: 1rem; }
    .help-section h3 { font-size: 0.9rem; color: var(--accent); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .help-section p, .help-section li { font-size: 0.9rem; color: var(--fg); line-height: 1.6; }
    .help-section ul { padding-left: 1.25rem; }
    .help-section li { margin-bottom: 0.25rem; }
    .help-link { display: inline-block; margin-top: 0.5rem; color: var(--accent); font-size: 0.9rem; font-weight: 600; }
</style>

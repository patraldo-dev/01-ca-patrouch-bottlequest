<script>
    import { browser } from '$app/environment';

    let dark = $state(true);

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

<nav class="navbar">
    <div class="container">
        <a href="/" class="nav-brand">🍾 Bottle Quest</a>
        <div class="nav-links">
            <a href="/">Map</a>
            <a href="/about">About</a>
            <button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
                {dark ? '☀️' : '🌙'}
            </button>
        </div>
    </div>
</nav>

{@render children()}

<footer class="footer">
    <div class="container">
        <p>Bottle Quest · <a href="https://patrouch.ca">Patrouch.ca</a> · Ocean currents & drift simulation</p>
    </div>
</footer>

<style>
    /* component-scoped styles override none — global in app.css */
</style>

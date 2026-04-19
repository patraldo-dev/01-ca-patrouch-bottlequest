<script>
    import { t } from '$lib/i18n';
</script>

<svelte:head>
    <title>About — Bottle Quest</title>
    <meta name="description" content="Learn how Bottle Quest works — ocean drift simulation, real currents, and creative writing across the Pacific." />
</svelte:head>

<section class="about-page">
    <div class="container">
        <h1>{$t('about.title')}</h1>
        <p class="subtitle">{$t('about.subtitle')}</p>

        <div class="about-grid">
            <div class="about-card">
                <h2>🌊 {$t('about.how_title')}</h2>
                <ol>
                    <li>{$t('about.how_1')}</li>
                    <li>{$t('about.how_2')}</li>
                    <li>{$t('about.how_3')}</li>
                    <li>{$t('about.how_4')}</li>
                    <li>{$t('about.how_5')}</li>
                </ol>
            </div>

            <div class="about-card">
                <h2>🧭 {$t('about.currents_title')}</h2>
                <p>{$t('about.currents_text')}</p>
                <ul>
                    <li><strong>Mexican Coastal Gyre</strong> — {$t('about.zone_mex')}</li>
                    <li><strong>North Equatorial Current</strong> — {$t('about.zone_neq')}</li>
                    <li><strong>North Pacific Gyre</strong> — {$t('about.zone_npg')}</li>
                    <li><strong>Peruvian Coastal Current</strong> — {$t('about.zone_per')}</li>
                </ul>
            </div>

            <div class="about-card">
                <h2>🍾 {$t('about.bottle_types_title')}</h2>
                <p>{$t('about.bottle_types_text')}</p>
                <div class="type-list">
                    <span class="type-pill">Short Story</span>
                    <span class="type-pill">Poem</span>
                    <span class="type-pill">Screenplay</span>
                    <span class="type-pill">Song</span>
                    <span class="type-pill">Lyrics</span>
                    <span class="type-pill">Audiobook</span>
                    <span class="type-pill">Fanzine</span>
                    <span class="type-pill">Illustrated Book</span>
                </div>
            </div>

            <div class="about-card">
                <h2>🏖️ {$t('about.beaching_title')}</h2>
                <p>{$t('about.beaching_text')}</p>
            </div>

            <div class="about-card">
                <h2>🔐 {$t('about.crypto_title')}</h2>
                <p>{$t('about.crypto_text')}</p>
            </div>

            <div class="about-card about-card-cta">
                <h2>✍️ {$t('about.cta_title')}</h2>
                <p>{$t('about.cta_text')}</p>
                <a href="https://patrouch.ca/games/bottles" class="btn-cta">{$t('about.cta_btn')}</a>
            </div>
        </div>
    </div>
</section>

<style>
    .about-page {
        padding: 3rem 1.5rem 4rem;
        min-height: 60vh;
    }
    .about-page h1 {
        font-family: var(--font-heading);
        font-size: clamp(2rem, 4vw, 3rem);
        color: var(--fg);
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .subtitle {
        color: var(--muted);
        text-align: center;
        max-width: 600px;
        margin: 0 auto 2.5rem;
        font-size: 1.05rem;
    }
    .about-grid {
        max-width: 900px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 1.25rem;
    }
    .about-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.5rem;
    }
    .about-card h2 {
        font-family: var(--font-heading);
        font-size: 1.2rem;
        color: var(--accent);
        margin-bottom: 0.75rem;
    }
    .about-card p, .about-card li {
        color: var(--fg);
        font-size: 0.92rem;
        line-height: 1.6;
    }
    .about-card ol, .about-card ul {
        padding-left: 1.25rem;
        margin-top: 0.5rem;
    }
    .about-card li {
        margin-bottom: 0.4rem;
    }
    .about-card strong {
        color: var(--accent);
    }
    .about-card-cta {
        text-align: center;
        border-color: var(--accent);
        background: var(--accent-dim);
    }
    .about-card-cta p {
        margin-bottom: 1rem;
    }
    .btn-cta {
        display: inline-block;
        background: var(--ocean);
        color: #fff;
        padding: 0.6rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        font-family: var(--font-body);
        font-size: 0.95rem;
        transition: opacity 0.2s;
    }
    .btn-cta:hover { opacity: 0.85; text-decoration: none; }
    .type-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.75rem;
    }
    .type-pill {
        background: var(--accent-dim);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 0.25rem 0.75rem;
        font-size: 0.8rem;
        color: var(--accent);
    }

    @media (max-width: 480px) {
        .about-grid { grid-template-columns: 1fr; }
    }
</style>

<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
</script>

<svelte:head>
    <title>Bottle Quest — Track ocean drift</title>
    <meta name="description" content="Launch bottles into the Pacific Ocean and track their drift using real ocean current data from NOAA." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
</svelte:head>

<section class="hero">
    <h1>🍾 Bottle <span>Quest</span></h1>
    <p>Launch bottles into the Pacific Ocean and track their drift using real ocean current data.</p>
</section>

<section class="map-section">
    <div class="map-wrap">
        <div id="ocean-map"></div>
    </div>
</section>

<script>
    onMount(async () => {
        if (!browser) return;

        const L = (await import('leaflet')).default;
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);

        const map = L.map('ocean-map', {
            center: [15, -115],
            zoom: 4,
            zoomControl: true,
            attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 18
        }).addTo(map);

        L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap © CartoDB').addTo(map);

        // Puerto Vallarta Malecón launch point
        L.circleMarker([20.6528, -105.2306], {
            radius: 10,
            fillColor: '#3b82f6',
            fillOpacity: 0.8,
            color: '#fff',
            weight: 2
        }).addTo(map).bindPopup(`
            <div style="color:#09090b;font-family:Inter,sans-serif">
                <strong style="font-family:Playfair Display,serif">Malecón, Puerto Vallarta</strong><br>
                <span style="font-size:0.85em">🫙 Launch point</span>
            </div>
        `);
    });
</script>

<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, getLocale } from '$lib/i18n';

  let { data } = $props();

  let activeBottle = $state(null);
  let activeBottleData = $state(null);

  function selectBottle(bottle) {
    activeBottle = activeBottle?.id === bottle.id ? null : bottle;
    activeBottleData = activeBottle?.id === bottle.id ? bottle : null;
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCoords(lat, lon) {
    if (lat == null || lon == null) return '';
    return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  let mapRef = $state(null);

  let playersWithDist = $derived(
    (data.players || []).map(p => {
      let nearestBottle = null;
      let nearestDist = Infinity;
      for (const b of data.bottles || []) {
        if (b.current_lat && b.current_lon) {
          const d = haversine(p.lat, p.lon, b.current_lat, b.current_lon);
          if (d < nearestDist) { nearestDist = d; nearestBottle = b; }
        }
      }
      return { ...p, nearestBottle, nearestDist: nearestDist === Infinity ? null : nearestDist };
    })
  );

  function flyToPlayer(player) {
    if (mapRef) mapRef.flyTo([player.lat, player.lon], 6, { duration: 1.5 });
  }

  function flyToBottle(bottle) {
    if (mapRef && bottle.current_lat) mapRef.flyTo([bottle.current_lat, bottle.current_lon], 8, { duration: 1.5 });
  }

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
    mapRef = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18
    }).addTo(map);

    L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap © CartoDB').addTo(map);

    // Launch point
    L.circleMarker([20.6528, -105.2306], {
      radius: 10,
      fillColor: '#3b82f6',
      fillOpacity: 0.8,
      color: '#fff',
      weight: 2
    }).addTo(map).bindPopup(`
      <div style="color:#09090b;font-family:Inter,sans-serif">
        <strong style="font-family:Playfair Display,serif">Malecón, Puerto Vallarta</strong><br>
        <span style="font-size:0.85em">🍾 Launch point</span>
      </div>
    `);

    const launchedBottles = [];

    for (const bottle of data.bottles) {
      if (!bottle.current_lat || !bottle.current_lon) continue;

      launchedBottles.push([bottle.current_lat, bottle.current_lon]);

      const colors = {
        beached: '#f59e0b',
        found: '#c084fc',
        launched: '#3b82f6',
        sailing: '#22d3ee',
        sunk: '#ef4444'
      };

      // Animate trail
      if (bottle.positions?.length > 1) {
        const coords = bottle.positions.map(p => [p.lat, p.lon]);
        const trailLine = L.polyline([], { color: '#3b82f6', weight: 2.5, opacity: 0.6 }).addTo(map);
        const animMarker = L.circleMarker(coords[0], {
          radius: 8,
          fillColor: colors[bottle.status] || '#3b82f6',
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2
        }).addTo(map);

        // Show static full trail faintly
        L.polyline(coords, { color: '#3b82f6', weight: 1.5, opacity: 0.15, dashArray: '4 8' }).addTo(map);

        // Animate the bright trail + marker
        let step = 0;
        const interval = setInterval(() => {
          step++;
          if (step >= coords.length) {
            clearInterval(interval);
            return;
          }
          trailLine.addLatLng(coords[step]);
          animMarker.setLatLng(coords[step]);
        }, 600);

        const author = bottle.display_name || bottle.username || 'Anonymous';
        animMarker.bindPopup(`
          <div style="color:#09090b;font-family:Inter,sans-serif;min-width:200px">
            <strong style="font-family:Playfair Display,serif;font-size:1.05em">${bottle.title || '🍾'}</strong><br>
            <div style="font-size:0.85em;margin-top:4px;color:#555">
              <div><b>${author}</b> · <span style="text-transform:capitalize">${bottle.status}</span></div>
              ${bottle.launched_at ? `<div>📅 ${formatDate(bottle.launched_at)}</div>` : ''}
              ${bottle.launch_lat ? `<div>📍 ${formatCoords(bottle.launch_lat, bottle.launch_lon)}</div>` : ''}
              ${bottle.current_lat ? `<div>➜ ${formatCoords(bottle.current_lat, bottle.current_lon)}</div>` : ''}
              ${bottle.distance_km ? `<div>📏 ${bottle.distance_km.toFixed(0)} km</div>` : ''}
            </div>
          </div>
        `);
      } else {
        const marker = L.circleMarker([bottle.current_lat, bottle.current_lon], {
          radius: 10,
          fillColor: colors[bottle.status] || '#3b82f6',
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2
        }).addTo(map);

        const author = bottle.display_name || bottle.username || 'Anonymous';
        marker.bindPopup(`
          <div style="color:#09090b;font-family:Inter,sans-serif;min-width:200px">
            <strong style="font-family:Playfair Display,serif;font-size:1.05em">${bottle.title || '🍾'}</strong><br>
            <div style="font-size:0.85em;margin-top:4px;color:#555">
              <div><b>${author}</b> · <span style="text-transform:capitalize">${bottle.status}</span></div>
              ${bottle.launched_at ? `<div>📅 ${formatDate(bottle.launched_at)}</div>` : ''}
              ${bottle.launch_lat ? `<div>📍 ${formatCoords(bottle.launch_lat, bottle.launch_lon)}</div>` : ''}
              ${bottle.current_lat ? `<div>➜ ${formatCoords(bottle.current_lat, bottle.current_lon)}</div>` : ''}
              ${bottle.distance_km ? `<div>📏 ${bottle.distance_km.toFixed(0)} km</div>` : ''}
            </div>
          </div>
        `);
      }
    }

    if (launchedBottles.length) {
      map.fitBounds(L.latLngBounds(launchedBottles).pad(0.3));
    }

    // Player markers
    const playerMarkers = [];
    const players = data.players || [];
    console.log('Players data:', players.length, players);
    for (const player of players) {
      playerMarkers.push([player.lat, player.lon]);
      const icon = L.divIcon({
        className: 'player-marker',
        html: `<div style="background:${player.team_color || '#3b82f6'};color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer" title="${player.display_name || player.username}">${player.team_id === 'team-alpha' ? '🧭' : '🐧'}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const pm = L.marker([player.lat, player.lon], { icon }).addTo(map);
      pm.bindPopup(`
        <div style="color:#09090b;font-family:Inter,sans-serif;min-width:180px">
          <strong style="font-family:Playfair Display,serif;font-size:1.05em">${player.display_name || player.username}</strong><br>
          <div style="font-size:0.85em;margin-top:4px;color:#555">
            <div><b>${player.team_name || 'No team'}</b></div>
            <div>📍 ${player.port_name || 'Unknown'}</div>
            <div>${formatCoords(player.lat, player.lon)}</div>
          </div>
        </div>
      `);
      // Label with permanent tooltip
      pm.bindTooltip(player.display_name || player.username, {
        permanent: true, direction: 'top', offset: [0, -16],
        className: 'player-label'
      });
    }

    // Fit bounds to include bottles AND players
    const allPoints = [...launchedBottles, ...playerMarkers];
    if (allPoints.length) {
      map.fitBounds(L.latLngBounds(allPoints).pad(0.3));
    }
  });
</script>

<svelte:head>
  <title>Bottle Quest — Track ocean drift</title>
  <meta name="description" content="Launch bottles into the Pacific Ocean and track their drift using real ocean current data." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
</svelte:head>

<section class="hero">
  <h1>🍾 {$t('hero.title')} <span>Quest</span></h1>
  <p>{$t('hero.subtitle')}</p>
</section>

<!-- Stats -->
<div class="container">
  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-num">{data.bottles.length}</span>
      <span class="stat-label">{$t('stats.active')}</span>
    </div>
    <div class="stat-item">
      <span class="stat-num">{data.bottles.filter(b => b.status === 'beached').length}</span>
      <span class="stat-label">{$t('stats.beached')}</span>
    </div>
    <div class="stat-item">
      <span class="stat-num">{data.bottles.filter(b => b.status === 'found').length}</span>
      <span class="stat-label">{$t('stats.found')}</span>
    </div>
  </div>
</div>

<section class="map-section">
  <div class="map-wrap">
    <div id="ocean-map"></div>
  </div>
</section>

<!-- Players -->
{#if playersWithDist.length}
  <section class="players-section">
    <div class="container">
      <h2 class="section-title">{$t('players.title')}</h2>
      <div class="players-grid">
        {#each playersWithDist as player}
          <button class="player-card" onclick={() => flyToPlayer(player)}>
            <div class="player-header">
              <div class="player-avatar" style="background:{player.team_color || '#3b82f6'}">
                {player.team_id === 'team-alpha' ? '🧭' : '🐧'}
              </div>
              <div class="player-info">
                <h3>{player.display_name || player.username}</h3>
                <span class="team-badge" style="background:{player.team_color || '#3b82f6'}22;color:{player.team_color || '#3b82f6'}">{player.team_name || 'Free Agent'}</span>
              </div>
            </div>
            <div class="player-details">
              <div class="detail-row"><span>📍 {$t('players.port')}</span><span>{player.port_name || 'Unknown'}</span></div>
              <div class="detail-row"><span>🌐 {$t('players.position')}</span><span class="mono">{formatCoords(player.lat, player.lon)}</span></div>
              {#if player.nearestDist !== null}
                <button class="bottle-link" onclick={(e) => { e.stopPropagation(); flyToBottle(player.nearestBottle); }}>
                  🍾 {$t('players.nearest')}: {player.nearestDist.toFixed(0)} km
                </button>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- Bottle list -->
{#if data.bottles.length}
  <section class="bottles-section">
    <div class="container">
      <h2 class="section-title">{$t('bottles.title')}</h2>
      <div class="bottles-grid">
        {#each data.bottles as bottle}
          <button
            class="bottle-card"
            class:active={activeBottle?.id === bottle.id}
            onclick={() => selectBottle(bottle)}
          >
            <div class="card-header">
              <span class="bottle-icon">{bottle.status === 'found' ? '📬' : bottle.status === 'beached' ? '🏖️' : '🍾'}</span>
              <span class="status-dot status-{bottle.status}"></span>
            </div>
            <h3>{bottle.title || $t('bottles.untitled')}</h3>
            <p class="card-meta">{bottle.author_name || $t('bottles.anonymous')}</p>
            {#if activeBottleData?.id === bottle.id}
              <div class="card-detail">
                {#if bottle.launched_at}
                  <div class="detail-row"><span>Launched</span><span>{formatDate(bottle.launched_at)}</span></div>
                {/if}
                {#if bottle.launch_lat}
                  <div class="detail-row"><span>From</span><span class="mono">{formatCoords(bottle.launch_lat, bottle.launch_lon)}</span></div>
                {/if}
                {#if bottle.current_lat}
                  <div class="detail-row"><span>Now</span><span class="mono">{formatCoords(bottle.current_lat, bottle.current_lon)}</span></div>
                {/if}
                {#if bottle.distance_km}
                  <div class="detail-row"><span>Distance</span><span>{bottle.distance_km.toFixed(1)} km</span></div>
                {/if}
                <div class="detail-row">
                  <span>Status</span>
                  <span class="status-text status-{bottle.status}">{bottle.status}</span>
                </div>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
/* Map */
.map-section {
  margin: 1.5rem 0 2rem;
}

.map-wrap {
  height: 500px;        /* or 60vh, 700px, etc. */
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

#ocean-map {
  height: 100%;
  width: 100%;
  background: #f9fafb;
}

    /* Stats */
    .stats-bar {
        display: flex;
        gap: 2rem;
        margin: -1rem 0 0;
        padding: 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }
    .stat-item { text-align: center; flex: 1; }
    .stat-num { display: block; font-family: var(--font-heading); font-size: 2rem; color: var(--accent); font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }

    /* Bottles section */
    .bottles-section { padding: 2rem 1.5rem 4rem; }
    .section-title { font-family: var(--font-heading); font-size: 1.5rem; color: var(--accent); margin-bottom: 1.25rem; }
    .bottles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }

    .bottle-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.25rem;
        text-align: left;
        cursor: pointer;
        transition: border-color 0.2s, box-shadow 0.2s;
        color: var(--fg);
        font-family: var(--font-body);
        font-size: 0.95rem;
    }
    .bottle-card:hover { border-color: var(--accent); box-shadow: 0 0 20px var(--accent-dim); }
    .bottle-card.active { border-color: var(--accent); }
    .bottle-card h3 { font-family: var(--font-heading); font-size: 1.1rem; margin: 0.5rem 0 0.25rem; }
    .card-meta { color: var(--muted); font-size: 0.85rem; }

    .card-header { display: flex; justify-content: space-between; align-items: center; }
    .bottle-icon { font-size: 1.5rem; }

    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-dot.status-launched { background: #3b82f6; }
    .status-dot.status-sailing { background: #22d3ee; }
    .status-dot.status-beached { background: #f59e0b; }
    .status-dot.status-found { background: #c084fc; }

    .card-detail { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .detail-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.82rem; }
    .detail-row span:first-child { color: var(--muted); }
    .detail-row .mono { font-family: monospace; font-size: 0.8rem; }
    .status-text { text-transform: capitalize; font-weight: 600; }
    .status-text.status-launched { color: #3b82f6; }
    .status-text.status-sailing { color: #22d3ee; }
    .status-text.status-beached { color: #f59e0b; }
    .status-text.status-found { color: #c084fc; }

    @media (max-width: 640px) {
        .stats-bar { gap: 1rem; }
        .stat-num { font-size: 1.5rem; }
        .bottles-grid { grid-template-columns: 1fr; }
        .players-grid { grid-template-columns: 1fr; }
    }

    /* Players section */
    .players-section { padding: 2rem 1.5rem 0; }
    .players-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .player-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
      color: var(--fg);
      font-family: var(--font-body);
      font-size: 0.95rem;
      width: 100%;
    }
    .player-card:hover { border-color: var(--accent); box-shadow: 0 0 20px var(--accent-dim); }
    .player-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .player-avatar {
      width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 18px; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); flex-shrink: 0;
    }
    .player-info h3 { font-family: var(--font-heading); font-size: 1.05rem; margin: 0 0 0.2rem; }
    .team-badge { font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
    .player-details { padding-top: 0.5rem; border-top: 1px solid var(--border); }
    .bottle-link {
      margin-top: 0.5rem; background: var(--accent); color: #fff; border: none;
      padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;
      font-family: var(--font-body); font-weight: 600; width: 100%; text-align: center;
    }
    .bottle-link:hover { opacity: 0.85; }
</style>

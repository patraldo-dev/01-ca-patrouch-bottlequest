<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, getLocale } from '$lib/i18n';

  let { data } = $props();

  let activeBottle = $state(null);
  let activeBottleData = $state(null);

  // Detail visibility toggles
  let showDetails = $state({
    author: true, type: true, launched: true, ago: true,
    from: true, now: true, distance: true, speed: true,
    status: true, driftLog: true
  });
  let showMenu = $state(false);
  let keywords = $state([]);
  let proposals = $state([]);
  let recentMatches = $state([]);
  let newKeyword = $state('');
  let proposing = $state(false);
  let proposalMsg = $state('');
  let proposalOk = $state(false);

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

  function contentTypeLabel(type) {
    const labels = {
      short_story: 'Short Story', poem: 'Poem', screenplay: 'Screenplay',
      video: 'Video', song: 'Song', lyrics: 'Lyrics', audiobook: 'Audiobook',
      fanzine: 'Fanzine', illustrated_book: 'Illustrated Book'
    };
    return labels[type] || type;
  }

  function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function avgSpeed(bottle) {
    const pos = bottle.positions;
    if (!pos || pos.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < pos.length; i++) {
      total += haversine(pos[i-1].lat, pos[i-1].lon, pos[i].lat, pos[i].lon);
    }
    const hours = (new Date(pos[pos.length-1].recorded_at) - new Date(pos[0].recorded_at)) / 3600000;
    return hours > 0 ? total / hours : 0;
  }

  function stepSpeed(prev, curr) {
    const hours = (new Date(curr.recorded_at) - new Date(prev.recorded_at)) / 3600000;
    if (hours <= 0) return '—';
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    return (dist / hours).toFixed(2) + ' km/h';
  }

  function statusLabel(status) {
    const map = { launched: 'Launched', sailing: 'Floating', beached: 'Beached', found: 'Found', preparing: 'Preparing' };
    return map[status] || status;
  }

  async function proposeKeyword() {
    if (!newKeyword.trim()) return;
    proposing = true;
    proposalMsg = '';
    try {
      const res = await fetch('/api/keywords/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: 'human-default', word: newKeyword.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        proposalMsg = `"${data.word}" proposed! ⏳ Waiting for a match...`;
        proposalOk = true;
        newKeyword = '';
        const refresh = await fetch('/api/keywords/proposals');
        if (refresh.ok) {
          const r = await refresh.json();
          proposals = r.proposals || [];
        }
      } else {
        proposalMsg = data.error || 'Error';
        proposalOk = false;
      }
    } catch {
      proposalMsg = 'Network error';
      proposalOk = false;
    }
    proposing = false;
  }

  function statClick(type) {
    const list = data.bottles.filter(b => type === 'active' ? (b.status === 'launched' || b.status === 'sailing') : b.status === type);
    if (list.length === 0) return;
    if (list.length <= 6 && mapRef) {
      const bounds = L.latLngBounds(list.map(b => [b.current_lat || b.launch_lat, b.current_lon || b.launch_lon]).filter(p => p[0]));
      mapRef.fitBounds(bounds, { padding: [40, 40] });
    } else {
      document.querySelector('.bottles-section')?.scrollIntoView({ behavior: 'smooth' });
    }
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

    // Load proposals
    try {
      const res = await fetch('/api/keywords/proposals');
      if (res.ok) {
        const data = await res.json();
        proposals = data.proposals || [];
        recentMatches = data.matches || [];
      }
    } catch {}

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
      fillColor: '#ef4444',
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
        launched: '#ef4444',
        sailing: '#fca5a5',
        sunk: '#ef4444'
      };

      // Animate trail
      if (bottle.positions?.length > 1) {
        const coords = bottle.positions.map(p => [p.lat, p.lon]);
        const trailLine = L.polyline([], { color: '#ef4444', weight: 2.5, opacity: 0.6 }).addTo(map);
        const animMarker = L.circleMarker(coords[0], {
          radius: 8,
          fillColor: colors[bottle.status] || '#ef4444',
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2
        }).addTo(map);

        // Show static full trail faintly
        L.polyline(coords, { color: '#ef4444', weight: 1.5, opacity: 0.15, dashArray: '4 8' }).addTo(map);

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
              <div><b>${author}</b> · <span style="">${statusLabel(bottle.status)}</span></div>
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
          fillColor: colors[bottle.status] || '#ef4444',
          fillOpacity: 0.9,
          color: '#fff',
          weight: 2
        }).addTo(map);

        const author = bottle.display_name || bottle.username || 'Anonymous';
        marker.bindPopup(`
          <div style="color:#09090b;font-family:Inter,sans-serif;min-width:200px">
            <strong style="font-family:Playfair Display,serif;font-size:1.05em">${bottle.title || '🍾'}</strong><br>
            <div style="font-size:0.85em;margin-top:4px;color:#555">
              <div><b>${author}</b> · <span style="">${statusLabel(bottle.status)}</span></div>
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
        html: `<div style="background:${player.team_color || '#ef4444'};color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer" title="${player.display_name || player.username}">${player.type === 'ai' ? '🤖' : '🧭'}</div>`,
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
  <title>Bottle Booty — Track ocean drift</title>
  <meta name="description" content="Launch bottles into the Pacific Ocean and track their drift using real ocean current data." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
</svelte:head>

<section class="hero" aria-label="{$t('nav.map')}">
  <div class="container">
    <h1>🍾 {$t('hero.title')} <span>Quest</span></h1>
    <p>{$t('hero.subtitle')}</p>
  </div>
</section>

<!-- Stats -->
<div class="container">
  <div class="stats-bar" role="status" aria-label="{$t('stats.label')}">
    <button class="stat-item" onclick={() => statClick('active')} aria-label="{$t('stats.active')}">
      <span class="stat-num">{data.bottles.length}</span>
      <span class="stat-label">{$t('stats.active')}</span>
    </button>
    <button class="stat-item" onclick={() => statClick('beached')} aria-label="{$t('stats.beached')}">
      <span class="stat-num">{data.bottles.filter(b => b.status === 'beached').length}</span>
      <span class="stat-label">{$t('stats.beached')}</span>
    </button>
    <button class="stat-item" onclick={() => statClick('found')} aria-label="{$t('stats.found')}">
      <span class="stat-num">{data.bottles.filter(b => b.status === 'found').length}</span>
      <span class="stat-label">{$t('stats.found')}</span>
    </button>
  </div>
</div>

<section class="map-section">
  <div class="container">
    <div class="map-wrap" role="application" aria-label="{$t('map.label')}">
    <div id="ocean-map" aria-hidden="true"></div>
    </div>
  </div>
</section>
{#if playersWithDist.length}
  <section class="players-section" aria-labelledby="players-title">
    <div class="container">
      <h2 class="section-title" id="players-title">{$t('players.title')}</h2>
      <div class="players-grid">
        {#each playersWithDist as player}
          <button class="player-card" onclick={() => flyToPlayer(player)} aria-label="{player.display_name || player.username}">
            <div class="player-header">
              <div class="player-avatar" style="background:{player.team_color || '#ef4444'}">
                {player.team_id === 'team-alpha' ? '🧭' : '🐧'}
              </div>
              <div class="player-info">
                <h3>{player.display_name || player.username} {player.type === 'ai' ? '🤖' : '👤'}</h3>
                <span class="team-badge" style="background:{player.team_color || '#ef4444'}22;color:{player.team_color || '#ef4444'}">{player.type === 'ai' ? '🤖 AI' : '👤 Human'} · {player.team_name || 'Free Agent'}</span>
              </div>
            </div>
            <div class="player-details">
              <div class="detail-row"><span>📍 {$t('players.port')}</span><span>{player.port_name || 'Unknown'}</span></div>
              <div class="detail-row"><span>🌐 {$t('players.position')}</span><span class="mono">{formatCoords(player.lat, player.lon)}</span></div>
              <div class="detail-row"><span>⭐ {$t('players.points')}</span><span>{player.points || 0}</span></div>
              <div class="detail-row"><span>⛽ {$t('players.fuel')}</span><span>{player.fuel || 0}</span></div>
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

<!-- Keywords -->
<section class="keywords-section" aria-labelledby="keywords-title">
  <div class="container">
    <div class="section-header">
      <h2 class="section-title" id="keywords-title">🔑 {$t('keywords.title')}</h2>
    </div>
    <p class="keywords-desc">{$t('keywords.desc')}</p>
    <div class="kw-propose">
      <input type="text" class="kw-input" bind:value={newKeyword} placeholder={$t('keywords.placeholder')} maxlength="30" />
      <button class="btn-propose" onclick={proposeKeyword} disabled={proposing || !newKeyword.trim()}>{$t('keywords.propose')}</button>
    </div>
    {#if proposalMsg}
      <p class="kw-msg" class:kw-success={proposalOk} class:kw-error={!proposalOk}>{proposalMsg}</p>
    {/if}
    {#if proposals.length > 0}
      <div class="kw-pool">
        <h3 class="kw-pool-label">{$t('keywords.today_pool')} ({proposals.length})</h3>
        <div class="keywords-grid" role="list">
          {#each proposals as kw}
            <div class="keyword-pill" class:kw-matched={kw.status === 'matched'} role="listitem">
              <span class="kw-type">{kw.player_type === 'ai' ? '🤖' : '👤'}</span>
              <span class="kw-word">{kw.word}</span>
              {#if kw.status === 'matched'}
                <span class="kw-badge">✓ +{kw.points_earned}</span>
              {:else}
                <span class="kw-badge kw-pending">⏳</span>
              {/if}
              <span class="kw-author">{kw.display_name || kw.username}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p class="keywords-empty">{$t('keywords.empty')}</p>
    {/if}
    {#if recentMatches.length > 0}
      <div class="kw-recent">
        <h3 class="kw-pool-label">{$t('keywords.recent_matches')}</h3>
        {#each recentMatches as m}
          <div class="match-row">
            <span class="kw-word">{m.word}</span>
            <span class="kw-match-info">✓ +{m.points_earned} — {m.writing_title || 'Untitled'}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<!-- Bottle list -->
{#if data.bottles.length}
  <section class="bottles-section" aria-labelledby="bottles-title">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title" id="bottles-title">{$t('bottles.title')}</h2>
        <button class="btn-columns" onclick={() => showMenu = !showMenu} aria-expanded={showMenu} aria-controls="columns-menu">
          ⚙️ {$t('bottles.columns')}
        </button>
      </div>
      {#if showMenu}
        <div class="columns-menu" id="columns-menu" role="group" aria-label="{$t('bottles.columns')}">
          {#each Object.entries(showDetails) as [key, val]}
            <label class="col-toggle">
              <input type="checkbox" checked={val} onchange={(e) => showDetails[key] = e.target.checked} />
              <span>{$t('bottles.detail.' + key.replace(/([A-Z])/g, '_$1').toLowerCase())}</span>
            </label>
          {/each}
        </div>
      {/if}
      <div class="bottles-grid">
        {#each data.bottles as bottle}
          <button
            class="bottle-card"
            class:active={activeBottle?.id === bottle.id}
            onclick={() => selectBottle(bottle)}
            aria-label="{bottle.title || $t('bottles.untitled')}"
            aria-expanded={activeBottle?.id === bottle.id}
          >
            <div class="card-header">
              <span class="bottle-icon">{bottle.status === 'found' ? '📬' : bottle.status === 'beached' ? '🏖️' : '🍾'}</span>
              <span class="status-dot status-{bottle.status}"></span>
            </div>
            <h3>{bottle.title || $t('bottles.untitled')}</h3>
            <p class="card-meta">{bottle.author_name || $t('bottles.anonymous')}</p>
            {#if activeBottleData?.id === bottle.id}
              <div class="card-detail">
                {#if showDetails.author}
                  <div class="detail-row"><span>{$t('bottles.detail.author')}</span><span>{bottle.author_name || $t('bottles.anonymous')}</span></div>
                {/if}
                {#if showDetails.type && bottle.content_type}
                  <div class="detail-row"><span>{$t('bottles.detail.type')}</span><span class="type-tag">{contentTypeLabel(bottle.content_type)}</span></div>
                {/if}
                {#if showDetails.launched && bottle.launched_at}
                  <div class="detail-row"><span>{$t('bottles.detail.launched')}</span><span>{formatDate(bottle.launched_at)}</span></div>
                {/if}
                {#if showDetails.ago && bottle.current_lat}
                  <div class="detail-row"><span>{$t('bottles.detail.ago')}</span><span>{timeAgo(new Date(bottle.positions?.at(-1)?.recorded_at || bottle.launched_at))}</span></div>
                {/if}
                {#if showDetails.from && bottle.launch_lat}
                  <div class="detail-row"><span>{$t('bottles.detail.from')}</span><span class="mono">{formatCoords(bottle.launch_lat, bottle.launch_lon)}</span></div>
                {/if}
                {#if showDetails.now && bottle.current_lat}
                  <div class="detail-row"><span>{$t('bottles.detail.now')}</span><span class="mono">{formatCoords(bottle.current_lat, bottle.current_lon)}</span></div>
                {/if}
                {#if showDetails.distance && bottle.distance_km}
                  <div class="detail-row"><span>{$t('bottles.detail.distance')}</span><span>{bottle.distance_km.toFixed(1)} km</span></div>
                {/if}
                {#if showDetails.speed && bottle.positions?.length > 1}
                  <div class="detail-row"><span>{$t('bottles.detail.speed')}</span><span>{avgSpeed(bottle).toFixed(2)} km/h</span></div>
                {/if}
                {#if showDetails.status}
                  <div class="detail-row"><span>{$t('bottles.detail.status')}</span><span class="status-text status-{bottle.status}">{statusLabel(bottle.status)}</span></div>
                {/if}
                {#if showDetails.driftLog && bottle.positions?.length > 1}
                  <div class="drift-log">
                    <div class="drift-log-title">{$t('bottles.detail.drift_log')} ({bottle.positions.length} {$t('bottles.detail.steps')})</div>
                    <div class="drift-log-table" role="table" aria-label="{$t('bottles.detail.drift_log')}">
                      <div class="drift-log-header">
                        <span>{$t('bottles.log.time')}</span>
                        <span>{$t('bottles.log.coords')}</span>
                        <span>{$t('bottles.log.dist')}</span>
                        <span>{$t('bottles.log.speed')}</span>
                      </div>
                      {#each bottle.positions as pos, i}
                        <div class="drift-log-row">
                          <span class="log-time">{formatDate(pos.recorded_at)}</span>
                          <span class="mono">{formatCoords(pos.lat, pos.lon)}</span>
                          <span>{i === 0 ? '—' : haversine(bottle.positions[i-1].lat, bottle.positions[i-1].lon, pos.lat, pos.lon).toFixed(1) + ' km'}</span>
                          <span>{i === 0 ? '—' : stepSpeed(bottle.positions[i-1], pos)}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
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
    .stat-item { text-align: center; flex: 1; background: none; border: none; cursor: pointer; font-family: var(--font-body); padding: 0.5rem; border-radius: 8px; transition: background 0.2s; }
    .stat-item:hover { background: var(--accent-dim); }
    .stat-num { display: block; font-family: var(--font-heading); font-size: 2rem; color: var(--accent); font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }

    /* Bottles section */
    .keywords-section { padding: 2rem 1.5rem 1rem; }
    .keywords-desc { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
    .keywords-empty { color: var(--muted); font-size: 0.85rem; }
    .kw-propose { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .kw-input { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem; color: var(--fg); font-family: var(--font-body); font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
    .kw-input:focus { border-color: var(--accent); }
    .kw-input::placeholder { color: var(--muted); }
    .btn-propose { background: var(--ocean); color: #fff; border: none; border-radius: 6px; padding: 0.5rem 1rem; font-size: 0.85rem; cursor: pointer; font-family: var(--font-body); font-weight: 600; transition: opacity 0.2s; }
    .btn-propose:hover { opacity: 0.85; }
    .btn-propose:disabled { opacity: 0.5; cursor: not-allowed; }
    .kw-msg { font-size: 0.85rem; margin-bottom: 0.75rem; }
    .kw-success { color: #4ade80; }
    .kw-error { color: var(--accent); }
    .kw-pool { margin-top: 0.5rem; }
    .kw-pool-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .keywords-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .keyword-pill {
      background: var(--accent-dim); border: 1px solid var(--border); border-radius: 20px; padding: 0.35rem 0.75rem; font-size: 0.85rem; color: var(--fg); display: flex; align-items: center; gap: 0.4rem; transition: border-color 0.2s, background 0.2s;
    }
    .keyword-pill.kw-matched { border-color: #4ade80; background: rgba(74,222,128,0.1); }
    .kw-type { font-size: 0.8rem; }
    .kw-word { font-weight: 600; }
    .kw-badge { font-size: 0.72rem; font-weight: 700; color: var(--accent); }
    .kw-badge.kw-pending { color: var(--muted); }
    .kw-author { font-size: 0.7rem; color: var(--muted); }
    .kw-recent { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .match-row { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; font-size: 0.85rem; }
    .kw-match-info { color: var(--muted); font-size: 0.78rem; }
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
    .status-dot.status-launched { background: #ef4444; }
    .status-dot.status-sailing { background: #fca5a5; }
    .status-dot.status-beached { background: #f59e0b; }
    .status-dot.status-found { background: #c084fc; }

    .card-detail { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .detail-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.82rem; }
    .detail-row span:first-child { color: var(--muted); }
    .detail-row .mono { font-family: monospace; font-size: 0.8rem; }
    .status-text { text-transform: capitalize; font-weight: 600; }
    .status-text.status-launched { color: #ef4444; }
    .status-text.status-sailing { color: #fca5a5; }
    .status-text.status-beached { color: #f59e0b; }
    .status-text.status-found { color: #c084fc; }
    .drift-log { margin-top: 0.75rem; }
    .drift-log-title { font-size: 0.78rem; color: var(--accent); font-weight: 600; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .drift-log-table { max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; }
    .drift-log-header { display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr; gap: 0.3rem; padding: 0.35rem 0.5rem; background: var(--border); font-size: 0.7rem; text-transform: uppercase; color: var(--muted); font-weight: 600; letter-spacing: 0.03em; position: sticky; top: 0; z-index: 1; }
    .drift-log-row { display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr; gap: 0.3rem; padding: 0.3rem 0.5rem; font-size: 0.72rem; border-top: 1px solid var(--border); color: var(--fg); }
    .drift-log-row:hover { background: var(--accent-dim); }
    .log-time { white-space: nowrap; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .btn-columns { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.75rem; color: var(--muted); cursor: pointer; font-size: 0.82rem; font-family: var(--font-body); transition: color 0.2s, border-color 0.2s; }
    .btn-columns:hover { color: var(--accent); border-color: var(--accent); }
    .columns-menu { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .col-toggle { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--fg); cursor: pointer; }
    .col-toggle input { accent-color: var(--accent); cursor: pointer; }

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

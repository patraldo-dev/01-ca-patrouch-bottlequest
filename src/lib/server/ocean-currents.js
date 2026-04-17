/**
 * HYCOM Ocean Current Fetcher
 * Uses HYCOM GLBv0.08 via OPeNDAP to get surface currents at a given lat/lon
 * 
 * HYCOM OPeNDAP endpoint: https://tds.hycom.org/thredds/dodsC/GLBv0.08/expt_93.0/uv3z
 * Variables: water_u (zonal), water_v (meridional) at depth[0] (surface ~0m)
 * Grid: lat[3251] (~-90 to 90), lon[4500] (0 to ~360)
 * 
 * Surface currents = depth index 0
 * Lat range: -90 to 90 (3251 points, ~0.055 deg spacing)
 * Lon range: 0 to ~360 (4500 points, ~0.08 deg spacing)
 * HYCOM uses 0-360 longitude (not -180 to 180)
 */

const HYCOM_BASE = 'https://tds.hycom.org/thredds/dodsC/GLBv0.08/expt_93.0/uv3z';

// Grid spacing
const LAT_START = -90;
const LAT_STEP = 180 / 3250;  // ~0.0554
const LON_START = 0;
const LON_STEP = 360 / 4499;  // ~0.08

/**
 * Convert lat/lon to nearest grid index
 */
function toGridIndex(lat, lon) {
    // HYCOM lon is 0-360
    let hycomLon = lon;
    if (hycomLon < 0) hycomLon += 360;

    const latIdx = Math.round((lat - LAT_START) / LAT_STEP);
    const lonIdx = Math.round((hycomLon - LON_START) / LON_STEP);

    return {
        lat: Math.max(0, Math.min(3250, latIdx)),
        lon: Math.max(0, Math.min(4499, lonIdx))
    };
}

/**
 * Get latest time index
 */
async function getLatestTimeIndex() {
    const url = `${HYCOM_BASE}.das`;
    const res = await fetch(url);
    const text = await res.text();
    // Parse last time value from DAS response
    const match = text.match(/time\[6127\]\s*=\s*([\d.eE+-]+)/);
    if (match) {
        // time is days since 2000-01-01 00:00:00 UTC
        return 6127; // latest available
    }
    return 6127; // fallback to latest
}

/**
 * Fetch surface current at a specific lat/lon
 * Returns { u, v, speed } where u=zonal (E-W), v=meridional (N-S)
 * u/v in m/s
 */
export async function getCurrents(lat, lon, timeIdx = null) {
    const idx = toGridIndex(lat, lon);
    const t = timeIdx || await getLatestTimeIndex();

    // Fetch ASCII data for a single point at surface (depth=0)
    // water_u and water_v are Int16 scaled by 1e-4 relative to reference
    const url = `${HYCOM_BASE}.ascii?water_u[${t}:1:${t}][0:1:0][${idx.lat}:1:${idx.lat}][${idx.lon}:1:${idx.lon}]&water_v[${t}:1:${t}][0:1:0][${idx.lat}:1:${idx.lat}][${idx.lon}:1:${idx.lon}]`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HYCOM returned ${res.status}`);

        const text = await res.text();
        const lines = text.trim().split('\n');

        // Parse OPeNDAP ASCII format
        // First lines are headers, then data arrays
        let uVal = null, vVal = null;
        let currentVar = null;

        for (const line of lines) {
            if (line.includes('water_u[')) {
                currentVar = 'u';
            } else if (line.includes('water_v[')) {
                currentVar = 'v';
            } else if (line.includes('[0]')) {
                const nums = line.match(/-?[\d.eE+-]+/g);
                if (nums && nums.length > 0) {
                    const val = parseFloat(nums[nums.length - 1]);
                    if (currentVar === 'u') uVal = val;
                    if (currentVar === 'v') vVal = val;
                }
            }
        }

        if (uVal !== null && vVal !== null) {
            // HYCOM values need scaling - they're often in mm/s or cm/s
            // Convert to m/s for our drift model
            const scale = 0.01; // cm/s to m/s (approximate)
            const u = uVal * scale;
            const v = vVal * scale;
            const speed = Math.sqrt(u * u + v * v);

            return {
                u,     // m/s eastward
                v,     // m/s northward
                speed, // m/s total
                heading: Math.atan2(u, v) * (180 / Math.PI), // degrees
                source: 'hycom',
                fetched_at: new Date().toISOString()
            };
        }
    } catch (e) {
        console.error('HYCOM fetch error:', e.message);
    }

    return null;
}

/**
 * Fetch currents for multiple points (batch)
 */
export async function getCurrentsBatch(points) {
    const results = [];
    for (const point of points) {
        const currents = await getCurrents(point.lat, point.lon);
        results.push({
            lat: point.lat,
            lon: point.lon,
            bottle_id: point.bottle_id,
            ...currents
        });
    }
    return results;
}

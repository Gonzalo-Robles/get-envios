const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTE_FIELDS = 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration,routes.optimizedIntermediateWaypointIndex';
const ROUTE_MATRIX_FIELDS = 'originIndex,destinationIndex,duration,distanceMeters,condition';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function asSeconds(s) { return Number(String(s || '0s').replace(/s$/, '')) || 0; }
function fmtDistance(m) { return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`; }
function fmtDuration(s) {
  const mins = Math.max(1, Math.round(s / 60));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${mins} min`;
}
async function matrix(apiKey, addresses) {
  const origins = addresses.map(address => ({ waypoint: { address } }));
  const destinations = addresses.map(address => ({ waypoint: { address } }));
  const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': ROUTE_MATRIX_FIELDS },
    body: JSON.stringify({ origins, destinations, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'es-AR', units: 'METRIC' })
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`Google Routes devolvió ${r.status}: ${raw.slice(0, 260)}`);
  return raw.trim() ? raw.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) : [];
}
function shortestPathWithMatrix(elements, n) {
  const dist = Array.from({ length: n }, () => Array(n).fill(Infinity));
  for (const e of elements) if (e.condition === 'ROUTE_EXISTS') dist[e.originIndex][e.destinationIndex] = asSeconds(e.duration);
  const count = n - 1;
  if (!count) return { order: [], seconds: 0, dist };
  const size = 1 << count, dp = Array.from({ length: size }, () => Array(count).fill(Infinity));
  const prev = Array.from({ length: size }, () => Array(count).fill(-1));
  for (let j = 0; j < count; j++) dp[1 << j][j] = dist[0][j + 1];
  for (let mask = 1; mask < size; mask++) for (let j = 0; j < count; j++) {
    if (!(mask & (1 << j)) || !Number.isFinite(dp[mask][j])) continue;
    for (let k = 0; k < count; k++) if (!(mask & (1 << k))) {
      const next = mask | (1 << k), value = dp[mask][j] + dist[j + 1][k + 1];
      if (value < dp[next][k]) { dp[next][k] = value; prev[next][k] = j; }
    }
  }
  const all = size - 1;
  let last = -1, best = Infinity;
  for (let j = 0; j < count; j++) if (dp[all][j] < best) { best = dp[all][j]; last = j; }
  if (last < 0 || !Number.isFinite(best)) return { order: [], seconds: Infinity, dist };
  const order = [];
  let mask = all, j = last;
  while (j >= 0) { order.push(j + 1); const p = prev[mask][j]; mask ^= 1 << j; j = p; }
  order.reverse();
  return { order, seconds: best, dist };
}
async function preciseRoute(apiKey, addresses) {
  const r = await fetch(GOOGLE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': ROUTE_FIELDS },
    body: JSON.stringify({ origin: { address: addresses[0] }, destination: { address: addresses[addresses.length - 1] }, intermediates: addresses.slice(1, -1).map(address => ({ address })), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: false, languageCode: 'es-AR', units: 'METRIC' }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error?.message || `No se pudo verificar el recorrido (${r.status})`);
  return body.routes?.[0] || null;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usá POST para calcular una ruta.' });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'Falta configurar GOOGLE_MAPS_API_KEY como variable de entorno en Vercel.' });
  const origin = String(req.body?.origin || '').trim();
  const stops = Array.isArray(req.body?.stops) ? req.body.stops : [];
  if (!origin || stops.length < 1 || stops.length > 7 || stops.some(s => !String(s.address || '').trim() || !String(s.key || '').trim()))
    return json(res, 400, { error: 'Ingresá el punto de salida y entre 1 y 7 paradas con dirección.' });
  const places = [origin, ...stops.map(s => String(s.address).trim())];
  try {
    let sequence;
    if (stops.length === 1) sequence = [0];
    else {
      const els = await matrix(apiKey, places);
      const best = shortestPathWithMatrix(els, places.length);
      if (best.order.length !== stops.length) {
        const unreachable = stops.filter((_, i) => !Number.isFinite(best.dist[0][i + 1])).map(s => s.key);
        return json(res, 422, { error: unreachable.length ? 'Google no encontró un acceso en auto desde el origen a una o más direcciones. Corregí el domicilio o marcá esa parada como no accesible.' : 'Google no encontró una secuencia de ruta válida entre todas las paradas.', inaccessibleKeys: unreachable });
      }
      sequence = best.order.map(x => x - 1);
    }
    const orderedStops = sequence.map(i => stops[i]);
    const addresses = [origin, ...orderedStops.map(s => String(s.address).trim())];
    const route = await preciseRoute(apiKey, addresses);
    if (!route) return json(res, 422, { error: 'Google no pudo trazar el recorrido completo. Revisá las direcciones y los accesos.' });
    const legs = (route.legs || []).map((leg, i) => ({ key: orderedStops[i]?.key, distance: fmtDistance(leg.distanceMeters || 0), duration: fmtDuration(asSeconds(leg.duration)) }));
    return json(res, 200, { orderedKeys: orderedStops.map(s => s.key), distance: fmtDistance(route.distanceMeters || 0), duration: fmtDuration(asSeconds(route.duration)), legs, checks: Object.fromEntries(stops.map(s => [s.key, { ok: true }])) });
  } catch (e) {
    return json(res, 502, { error: e.message || 'No se pudo conectar con Google Routes.' });
  }
};

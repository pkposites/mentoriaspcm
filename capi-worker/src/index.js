/**
 * Cloudflare Worker — Meta Conversions API (CAPI)
 *
 * Recebe eventos da LP (POST /event) e reenvia para a Meta pelo servidor,
 * com o mesmo event_id do Pixel para deduplicação.
 *
 * Variáveis (wrangler.toml → [vars]):
 *   PIXEL_ID          ID do Pixel/Dataset
 *   ALLOWED_ORIGINS   origens permitidas, separadas por vírgula
 *   GRAPH_VERSION     versão da Graph API (ex.: v23.0)
 *   TEST_EVENT_CODE   opcional — código da aba "Testar eventos"
 * Secret (wrangler secret put META_ACCESS_TOKEN):
 *   META_ACCESS_TOKEN token gerado em Gerenciador de Eventos → Configurações → API de Conversões
 */

const ALLOWED_EVENTS = new Set(['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Contact']);

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true }, 200, cors);
    if (url.pathname !== '/event' || request.method !== 'POST') return json({ error: 'not_found' }, 404, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'origin_not_allowed' }, 403, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }

    const eventName = String(body.event_name || '');
    if (!ALLOWED_EVENTS.has(eventName)) return json({ error: 'event_not_allowed' }, 400, cors);
    if (!body.event_id) return json({ error: 'missing_event_id' }, 400, cors);

    const userData = {
      client_ip_address: request.headers.get('CF-Connecting-IP') || undefined,
      client_user_agent: request.headers.get('User-Agent') || undefined,
      fbp: clean(body.fbp),
      fbc: clean(body.fbc),
      external_id: body.external_id ? [await sha256(String(body.external_id))] : undefined,
    };
    // Contato digitado no formulário da LP (enviado já normalizado, aqui só o hash)
    const phone = String(body.phone || '').replace(/\D/g, '');
    if (phone.length >= 10) userData.ph = [await sha256(phone)];
    if (body.first_name) userData.fn = [await sha256(normalizeName(body.first_name))];
    if (body.last_name) userData.ln = [await sha256(normalizeName(body.last_name))];

    const cf = request.cf || {};
    if (cf.city) userData.ct = [await sha256(normalize(cf.city))];
    if (cf.regionCode) userData.st = [await sha256(normalize(cf.regionCode))];
    if (cf.postalCode) userData.zp = [await sha256(normalize(cf.postalCode))];
    if (cf.country) userData.country = [await sha256(normalize(cf.country))];

    const customData = {};
    for (const k of ['value', 'currency', 'content_name', 'content_category']) {
      if (body[k] !== undefined && body[k] !== '') customData[k] = body[k];
    }

    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(body.event_id),
        action_source: 'website',
        event_source_url: clean(body.event_source_url) || request.headers.get('Referer') || undefined,
        user_data: userData,
        custom_data: Object.keys(customData).length ? customData : undefined,
      }],
    };
    if (env.TEST_EVENT_CODE) payload.test_event_code = env.TEST_EVENT_CODE;

    const endpoint = `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}/${env.PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
    const send = fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      if (!r.ok) console.error('Meta CAPI error', r.status, await r.text());
      return r;
    });

    // ?debug=1 aguarda a resposta da Meta (útil para testar); senão responde na hora.
    if (url.searchParams.get('debug') === '1') {
      const r = await send;
      return json({ ok: r.ok, meta: await r.clone().json().catch(() => null) }, r.ok ? 200 : 502, cors);
    }
    ctx.waitUntil(send);
    return json({ ok: true }, 202, cors);
  },
};

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function clean(v) {
  return typeof v === 'string' && v.length && v.length < 500 ? v : undefined;
}

function normalizeName(v) {
  return String(v).trim().toLowerCase().replace(/[^\p{L}]/gu, '');
}

function normalize(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, '');
}

async function sha256(v) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ============================================================
   SANTA PROTEÇÃO VEICULAR — Meta Conversions API (CAPI)
   ------------------------------------------------------------
   Função serverless do Vercel (server-side).
   Recebe um evento do navegador e o reenvia para a Graph API
   da Meta, complementando o Pixel (lado cliente).

   A deduplicação acontece pelo par (event_name + event_id):
   o mesmo event_id é enviado pelo Pixel e por aqui, então a
   Meta conta o evento uma única vez.

   Variáveis de ambiente (configurar no Vercel):
   - META_PIXEL_ID        → ID do Pixel (ex: 2460445414378839)
   - META_CAPI_TOKEN      → token de acesso do CAPI (secreto)
   - META_TEST_EVENT_CODE → opcional, só para testes no Gerenciador
   ============================================================ */

const GRAPH_VERSION = 'v21.0';

// .trim() defensivo: evita falha quando a variável é colada com
// espaço ou quebra de linha no final (erro comum no painel do Vercel).
const PIXEL_ID = (process.env.META_PIXEL_ID || '2460445414378839').trim();
const ACCESS_TOKEN = (process.env.META_CAPI_TOKEN || '').trim();
const TEST_EVENT_CODE = (process.env.META_TEST_EVENT_CODE || '').trim() || undefined;

// Eventos que esta função aceita disparar (allowlist defensiva)
const ALLOWED_EVENTS = new Set(['Lead', 'PageView', 'ViewContent']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ACCESS_TOKEN) {
    // Sem token configurado: não derruba o front, só registra.
    console.error('[CAPI] META_CAPI_TOKEN ausente — evento ignorado.');
    return res.status(200).json({ ok: false, reason: 'token_not_configured' });
  }

  // O Vercel já entrega req.body parseado quando Content-Type é JSON.
  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

  const eventName = body.event_name;
  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'invalid_event_name' });
  }

  // Dados do usuário disponíveis no servidor (sem PII sensível).
  const userData = {
    client_ip_address: getClientIp(req),
    client_user_agent: req.headers['user-agent'] || '',
  };
  if (body.fbp) userData.fbp = body.fbp; // cookie _fbp
  if (body.fbc) userData.fbc = body.fbc; // cookie _fbc (clique do anúncio)

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id, // chave da deduplicação com o Pixel
    event_source_url: body.event_source_url || req.headers['referer'] || '',
    action_source: 'website',
    user_data: userData,
  };
  if (body.custom_data && typeof body.custom_data === 'object') {
    event.custom_data = body.custom_data;
  }

  const payload = { data: [event] };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;

  try {
    const fbRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await fbRes.json();

    if (!fbRes.ok) {
      console.error('[CAPI] Erro da Meta:', JSON.stringify(result));
      return res.status(502).json({ ok: false, meta: result });
    }
    return res.status(200).json({ ok: true, meta: result });
  } catch (err) {
    console.error('[CAPI] Falha ao enviar evento:', err);
    return res.status(500).json({ ok: false, error: 'capi_request_failed' });
  }
};

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

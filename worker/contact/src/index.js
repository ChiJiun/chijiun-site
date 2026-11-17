// Contact form backend for chijiun.com.
// POST /api/contact  { name, email, message, botcheck, token }
// → verifies the Turnstile token, then mails the site owner through the send_email binding.
// Secrets (TURNSTILE_SECRET, MAIL_TO) never reach the browser.

const LIMITS = { name: 80, email: 120, message: 4000 };
const MAX_BODY = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function reply(status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}
const fail = (status, error, origin) => reply(status, { ok: false, error }, origin);

async function verifyTurnstile(env, token, ip) {
  const res = await fetch(SITEVERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || undefined }),
  });
  if (!res.ok) return { success: false, 'error-codes': [`http-${res.status}`] };
  return res.json();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = list(env.ALLOWED_ORIGINS);
    const okOrigin = allowed.includes(origin) ? origin : '';

    if (new URL(request.url).pathname !== '/api/contact') return fail(404, 'not_found');

    // Same-origin in production; preflight only matters for local testing across ports.
    if (request.method === 'OPTIONS') {
      if (!okOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': okOrigin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', okOrigin);
    if (!okOrigin) return fail(403, 'bad_origin');
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
      return fail(415, 'json_only', okOrigin);
    }
    if (!env.TURNSTILE_SECRET || !env.MAIL_TO || !env.MAIL_FROM || !env.EMAIL) {
      console.error('contact: missing configuration');
      return fail(503, 'not_configured', okOrigin);
    }

    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY * 4) {
      return fail(413, 'too_large', okOrigin);
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail(413, 'too_large', okOrigin);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return fail(400, 'bad_json', okOrigin);
    }
    if (!data || typeof data !== 'object') return fail(400, 'bad_json', okOrigin);

    // Honeypot: pretend it worked so bots learn nothing.
    if (data.botcheck) return reply(200, { ok: true }, okOrigin);

    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    // CR/LF in the name would end up in the subject line.
    const name = str(data.name).replace(/[\r\n]+/g, ' ');
    const email = str(data.email);
    const message = str(data.message);
    const token = str(data.token);
    if (!name || !email || !message) return fail(400, 'missing_fields', okOrigin);
    if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message) {
      return fail(400, 'too_long', okOrigin);
    }
    if (!EMAIL_RE.test(email)) return fail(400, 'bad_email', okOrigin);
    if (!token || token.length > 2048) return fail(400, 'missing_token', okOrigin);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (env.LIMITER && ip) {
      try {
        const { success } = await env.LIMITER.limit({ key: ip });
        if (!success) return fail(429, 'rate_limited', okOrigin);
      } catch (err) {
        console.error('contact: rate limiter unavailable', err && err.message);
      }
    }

    let check;
    try {
      check = await verifyTurnstile(env, token, ip);
    } catch (err) {
      console.error('contact: siteverify unreachable', err && err.message);
      return fail(502, 'verify_unavailable', okOrigin);
    }
    const hosts = list(env.TURNSTILE_HOSTNAMES);
    if (!check.success || (hosts.length && !hosts.includes(check.hostname))) {
      console.log('contact: turnstile rejected', JSON.stringify(check['error-codes'] || []), check.hostname);
      return fail(403, 'turnstile_failed', okOrigin);
    }

    const text = `${message}\n\n——\n姓名：${name}\nEmail：${email}\n（直接回覆這封信就會寄給對方）`;
    try {
      await env.EMAIL.send({
        to: env.MAIL_TO,
        from: env.MAIL_FROM,
        replyTo: email,
        subject: `[chijiun.com] ${name} 的來信`,
        text,
      });
    } catch (err) {
      // Log the code only; never the visitor's message.
      console.error('contact: send failed', err && (err.code || err.message));
      return fail(502, 'send_failed', okOrigin);
    }
    return reply(200, { ok: true }, okOrigin);
  },
};

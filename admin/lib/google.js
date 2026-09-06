// Sign in with Google (OAuth 2.0 authorization code flow).
//
// The ID token is read straight from Google's token endpoint over TLS, so its
// claims are trusted without a separate signature check — but audience, issuer,
// expiry and email_verified are all still checked, because those say the token
// was minted for this app and belongs to a real, verified address.

const crypto = require('crypto');
const env = require('./env');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

// A signed, self-contained state value: no server-side store to keep in sync.
function makeState() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

function checkState(state) {
  const [nonce, sig] = String(state || '').split('.');
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(nonce).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authUrl(state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

const decodeSegment = (seg) => JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

// Trade the one-time code for the user's identity.
async function exchange(code) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Google từ chối đăng nhập' + (detail ? ` (${res.status})` : ''));
  }
  const body = await res.json();
  if (!body.id_token) throw new Error('Google không trả về thông tin tài khoản.');

  const claims = decodeSegment(String(body.id_token).split('.')[1]);
  if (!ISSUERS.has(claims.iss)) throw new Error('Token không phải do Google phát hành.');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('Token không dành cho ứng dụng này.');
  if (Number(claims.exp) * 1000 < Date.now()) throw new Error('Phiên đăng nhập Google đã hết hạn.');
  if (claims.email_verified === false) throw new Error('Email Google này chưa được xác minh.');
  if (!claims.email) throw new Error('Google không trả về email.');

  return {
    email: String(claims.email).trim().toLowerCase(),
    name: claims.name || String(claims.email).split('@')[0],
    picture: claims.picture || '',
  };
}

module.exports = { authUrl, exchange, makeState, checkState };

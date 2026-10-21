import { randomBytes, timingSafeEqual, createPublicKey, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

const random = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = code => Object.assign(new Error('Google sign-in failed.'), { oauthCode: code });
const jsonResponse = async response => { if (!response.ok) throw fail('google_unavailable'); return response.json(); };

export function mountGoogleAuth({ app, User, config, baseUrl, cookieOptions, setSession, fetchGoogle = fetch }) {
  const enabled = Boolean(config.googleClientId && config.googleClientSecret);
  const callbackUrl = req => config.googleRedirectUri || `${baseUrl(req)}/api/auth/google/callback`;
  const stateCookie = 'littlelink_google_flow';
  let keys = [], keysExpire = 0;
  async function verifyIdToken(idToken, nonce) {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid) throw fail('google_invalid');
    if (Date.now() >= keysExpire || !keys.some(key => key.kid === decoded.header.kid)) {
      const data = await jsonResponse(await fetchGoogle('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(12000) }));
      keys = data.keys || []; keysExpire = Date.now() + 60 * 60 * 1000;
    }
    const key = keys.find(key => key.kid === decoded.header.kid && key.kty === 'RSA');
    if (!key) throw fail('google_invalid');
    let claims;
    try {
      claims = jwt.verify(idToken, createPublicKey({ key, format: 'jwk' }), {
        algorithms: ['RS256'], audience: config.googleClientId, issuer: ['https://accounts.google.com', 'accounts.google.com'],
      });
    } catch { throw fail('google_invalid'); }
    if (!same(claims.nonce, nonce) || !claims.sub || claims.email_verified !== true || typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) || claims.email.length > 254) throw fail('google_invalid');
    return claims;
  }
  app.get('/api/auth/options', (req, res) => res.json({ google: enabled }));
  app.get('/api/auth/google', (req, res) => {
    if (!enabled) return res.redirect('/?authError=google_not_configured');
    const state = random(), verifier = random(), nonce = random();
    const flow = jwt.sign({ state, verifier, nonce, userId: req.user ? String(req.user._id) : null }, config.secret, {
      algorithm: 'HS256', expiresIn: '10m', issuer: 'littlelink', audience: 'littlelink-google-flow',
    });
    res.cookie(stateCookie, flow, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.search = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: callbackUrl(req), response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
    }).toString();
    res.set('Cache-Control', 'no-store').redirect(authorizationUrl.href);
  });
  app.get('/api/auth/google/callback', async (req, res) => {
    const token = req.cookies[stateCookie];
    res.clearCookie(stateCookie, cookieOptions);
    res.set('Cache-Control', 'no-store');
    try {
      if (!enabled) throw fail('google_not_configured');
      let flow;
      try { flow = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: 'littlelink', audience: 'littlelink-google-flow' }); }
      catch { throw fail('google_expired'); }
      if (!same(req.query.state, flow.state)) throw fail('google_expired');
      if (req.query.error) throw fail(req.query.error === 'access_denied' ? 'google_cancelled' : 'google_unavailable');
      if (typeof req.query.code !== 'string' || req.query.code.length > 4096) throw fail('google_invalid');
      const response = await fetchGoogle('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: req.query.code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: callbackUrl(req), grant_type: 'authorization_code', code_verifier: flow.verifier }),
      });
      const tokens = await jsonResponse(response);
      const claims = await verifyIdToken(tokens.id_token, flow.nonce);
      const email = claims.email.toLowerCase();
      let user = await User.findOne({ googleId: claims.sub });
      if (!user) {
        const existing = await User.findOne({ email }).select('+googleId');
        if (existing) {
          // Link an existing email account only from that account's authenticated session.
          if (!req.user || String(req.user._id) !== String(existing._id) || flow.userId !== String(existing._id)) throw fail('google_email_exists');
          if (existing.googleId && existing.googleId !== claims.sub) throw fail('google_email_exists');
          existing.googleId = claims.sub; user = await existing.save();
        } else {
          const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 16).padEnd(3, '_');
          for (let attempt = 0; attempt < 10; attempt++) {
            const username = `${prefix}_${randomBytes(3).toString('hex')}`;
            try { user = await User.create({ googleId: claims.sub, email, username, name: (typeof claims.name === 'string' ? claims.name.trim() : prefix).slice(0, 60) || prefix }); break; }
            catch (err) {
              if (err.code !== 11000) throw err;
              user = await User.findOne({ googleId: claims.sub }); if (user) break;
              if (await User.exists({ email })) throw fail('google_email_exists');
            }
          }
        }
      }
      if (!user) throw fail('google_unavailable');
      setSession(res, user);
      res.redirect('/dashboard');
    } catch (err) {
      // Never send provider responses, codes, tokens, or secrets to the browser.
      res.redirect(`/?authError=${err.oauthCode || 'google_unavailable'}`);
    }
  });
}

require('dotenv').config();

const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const port = 3000;

// Admin client — uses service role key, never sent to frontend
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

console.log('RMBG key:',     process.env.RMBG_API_KEY             ? 'YES' : 'NO — check your .env file');
console.log('Supabase URL:', process.env.SUPABASE_URL             ? 'YES' : 'NO — check your .env file');
console.log('Service key:',  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'YES' : 'NO — check your .env file');

app.use(express.json());
app.use(cookieParser());

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   process.env.NODE_ENV === 'production',
  path:     '/',
};

const ACCESS_TTL  = 60 * 60 * 1000;           // 1 hour  (ms)
const REFRESH_TTL = 60 * 60 * 24 * 7 * 1000;  // 7 days  (ms)

// ── POST /auth/set-session ────────────────────────────────
// Frontend calls this right after Supabase login.
// Body: { access_token, refresh_token }
app.post('/auth/set-session', async (req, res) => {
  const { access_token, refresh_token } = req.body;

  if (!access_token || !refresh_token)
    return res.status(400).json({ error: 'Missing tokens' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(access_token);

  if (error || !user)
    return res.status(401).json({ error: 'Invalid token' });

  res
    .cookie('sb_access_token',  access_token,  { ...COOKIE_OPTS, maxAge: ACCESS_TTL  })
    .cookie('sb_refresh_token', refresh_token, { ...COOKIE_OPTS, maxAge: REFRESH_TTL })
    .json({ user: safeUser(user) });
});

// ── GET /auth/me ──────────────────────────────────────────
// Called on every page load to restore session from cookie.
app.get('/auth/me', async (req, res) => {
  const accessToken  = req.cookies.sb_access_token;
  const refreshToken = req.cookies.sb_refresh_token;

  if (!accessToken && !refreshToken)
    return res.status(401).json({ user: null });

  // Try access token first
  if (accessToken) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (!error && user) return res.json({ user: safeUser(user) });
  }

  // Access token expired — try refreshing with refresh token
  if (refreshToken) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      return res
        .clearCookie('sb_access_token',  { path: '/' })
        .clearCookie('sb_refresh_token', { path: '/' })
        .status(401).json({ user: null });
    }

    const { session, user } = data;
    return res
      .cookie('sb_access_token',  session.access_token,  { ...COOKIE_OPTS, maxAge: ACCESS_TTL  })
      .cookie('sb_refresh_token', session.refresh_token, { ...COOKIE_OPTS, maxAge: REFRESH_TTL })
      .json({ user: safeUser(user) });
  }

  res.status(401).json({ user: null });
});

// ── POST /auth/logout ─────────────────────────────────────
// Clears cookies and revokes the Supabase session.
app.post('/auth/logout', async (req, res) => {
  const accessToken = req.cookies.sb_access_token;

  if (accessToken) {
    try {
      const userClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      );
      await userClient.auth.signOut();
    } catch (_) {}
  }

  res
    .clearCookie('sb_access_token',  { path: '/' })
    .clearCookie('sb_refresh_token', { path: '/' })
    .json({ ok: true });
});

// ── Admin middleware ──────────────────────────────────────────
async function requireAdmin(req, res, next) {
  const accessToken = req.cookies.sb_access_token;
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Not an admin' });

  req.adminUser = user;
  next();
}

// ── DELETE /admin/posts/:id ───────────────────────────────────
app.delete('/admin/posts/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── PATCH /admin/posts/:id ────────────────────────────────────
// Body: { status?, pinned?, approved?, admin_note? }
app.patch('/admin/posts/:id', requireAdmin, async (req, res) => {
  const allowed = ['status', 'pinned', 'approved', 'admin_note'];
  const patch = {};
  allowed.forEach(k => { if (k in req.body) patch[k] = req.body[k]; });
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });

  const { error } = await supabaseAdmin.from('posts').update(patch).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── POST /admin/ban/:userId ───────────────────────────────────
app.post('/admin/ban/:userId', requireAdmin, async (req, res) => {
  const { reason } = req.body;
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: true, banned_at: new Date().toISOString(), banned_reason: reason || '' })
    .eq('id', req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── POST /admin/unban/:userId ─────────────────────────────────
app.post('/admin/unban/:userId', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: false, banned_at: null, banned_reason: null })
    .eq('id', req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── GET /admin/check ──────────────────────────────────────────
app.get('/admin/check', requireAdmin, (req, res) => res.json({ isAdmin: true }));


// ── GET /config ───────────────────────────────────────────
app.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ rmbgApiKey: process.env.RMBG_API_KEY || '' });
});

// ── Static file serving ───────────────────────────────────
app.use((req, res) => {
  const urlPath  = req.url.split('?')[0];
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext      = path.extname(filePath);

  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  const content = fs.readFileSync(filePath, ext === '.html' ? 'utf8' : null);
  res.set('Content-Type', MIME[ext] || 'application/octet-stream').send(content);
});

// ── Start ─────────────────────────────────────────────────
app.listen(port, () => console.log(`Running at http://localhost:${port}`));

// ── Helpers ───────────────────────────────────────────────
function safeUser(user) {
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  return { id: user.id, email: user.email, name, initials: initials(name) };
}

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
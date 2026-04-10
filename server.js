const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── FILL THESE IN ──────────────────────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
// ───────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1x1 transparent pixel
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ── OPEN TRACKING ──────────────────────────────
app.get('/track/open', async (req, res) => {
  const { email, subject, inbox, campaign } = req.query;
  await supabase.from('email_events').insert({
    type: 'open',
    recipient: email,
    subject: subject,
    inbox: inbox,
    campaign: campaign,
    created_at: new Date().toISOString()
  });
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  res.send(PIXEL);
});

// ── CLICK TRACKING ─────────────────────────────
app.get('/track/click', async (req, res) => {
  const { email, subject, inbox, campaign, url } = req.query;
  await supabase.from('email_events').insert({
    type: 'click',
    recipient: email,
    subject: subject,
    inbox: inbox,
    campaign: campaign,
    clicked_url: url,
    created_at: new Date().toISOString()
  });
  res.redirect(decodeURIComponent(url));
});

// ── REPLY WEBHOOK (from n8n) ───────────────────
app.post('/track/reply', async (req, res) => {
  const { sender_email, sender_name, recipient_inbox, subject, latest_reply, date } = req.body;
  await supabase.from('email_events').insert({
    type: 'reply',
    recipient: sender_email,
    sender_name: sender_name,
    inbox: recipient_inbox,
    subject: subject,
    reply_body: latest_reply,
    created_at: date || new Date().toISOString()
  });
  res.json({ ok: true });
});

// ── DASHBOARD ──────────────────────────────────
app.get('/', async (req, res) => {
  const { data } = await supabase
    .from('email_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data || []).map(e => `
    <tr>
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td><span class="badge ${e.type}">${e.type.toUpperCase()}</span></td>
      <td>${e.inbox || '-'}</td>
      <td>${e.recipient || '-'}</td>
      <td>${e.subject || '-'}</td>
      <td>${e.reply_body || e.clicked_url || '-'}</td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Tracker</title>
      <meta http-equiv="refresh" content="30">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: #f5f5f5; }
        .header { background: #1a1a2e; color: white; padding: 20px 30px; }
        .header h1 { font-size: 22px; }
        .header p { font-size: 13px; opacity: 0.6; margin-top: 4px; }
        .container { padding: 24px 30px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
        th { background: #f0f0f0; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; }
        td { padding: 12px 16px; font-size: 13px; border-top: 1px solid #f0f0f0; color: #333; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .badge.open { background: #e3f2fd; color: #1565c0; }
        .badge.click { background: #e8f5e9; color: #2e7d32; }
        .badge.reply { background: #fce4ec; color: #c62828; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📧 Email Tracker</h1>
        <p>Auto-refreshes every 30 seconds</p>
      </div>
      <div class="container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Inbox</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#999">No events yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));

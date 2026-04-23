const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const SUPABASE_URL = 'https://rgqaptfxmcvuptfuwike.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJncWFwdGZ4bWN2dXB0ZnV3aWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg3NzcsImV4cCI6MjA5MTM3NDc3N30.9OoUlnfNF33efgCcwtunuZVKx3RFhwNWo04jSgGwlrc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    subject: decodeURIComponent(subject || ''),
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
    subject: decodeURIComponent(subject || ''),
    inbox: inbox,
    campaign: campaign,
    clicked_url: url,
    created_at: new Date().toISOString()
  });
  res.redirect(decodeURIComponent(url));
});

// ── REPLY WEBHOOK ──────────────────────────────
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

// ── SEND TRACKING ──────────────────────────────
app.post('/track/send', async (req, res) => {
  const { email, subject, inbox, campaign } = req.body;
  await supabase.from('email_events').insert({
    type: 'send',
    recipient: email,
    subject: subject,
    inbox: inbox,
    campaign: campaign,
    created_at: new Date().toISOString()
  });
  res.json({ ok: true });
});

// ── DASHBOARD ──────────────────────────────────
app.get('/', async (req, res) => {
  const page = parseInt(req.query.page || '1');
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const dateFilter = req.query.date || 'all';
  const typeFilter = req.query.type || 'all';
  const inboxFilter = req.query.inbox || 'all';

  // Build date range
  let fromDate = null;
  const now = new Date();
  if (dateFilter === 'today') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (dateFilter === 'week') {
    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (dateFilter === 'month') {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Get all events for stats (no pagination)
  let statsQuery = supabase.from('email_events').select('type, inbox');
  if (fromDate) statsQuery = statsQuery.gte('created_at', fromDate);
  const { data: allEvents } = await statsQuery;

  const events = allEvents || [];
  const sends = events.filter(e => e.type === 'send').length;
  const opens = events.filter(e => e.type === 'open').length;
  const clicks = events.filter(e => e.type === 'click').length;
  const replies = events.filter(e => e.type === 'reply').length;
  const total = events.length;

  const openRate = sends > 0 ? ((opens / sends) * 100).toFixed(1) : '0.0';
  const clickRate = sends > 0 ? ((clicks / sends) * 100).toFixed(1) : '0.0';
  const replyRate = sends > 0 ? ((replies / sends) * 100).toFixed(1) : '0.0';

  const inboxes = [...new Set(events.map(e => e.inbox).filter(Boolean))];

  // Get paginated events
  let query = supabase
    .from('email_events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (fromDate) query = query.gte('created_at', fromDate);
  if (typeFilter !== 'all') query = query.eq('type', typeFilter);
  if (inboxFilter !== 'all') query = query.eq('inbox', inboxFilter);

  const { data: pageData, count } = await query;
  const totalPages = Math.ceil((count || 0) / pageSize);

  const rows = (pageData || []).map(e => `
    <tr>
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td><span class="badge ${e.type}">${e.type.toUpperCase()}</span></td>
      <td class="truncate" title="${e.inbox || ''}">${e.inbox || '-'}</td>
      <td class="truncate" title="${e.recipient || ''}">${e.recipient || '-'}</td>
      <td class="truncate" title="${e.subject || ''}">${e.subject || '-'}</td>
      <td class="details" title="${e.reply_body || e.clicked_url || ''}">${e.reply_body || e.clicked_url || '-'}</td>
    </tr>
  `).join('');

  const buildUrl = (params) => {
    const base = { page, date: dateFilter, type: typeFilter, inbox: inboxFilter, ...params };
    return '/?' + Object.entries(base).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  };

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Tracker</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }

        .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 24px 32px; border-bottom: 1px solid #2a2a4a; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 24px; font-weight: 700; color: white; }
        .header p { font-size: 12px; color: #666; margin-top: 4px; }
        .refresh-btn { background: #2a2a4a; border: 1px solid #3a3a5a; color: #aaa; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }

        .stats { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; padding: 24px 32px; }
        .stat-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 16px; text-align: center; }
        .stat-card .number { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
        .stat-card .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
        .stat-total .number { color: #fff; }
        .stat-send .number { color: #ce93d8; }
        .stat-open .number { color: #4fc3f7; }
        .stat-click .number { color: #81c784; }
        .stat-reply .number { color: #f48fb1; }
        .stat-openrate .number { color: #ffb74d; }
        .stat-replyrate .number { color: #ff8a65; }

        .filters { padding: 0 32px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .filter-label { font-size: 12px; color: #666; margin-right: 4px; }
        .filter-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid #2a2a4a; background: transparent; color: #aaa; cursor: pointer; font-size: 12px; text-decoration: none; display: inline-block; }
        .filter-btn:hover { background: #2a2a4a; color: white; }
        .filter-btn.active { background: #2a2a4a; color: white; border-color: #4a4a6a; }

        .date-filters { padding: 0 32px 16px; display: flex; gap: 8px; align-items: center; }

        .search-bar { padding: 0 32px 16px; }
        .search-bar input { width: 100%; max-width: 400px; padding: 10px 16px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; color: white; font-size: 14px; outline: none; }
        .search-bar input::placeholder { color: #555; }

        .table-wrap { padding: 0 32px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; background: #1a1a2e; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a4a; }
        th { background: #12122a; padding: 14px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; border-bottom: 1px solid #2a2a4a; }
        td { padding: 14px 16px; font-size: 13px; border-top: 1px solid #1e1e3a; color: #ccc; }
        tr:hover td { background: #1e1e3a; }
        .truncate { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .details { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; font-size: 12px; }

        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .badge.open { background: #0d47a1; color: #4fc3f7; }
        .badge.click { background: #1b5e20; color: #81c784; }
        .badge.reply { background: #880e4f; color: #f48fb1; }
        .badge.send { background: #4a148c; color: #ce93d8; }

        .pagination { padding: 20px 32px 32px; display: flex; gap: 8px; align-items: center; justify-content: center; }
        .page-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #2a2a4a; background: #1a1a2e; color: #aaa; text-decoration: none; font-size: 13px; }
        .page-btn:hover { background: #2a2a4a; color: white; }
        .page-btn.active { background: #2a2a4a; color: white; border-color: #4a4a6a; }
        .page-info { color: #666; font-size: 13px; }

        @media (max-width: 768px) {
          .stats { grid-template-columns: repeat(2, 1fr); }
          .header, .stats, .filters, .date-filters, .search-bar, .table-wrap, .pagination { padding-left: 16px; padding-right: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>📧 Email Tracker</h1>
          <p>Page ${page} of ${totalPages} — ${count || 0} total events</p>
        </div>
        <a href="/" class="refresh-btn">↻ Refresh</a>
      </div>

      <div class="stats">
        <div class="stat-card stat-total">
          <div class="number">${total}</div>
          <div class="label">Total</div>
        </div>
        <div class="stat-card stat-send">
          <div class="number">${sends}</div>
          <div class="label">Sent</div>
        </div>
        <div class="stat-card stat-open">
          <div class="number">${opens}</div>
          <div class="label">Opens</div>
        </div>
        <div class="stat-card stat-click">
          <div class="number">${clicks}</div>
          <div class="label">Clicks</div>
        </div>
        <div class="stat-card stat-reply">
          <div class="number">${replies}</div>
          <div class="label">Replies</div>
        </div>
        <div class="stat-card stat-openrate">
          <div class="number">${openRate}%</div>
          <div class="label">Open Rate</div>
        </div>
        <div class="stat-card stat-replyrate">
          <div class="number">${replyRate}%</div>
          <div class="label">Reply Rate</div>
        </div>
      </div>

      <div class="date-filters">
        <span class="filter-label">Date:</span>
        <a href="${buildUrl({date:'all', page:1})}" class="filter-btn ${dateFilter==='all'?'active':''}">All Time</a>
        <a href="${buildUrl({date:'today', page:1})}" class="filter-btn ${dateFilter==='today'?'active':''}">Today</a>
        <a href="${buildUrl({date:'week', page:1})}" class="filter-btn ${dateFilter==='week'?'active':''}">This Week</a>
        <a href="${buildUrl({date:'month', page:1})}" class="filter-btn ${dateFilter==='month'?'active':''}">This Month</a>
      </div>

      <div class="filters">
        <span class="filter-label">Type:</span>
        <a href="${buildUrl({type:'all', page:1})}" class="filter-btn ${typeFilter==='all'?'active':''}">All</a>
        <a href="${buildUrl({type:'send', page:1})}" class="filter-btn ${typeFilter==='send'?'active':''}">Sends</a>
        <a href="${buildUrl({type:'open', page:1})}" class="filter-btn ${typeFilter==='open'?'active':''}">Opens</a>
        <a href="${buildUrl({type:'click', page:1})}" class="filter-btn ${typeFilter==='click'?'active':''}">Clicks</a>
        <a href="${buildUrl({type:'reply', page:1})}" class="filter-btn ${typeFilter==='reply'?'active':''}">Replies</a>
        <span class="filter-label" style="margin-left:8px">Inbox:</span>
        <a href="${buildUrl({inbox:'all', page:1})}" class="filter-btn ${inboxFilter==='all'?'active':''}">All</a>
        ${inboxes.map(i => `<a href="${buildUrl({inbox:i, page:1})}" class="filter-btn ${inboxFilter===i?'active':''}">${i}</a>`).join('')}
      </div>

      <div class="search-bar">
        <input type="text" id="search" placeholder="Search by recipient, subject..." onkeyup="searchTable()" />
      </div>

      <div class="table-wrap">
        <table id="mainTable">
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
          <tbody id="tableBody">
            ${rows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#444">No events found</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        ${page > 1 ? `<a href="${buildUrl({page: page-1})}" class="page-btn">← Prev</a>` : ''}
        <span class="page-info">Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<a href="${buildUrl({page: page+1})}" class="page-btn">Next →</a>` : ''}
      </div>

      <script>
        function searchTable() {
          const search = document.getElementById('search').value.toLowerCase();
          const rows = document.querySelectorAll('#tableBody tr');
          rows.forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(search) ? '' : 'none';
          });
        }
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));

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

app.get('/', async (req, res) => {
  const { data } = await supabase
    .from('email_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const events = data || [];

  const total = events.length;
  const opens = events.filter(e => e.type === 'open').length;
  const clicks = events.filter(e => e.type === 'click').length;
  const replies = events.filter(e => e.type === 'reply').length;

  const inboxes = [...new Set(events.map(e => e.inbox).filter(Boolean))];

  const rows = events.map(e => `
    <tr class="row-${e.type}">
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td><span class="badge ${e.type}">${e.type.toUpperCase()}</span></td>
      <td class="truncate">${e.inbox || '-'}</td>
      <td class="truncate">${e.recipient || '-'}</td>
      <td class="truncate">${e.subject || '-'}</td>
      <td class="details">${e.reply_body || e.clicked_url || '-'}</td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Tracker</title>
      <meta http-equiv="refresh" content="30">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }
        
        .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 24px 32px; border-bottom: 1px solid #2a2a4a; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 24px; font-weight: 700; color: white; }
        .header p { font-size: 12px; color: #666; margin-top: 4px; }
        .refresh-btn { background: #2a2a4a; border: 1px solid #3a3a5a; color: #aaa; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
        .refresh-btn:hover { background: #3a3a5a; color: white; }

        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 32px; }
        .stat-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; text-align: center; }
        .stat-card .number { font-size: 36px; font-weight: 700; margin-bottom: 4px; }
        .stat-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
        .stat-total .number { color: #fff; }
        .stat-open .number { color: #4fc3f7; }
        .stat-click .number { color: #81c784; }
        .stat-reply .number { color: #f48fb1; }

        .filters { padding: 0 32px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .filter-label { font-size: 12px; color: #666; }
        .filter-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid #2a2a4a; background: transparent; color: #aaa; cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .filter-btn:hover, .filter-btn.active { background: #2a2a4a; color: white; border-color: #4a4a6a; }
        .filter-btn.type-open.active { background: #0d47a1; border-color: #4fc3f7; color: #4fc3f7; }
        .filter-btn.type-click.active { background: #1b5e20; border-color: #81c784; color: #81c784; }
        .filter-btn.type-reply.active { background: #880e4f; border-color: #f48fb1; color: #f48fb1; }

        .search-bar { padding: 0 32px 16px; }
        .search-bar input { width: 100%; max-width: 400px; padding: 10px 16px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; color: white; font-size: 14px; outline: none; }
        .search-bar input:focus { border-color: #4a4a8a; }
        .search-bar input::placeholder { color: #555; }

        .table-wrap { padding: 0 32px 32px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; background: #1a1a2e; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a4a; }
        th { background: #12122a; padding: 14px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; border-bottom: 1px solid #2a2a4a; }
        td { padding: 14px 16px; font-size: 13px; border-top: 1px solid #1e1e3a; color: #ccc; }
        tr:hover td { background: #1e1e3a; }
        .truncate { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .details { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; font-size: 12px; }

        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
        .badge.open { background: #0d47a1; color: #4fc3f7; }
        .badge.click { background: #1b5e20; color: #81c784; }
        .badge.reply { background: #880e4f; color: #f48fb1; }

        .empty { text-align: center; padding: 60px; color: #444; font-size: 14px; }

        @media (max-width: 768px) {
          .stats { grid-template-columns: repeat(2, 1fr); }
          .header, .stats, .filters, .search-bar, .table-wrap { padding-left: 16px; padding-right: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>📧 Email Tracker</h1>
          <p>Auto-refreshes every 30 seconds</p>
        </div>
        <a href="/" class="refresh-btn">↻ Refresh</a>
      </div>

      <div class="stats">
        <div class="stat-card stat-total">
          <div class="number">${total}</div>
          <div class="label">Total Events</div>
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
      </div>

      <div class="filters">
        <span class="filter-label">Filter:</span>
        <button class="filter-btn active" onclick="filterType('all')">All</button>
        <button class="filter-btn type-open" onclick="filterType('open')">Opens</button>
        <button class="filter-btn type-click" onclick="filterType('click')">Clicks</button>
        <button class="filter-btn type-reply" onclick="filterType('reply')">Replies</button>
        ${inboxes.map(i => `<button class="filter-btn" onclick="filterInbox('${i}')">${i}</button>`).join('')}
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
            ${rows || '<tr><td colspan="6" class="empty">No events yet. Send some emails to get started!</td></tr>'}
          </tbody>
        </table>
      </div>

      <script>
        let currentType = 'all';
        let currentInbox = 'all';

        function filterType(type) {
          currentType = type;
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          event.target.classList.add('active');
          applyFilters();
        }

        function filterInbox(inbox) {
          currentInbox = inbox;
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          event.target.classList.add('active');
          applyFilters();
        }

        function searchTable() {
          applyFilters();
        }

        function applyFilters() {
          const search = document.getElementById('search').value.toLowerCase();
          const rows = document.querySelectorAll('#tableBody tr');
          rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            const typeMatch = currentType === 'all' || row.classList.contains('row-' + currentType);
            const inboxMatch = currentInbox === 'all' || text.includes(currentInbox.toLowerCase());
            const searchMatch = text.includes(search);
            row.style.display = typeMatch && inboxMatch && searchMatch ? '' : 'none';
          });
        }
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));

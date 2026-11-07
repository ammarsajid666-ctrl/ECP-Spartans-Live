(function(){
  // ============================================================
  // ECP Spartans — Club Admin Workspace (new dashboard UI)
  // Shares the SAME Supabase project/keys/data as the existing
  // index.html/admin.html/etc pages — no data migration needed.
  // ============================================================

  const SUPABASE_URL = 'https://vttyyoenrzuhbloocfgr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__i92X7tfRMOfpjcVUmqhkg_wQ1pwdgp';
  const ADMIN_EMAIL = 'ammarsajid666@gmail.com';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const EXPENSE_CATEGORIES = ['Ground Contribution','Ground Man','Umpires Share','Balls','Water Bottles - Refundable','Water & Ice','ORS','Tea','Fruits','Lunch - Team','Lunch/Dinner - Guest or Guest Team','Medicines','Broadcasting Expense','Match Fee for Club Players','Miscellaneous'];
  const CURRENT_SEASON = { key:'s8', label:'8th Season (2026 - 2027)', codeYear: 2026 };

  const state = {
    matches: [], contacts: [], expenses: {}, contributions: {},
    matchResults: {}, matchStats: [], currency: 'Rs'
  };
  let currentUser = null, isAdmin = false, isPlayer = false, currentPlayerContact = null;
  let currentView = 'overview';
  const ACCESS_KEY = 'ecpAccessMode';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  function isGuestMode(){ return localStorage.getItem(ACCESS_KEY) === 'guest'; }
  function opponentKey(o){ return String(o||'').trim().toLowerCase(); }
  function matchKey(m){ return m.date + '|' + opponentKey(m.opponent); }
  function fmtMoney(n){ return state.currency + ' ' + Math.round(num(n)).toLocaleString(); }
  function fmtDate(iso){
    if(!iso) return 'Date TBC';
    const d = new Date(iso+'T00:00:00');
    if(isNaN(d)) return iso;
    return d.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric', year:'numeric'});
  }
  function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d; }

  // ---------------- persistence (same club_data table as the rest of the site) ----------------
  const persist = {
    async get(key){
      const {data, error} = await supabase.from('club_data').select('value').eq('key', key).maybeSingle();
      if(error) throw error;
      if(!data) return null;
      return typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    },
    async set(key, value){
      if(!requireAdmin()) throw new Error('Admin login required');
      const {error} = await supabase.from('club_data').upsert({key, value, updated_at:new Date().toISOString(), updated_by: currentUser ? currentUser.id : null}, {onConflict:'key'});
      if(error) throw error;
    }
  };
  function requireAdmin(){
    if(!isAdmin){ toast('Admin login required to make changes.', true); return false; }
    return true;
  }
  function parseJSON(raw, fallback){
    if(raw == null) return fallback;
    try{ return typeof raw === 'string' ? JSON.parse(raw) : raw; }catch(e){ return fallback; }
  }
  async function loadAll(){
    try{
      const [matches, contacts, expenses, contributions, matchResults, matchStats, currencySymbol] = await Promise.all([
        persist.get('matches'), persist.get('contacts'), persist.get('expenses'),
        persist.get('contributions'), persist.get('matchResults'), persist.get('matchStats'),
        persist.get('currencySymbol')
      ]);
      state.matches = parseJSON(matches, []);
      state.contacts = parseJSON(contacts, []);
      state.expenses = parseJSON(expenses, {});
      state.contributions = parseJSON(contributions, {});
      state.matchResults = parseJSON(matchResults, {});
      state.matchStats = parseJSON(matchStats, []);
      state.currency = (currencySymbol && typeof currencySymbol === 'string') ? currencySymbol.replace(/"/g,'') : 'Rs';
    }catch(e){
      toast('Could not load club data: ' + e.message, true);
    }
    renderCurrentView();
  }
  async function saveMatches(){ await persist.set('matches', JSON.stringify(state.matches)); }
  async function saveExpenses(){ await persist.set('expenses', JSON.stringify(state.expenses)); }
  async function saveContributions(){ await persist.set('contributions', JSON.stringify(state.contributions)); }
  async function saveMatchResults(){ await persist.set('matchResults', JSON.stringify(state.matchResults)); }
  async function saveMatchStats(){ await persist.set('matchStats', JSON.stringify(state.matchStats)); }
  async function saveContacts(){ await persist.set('contacts', JSON.stringify(state.contacts)); }

  function totalExpenses(){
    const validKeys = new Set(state.matches.map(matchKey));
    let total = 0;
    Object.keys(state.expenses).forEach(k=>{
      if(!validKeys.has(k)) return;
      (state.expenses[k]||[]).forEach(item => total += num(item.amount));
    });
    return total;
  }
  function expensesForMatch(m){ return (state.expenses[matchKey(m)] || []).reduce((s,i)=>s+num(i.amount),0); }
  function totalContributionsReceived(){
    let total = 0;
    Object.values(state.contributions).forEach(p => Object.values(p.months||{}).forEach(mo => total += num(mo.received)));
    return total;
  }
  function totalContributionsExpected(){
    let total = 0;
    Object.values(state.contributions).forEach(p => Object.values(p.months||{}).forEach(mo => total += num(mo.expected)));
    return total;
  }

  // ---------------- toast / status ----------------
  let toastTimer = null;
  function toast(msg, isErr){
    let el = $('dashToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'dashToast';
      el.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:400;padding:12px 20px;border-radius:9px;font-size:13.5px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.18);';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = isErr ? '#fbe9ea' : '#e6f6ec';
    el.style.color = isErr ? '#b3202c' : '#176b3c';
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ el.style.display='none'; }, 3200);
  }

  // ---------------- modal ----------------
  function openModal(html){
    $('modalBody').innerHTML = html;
    $('modalBackdrop').classList.add('show');
  }
  function closeModal(){ $('modalBackdrop').classList.remove('show'); $('modalBody').innerHTML=''; }
  $('modalBackdrop').addEventListener('click', (e)=>{ if(e.target.id === 'modalBackdrop') closeModal(); });

  // ================= GATE / AUTH =================
  function setGateStatus(msg, type){
    const el = $('gateStatus'); el.textContent = msg; el.className = 'gate-status' + (type? ' '+type : '');
  }
  const panes = { login:'paneLogin', signup:'paneSignup', adminsetup:'paneAdminSetup' };
  function showPane(name){
    Object.values(panes).forEach(id => $(id).classList.add('hidden'));
    $(panes[name]).classList.remove('hidden');
    document.querySelectorAll('#gateTabsMini button').forEach(b=>b.classList.toggle('active', b.dataset.pane===name));
    setGateStatus('');
  }
  document.querySelectorAll('#gateTabsMini button').forEach(b=>b.addEventListener('click', ()=>showPane(b.dataset.pane)));
  document.querySelectorAll('[data-pane-link]').forEach(a=>a.addEventListener('click', (e)=>{ e.preventDefault(); showPane(a.dataset.paneLink); }));

  $('gateLoginBtn').addEventListener('click', async ()=>{
    const email = $('gateEmail').value.trim().toLowerCase();
    const password = $('gatePassword').value;
    if(!email || !password){ setGateStatus('Enter your email and password.', 'err'); return; }
    setGateStatus('Signing in…');
    const {error} = await supabase.auth.signInWithPassword({email, password});
    if(error) setGateStatus(error.message, 'err');
  });
  $('gateForgotLink').addEventListener('click', async (e)=>{
    e.preventDefault();
    const email = $('gateEmail').value.trim().toLowerCase();
    if(!email){ setGateStatus('Enter your email above first, then click "Forgot password?" again.', 'err'); return; }
    setGateStatus('Sending reset link…');
    const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: window.location.href});
    if(error) setGateStatus(error.message, 'err'); else setGateStatus('Password reset link sent — check your email.', 'ok');
  });
  $('gateGoogleBtn').addEventListener('click', async ()=>{
    setGateStatus('Redirecting to Google…');
    const {error} = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
    if(error) setGateStatus('Google sign-in isn\'t set up yet in Supabase — ' + error.message, 'err');
  });
  $('gateGuestLink').addEventListener('click', (e)=>{ e.preventDefault(); localStorage.setItem(ACCESS_KEY, 'guest'); updateAuthUI(); });
  $('gateSignupBtn').addEventListener('click', async ()=>{
    const name = $('suName').value.trim();
    const email = $('suEmail').value.trim().toLowerCase();
    const password = $('suPassword').value;
    if(!name || !email || !password){ setGateStatus('Fill in your name, email and a password.', 'err'); return; }
    if(password.length < 6){ setGateStatus('Choose a password with at least 6 characters.', 'err'); return; }
    const onRoster = state.contacts.some(c => (c.email||'').trim().toLowerCase() === email);
    if(!onRoster){ setGateStatus("This email isn't on the Team Sheet yet. Ask your admin to add it first (Players page).", 'err'); return; }
    setGateStatus('Creating your account…');
    const {data, error} = await supabase.auth.signUp({email, password});
    if(error) setGateStatus(error.message, 'err');
    else if(data.session) setGateStatus('Account created and signed in.', 'ok');
    else setGateStatus('Account created. Check your email if confirmation is required, then sign in.', 'ok');
  });
  $('gateAdminSetupBtn').addEventListener('click', async ()=>{
    const email = $('asEmail').value.trim().toLowerCase();
    const password = $('asPassword').value;
    if(email !== ADMIN_EMAIL){ setGateStatus('Only the configured admin email can create the admin account.', 'err'); return; }
    if(password.length < 6){ setGateStatus('Choose a password with at least 6 characters.', 'err'); return; }
    setGateStatus('Creating admin account…');
    const {data, error} = await supabase.auth.signUp({email, password});
    if(error) setGateStatus(error.message, 'err');
    else if(data.session) setGateStatus('Admin account created and signed in.', 'ok');
    else setGateStatus('Account created. Check your email if confirmation is required, then sign in.', 'ok');
  });

  function computeRoles(){
    isPlayer = false; currentPlayerContact = null;
    if(currentUser && !isAdmin){
      const email = (currentUser.email||'').toLowerCase();
      const match = email ? state.contacts.find(c => (c.email||'').trim().toLowerCase() === email) : null;
      if(match){ isPlayer = true; currentPlayerContact = match; }
    }
  }
  function updateAuthUI(){
    const signedInOrGuest = !!currentUser || isGuestMode();
    $('gateScreen').style.display = signedInOrGuest ? 'none' : 'flex';
    $('appShell').classList.toggle('show', signedInOrGuest);
    if(!signedInOrGuest) return;
    if(currentUser){
      const label = (currentUser.email||'U').trim();
      $('userAv').textContent = label.slice(0,2).toUpperCase();
      $('userName').textContent = label;
      $('userRole').textContent = isAdmin ? 'club admin' : (isPlayer ? 'player' : 'read only');
    }else{
      $('userAv').textContent = 'GU';
      $('userName').textContent = 'Guest';
      $('userRole').textContent = 'view only';
    }
    document.body.classList.toggle('is-admin', isAdmin);
    renderSidebarAccess();
  }
  function renderSidebarAccess(){
    // Non-admins (players/guests) can still browse every section but mutating
    // controls inside each view check requireAdmin() before saving.
  }
  $('userChip').addEventListener('click', async ()=>{
    if(!confirm(currentUser ? 'Sign out of ' + currentUser.email + '?' : 'Stop browsing as guest?')) return;
    localStorage.removeItem(ACCESS_KEY);
    if(currentUser) await supabase.auth.signOut(); else updateAuthUI();
  });

  supabase.auth.onAuthStateChange(async (_event, session)=>{
    currentUser = session?.user || null;
    isAdmin = !!currentUser && (currentUser.email||'').toLowerCase() === ADMIN_EMAIL;
    computeRoles();
    if(currentUser) localStorage.removeItem(ACCESS_KEY);
    updateAuthUI();
    await loadAll();
  });
  supabase.auth.getSession().then(async ({data})=>{
    currentUser = data.session?.user || null;
    isAdmin = !!currentUser && (currentUser.email||'').toLowerCase() === ADMIN_EMAIL;
    computeRoles();
    updateAuthUI();
    await loadAll();
  });

  // ================= NAV / ROUTING =================
  const VIEW_LABELS = {
    'overview': ['Super Admin','Dashboard'],
    'financial-reports': ['Finance','Financial Reports'],
    'contribution-payments': ['Finance','Contribution Payments'],
    'contribution-periods': ['Finance','Contribution Periods'],
    'expense-categories': ['Finance','Expense Categories'],
    'expenses': ['Finance','Expenses'],
    'player-contributions': ['Finance','Player Contributions'],
    'contribution-matrix': ['Finance','Contribution Matrix'],
    'leaderboards': ['Statistics','Leaderboards'],
    'player-statistics': ['Statistics','Player Statistics'],
    'team-statistics': ['Statistics','Team Statistics'],
    'fixtures': ['Match Management','Fixtures & Matches'],
    'grounds': ['Match Management','Grounds'],
    'opponents': ['Club Management','Opponents'],
    'players': ['Club Management','Players'],
    'club-branding': ['Club Management','Club Branding & Settings']
  };
  document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>showView(btn.dataset.view));
  });
  function showView(view){
    currentView = VIEW_LABELS[view] ? view : 'overview';
    document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===currentView));
    const [grp, label] = VIEW_LABELS[currentView];
    $('crumb').innerHTML = esc(grp) + ' / <b>' + esc(label) + '</b>';
    document.getElementById('sidebar').classList.remove('open');
    renderCurrentView();
  }
  window.DASH.showView = showView;
  $('hamburger').addEventListener('click', ()=> document.getElementById('sidebar').classList.toggle('open'));
  $('seasonLabel').textContent = CURRENT_SEASON.label;

  function renderCurrentView(){
    const fn = RENDERERS[currentView] || RENDERERS.overview;
    $('content').innerHTML = '';
    fn();
  }

  function comingSoon(title, note){
    return `<div class="eyebrow">${esc(VIEW_LABELS[currentView][0]).toUpperCase()}</div>
      <h1 class="page-title">${esc(title)}</h1>
      <p class="page-sub">${esc(note||'')}</p>
      <div class="coming-soon"><b>Coming soon</b>This section isn't built out yet — flagged as a follow-up once the core screens (Dashboard, Fixtures &amp; Matches, Finance, Statistics, Players) are confirmed working.</div>`;
  }

  // ================= RENDERERS =================
  const RENDERERS = {};

  RENDERERS['overview'] = function(){
    const today = todayISO();
    const upcoming = state.matches.filter(m=>{ const d=new Date(m.date+'T00:00:00'); return !isNaN(d) && d>=today; }).sort((a,b)=>a.date.localeCompare(b.date));
    const past = state.matches.filter(m=>{ const d=new Date(m.date+'T00:00:00'); return !isNaN(d) && d<today; });
    const pastNeedingResult = past.filter(m=> !(state.matchResults[matchKey(m)] && state.matchResults[matchKey(m)].status && state.matchResults[matchKey(m)].status !== 'Pending'));
    const outstanding = Math.max(0, totalContributionsExpected() - totalContributionsReceived());
    const roleLabel = isAdmin ? 'Club Admin' : (isPlayer ? 'Player' : 'Guest');
    const name = currentUser ? (currentUser.email||'').split('@')[0] : 'Guest';

    $('content').innerHTML = `
      <div class="eyebrow">CLUB ADMIN WORKSPACE</div>
      <h1 class="page-title">${roleLabel} dashboard</h1>
      <p class="page-sub">Welcome back, ${esc(name)}.</p>

      <div class="banner">
        <div class="ey">CLUB OVERVIEW</div>
        <h2>Keep the club moving.</h2>
        <p>Coordinate fixtures, player records and club finances.</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="lbl">Active players</div><div class="val">${state.contacts.length}</div><div class="foot">Current squad</div></div>
        <div class="stat-card"><div class="lbl">Upcoming &amp; live</div><div class="val">${upcoming.length}</div><div class="foot">Scheduled and in progress</div></div>
        <div class="stat-card"><div class="lbl">Live matches</div><div class="val">0</div><div class="foot">Matchday scorebooks</div></div>
        <div class="stat-card"><div class="lbl">Outstanding contributions</div><div class="val">${fmtMoney(outstanding)}</div><div class="foot">Expected minus received</div></div>
      </div>

      <div class="action-row">
        <button class="action-btn" data-go-view="fixtures" data-open-add="1">Create match ↗</button>
        <button class="action-btn" data-go-view="players">Manage players ↗</button>
        <button class="action-btn" data-go-view="grounds">Ground directory ↗</button>
        <button class="action-btn" data-go-view="financial-reports">Financial reports ↗</button>
        <button class="action-btn" data-go-view="club-branding">Manage users ↗</button>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h3>Upcoming fixtures</h3><button class="mini-link" data-go-view="fixtures">View all ↗</button></div>
          ${upcoming.length ? upcoming.slice(0,5).map((m,i)=>`
            <div class="fixture-row">
              <div class="fx-code">${esc(matchCode(m))}</div>
              <div class="fx-info"><b>vs ${esc(m.opponent||'TBD')}</b><span>${fmtDate(m.date)}${m.venue?' · '+esc(m.venue):''}</span></div>
            </div>`).join('') : '<div class="empty-note">No fixtures yet — import your schedule or add one from Fixtures &amp; Matches.</div>'}
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Needs attention</h3></div>
          ${pastNeedingResult.length ? `<div class="attn-item"><span>${pastNeedingResult.length} past match${pastNeedingResult.length===1?'':'es'} need result/status update</span><a href="#" data-go-view="fixtures">Review ↗</a></div>` : '<div class="empty-note">Nothing needs attention right now.</div>'}
          ${outstanding>0 ? `<div class="attn-item"><span>${fmtMoney(outstanding)} in outstanding contributions</span><a href="#" data-go-view="player-contributions">Review ↗</a></div>` : ''}
        </div>
      </div>
    `;
    bindGoViewButtons();
  };

  function bindGoViewButtons(){
    document.querySelectorAll('[data-go-view]').forEach(el=>{
      el.addEventListener('click', (e)=>{
        e.preventDefault();
        showView(el.dataset.goView);
        if(el.dataset.openAdd) setTimeout(()=>openMatchEditor(null), 50);
      });
    });
  }

  // ---------- Match code / status helpers ----------
  function sortedMatches(){ return [...state.matches].sort((a,b)=> String(a.date).localeCompare(String(b.date))); }
  function matchCode(m){
    const ordered = sortedMatches();
    const idx = ordered.findIndex(x => matchKey(x) === matchKey(m));
    return 'ECP-' + CURRENT_SEASON.codeYear + '-' + String(idx+1).padStart(4,'0');
  }
  function matchStatusBadge(m){
    const r = state.matchResults[matchKey(m)];
    const d = new Date(m.date+'T00:00:00');
    const isPast = !isNaN(d) && d < todayISO();
    if(r && r.status && r.status !== 'Pending'){
      const cls = r.status==='Won'?'won':(r.status==='Lost'?'lost':(r.status==='Tie'?'tie':'noresult'));
      return `<span class="badge ${cls}">${esc(r.status)}${r.detail?' · '+esc(r.detail):''}</span>`;
    }
    if(isPast) return `<span class="badge pending">Pending result</span>`;
    return `<span class="badge scheduled">Scheduled</span>`;
  }

  // ================= FIXTURES & MATCHES =================
  let fxFilters = { search:'', status:'all', opponent:'all', sort:'upcoming', from:'', to:'' };

  RENDERERS['fixtures'] = function(){
    const opponents = [...new Set(state.matches.map(m=>String(m.opponent||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    $('content').innerHTML = `
      <div class="toolbar-row">
        <div>
          <h1 class="page-title">Fixtures &amp; Matches</h1>
          <p class="page-sub">${state.matches.length} scheduled match${state.matches.length===1?'':'es'} this season.</p>
        </div>
        ${isAdmin ? `<button class="btn-solid" id="fxAddBtn">+ New match</button>` : ''}
      </div>
      <div class="filter-bar">
        <div class="filter-field" style="flex:2;min-width:220px;"><label>Search matches</label><input id="fxSearch" placeholder="Opponent or venue…" value="${esc(fxFilters.search)}"></div>
        <div class="filter-field"><label>Status</label><select id="fxStatus">
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="pending">Pending result</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="tie">Tie / No result</option>
        </select></div>
        <div class="filter-field"><label>Opponent</label><select id="fxOpponent"><option value="all">All opponents</option>${opponents.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>
        <div class="filter-field"><label>Sort by</label><select id="fxSort">
          <option value="upcoming">Upcoming first</option>
          <option value="recent">Most recent first</option>
        </select></div>
        <div class="filter-field"><label>From date</label><input type="date" id="fxFrom" value="${esc(fxFilters.from)}"></div>
        <div class="filter-field"><label>To date</label><input type="date" id="fxTo" value="${esc(fxFilters.to)}"></div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Match Code</th><th>Opponent / Fixture</th><th>Date &amp; Time</th><th>Venue</th><th>Status / Result</th><th>Actions</th>
          </tr></thead>
          <tbody id="fxRows"></tbody>
        </table>
      </div>
    `;
    $('fxSearch').value = fxFilters.search;
    $('fxStatus').value = fxFilters.status;
    $('fxOpponent').value = fxFilters.opponent;
    $('fxSort').value = fxFilters.sort;
    ['fxSearch','fxStatus','fxOpponent','fxSort','fxFrom','fxTo'].forEach(id=>{
      $(id).addEventListener('input', ()=>{ readFxFilters(); renderFxRows(); });
      $(id).addEventListener('change', ()=>{ readFxFilters(); renderFxRows(); });
    });
    if(isAdmin) $('fxAddBtn').addEventListener('click', ()=>openMatchEditor(null));
    renderFxRows();
  };
  function readFxFilters(){
    fxFilters = { search:$('fxSearch').value.trim().toLowerCase(), status:$('fxStatus').value, opponent:$('fxOpponent').value, sort:$('fxSort').value, from:$('fxFrom').value, to:$('fxTo').value };
  }
  function matchStatusKind(m){
    const r = state.matchResults[matchKey(m)];
    const d = new Date(m.date+'T00:00:00');
    const isPast = !isNaN(d) && d < todayISO();
    if(r && r.status === 'Won') return 'won';
    if(r && r.status === 'Lost') return 'lost';
    if(r && (r.status === 'Tie' || r.status === 'No result')) return 'tie';
    if(isPast) return 'pending';
    return 'scheduled';
  }
  function renderFxRows(){
    let rows = sortedMatches();
    if(fxFilters.search) rows = rows.filter(m => (m.opponent||'').toLowerCase().includes(fxFilters.search) || (m.venue||'').toLowerCase().includes(fxFilters.search));
    if(fxFilters.status !== 'all') rows = rows.filter(m => matchStatusKind(m) === fxFilters.status);
    if(fxFilters.opponent !== 'all') rows = rows.filter(m => String(m.opponent||'').trim() === fxFilters.opponent);
    if(fxFilters.from) rows = rows.filter(m => m.date >= fxFilters.from);
    if(fxFilters.to) rows = rows.filter(m => m.date <= fxFilters.to);
    rows = rows.sort((a,b)=> fxFilters.sort==='recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    const body = $('fxRows');
    if(!rows.length){ body.innerHTML = `<tr><td colspan="6" class="empty-note">No matches match these filters.</td></tr>`; return; }
    body.innerHTML = rows.map(m=>{
      const key = matchKey(m);
      return `<tr>
        <td class="code-cell">${esc(matchCode(m))}</td>
        <td><div class="opp-cell"><span class="vs-tag">VS</span><div><b>ECP Spartans</b><span>vs ${esc(m.opponent||'TBD')}</span></div></div></td>
        <td>${fmtDate(m.date)}${m.time?'<br><span style="color:var(--muted);font-size:12px;">'+esc(m.time)+'</span>':''}</td>
        <td>${esc(m.venue || m.location || '—')}</td>
        <td>${matchStatusBadge(m)}</td>
        <td><div class="row-actions">
          <button class="rbtn viewbtn" data-act="view" data-key="${esc(key)}">View</button>
          ${isAdmin ? `<button class="rbtn" data-act="score" data-key="${esc(key)}">Score</button>
          <button class="rbtn" data-act="edit" data-key="${esc(key)}">Edit</button>
          <button class="rbtn delete" data-act="delete" data-key="${esc(key)}">Delete</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const m = state.matches.find(x=>matchKey(x)===btn.dataset.key);
        if(!m) return;
        if(btn.dataset.act==='view') openMatchView(m);
        if(btn.dataset.act==='score') openScoreModal(m);
        if(btn.dataset.act==='edit') openMatchEditor(m);
        if(btn.dataset.act==='delete') deleteMatch(m);
      });
    });
  }

  async function fetchAvailability(key){
    try{
      const {data, error} = await supabase.from('availability_responses').select('player_name,status').eq('match_key', key);
      if(error) throw error;
      const rec = {};
      (data||[]).forEach(r => rec[r.player_name] = r.status);
      return rec;
    }catch(e){ return {}; }
  }

  async function openMatchView(m){
    const rec = await fetchAvailability(matchKey(m));
    const yes = state.contacts.filter(c=>rec[c.name]==='yes').map(c=>c.name);
    const no = state.contacts.filter(c=>rec[c.name]==='no').map(c=>c.name);
    const pending = state.contacts.filter(c=>!rec[c.name] || rec[c.name]==='pending').map(c=>c.name);
    const exp = expensesForMatch(m);
    openModal(`
      <button class="modal-close" id="mClose">×</button>
      <h3>${esc(matchCode(m))} · vs ${esc(m.opponent||'TBD')}</h3>
      <p class="modal-sub">${fmtDate(m.date)}${m.time?' · '+esc(m.time):''}${m.venue?' · '+esc(m.venue):''}</p>
      <div class="field" style="margin-bottom:14px;">${matchStatusBadge(m)} &nbsp; <span style="color:var(--muted);font-size:13px;">Expenses recorded: ${fmtMoney(exp)}</span></div>
      <div class="field"><label>Confirmed (${yes.length})</label><div class="avail-mini">${yes.length?yes.map(n=>`<span class="avail-chip yes">${esc(n)}</span>`).join(''):'<span class="empty-note">None yet</span>'}</div></div>
      <div class="field"><label>Not available (${no.length})</label><div class="avail-mini">${no.length?no.map(n=>`<span class="avail-chip no">${esc(n)}</span>`).join(''):'<span class="empty-note">None</span>'}</div></div>
      <div class="field"><label>Awaiting reply (${pending.length})</label><div class="avail-mini">${pending.length?pending.map(n=>`<span class="avail-chip">${esc(n)}</span>`).join(''):'<span class="empty-note">None</span>'}</div></div>
      <div class="modal-foot"><button class="btn-ghost" id="mClose2">Close</button></div>
    `);
    $('mClose').addEventListener('click', closeModal);
    $('mClose2').addEventListener('click', closeModal);
  }

  function openMatchEditor(m){
    const isNew = !m;
    openModal(`
      <button class="modal-close" id="mClose">×</button>
      <h3>${isNew ? 'New match' : 'Edit match'}</h3>
      <p class="modal-sub">${isNew ? 'Add a fixture to the schedule.' : esc(matchCode(m)) + ' · vs ' + esc(m.opponent||'TBD')}</p>
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date" id="emDate" value="${esc(m?m.date:'')}"></div>
        <div class="field"><label>Time</label><input type="text" id="emTime" placeholder="e.g. 09:00 AM" value="${esc(m?m.time:'')}"></div>
      </div>
      <div class="field"><label>Opponent</label><input type="text" id="emOpponent" value="${esc(m?m.opponent:'')}"></div>
      <div class="field"><label>Venue</label><input type="text" id="emVenue" value="${esc(m?m.venue:'')}"></div>
      <div class="field"><label>Location notes</label><input type="text" id="emLocation" value="${esc(m?m.location:'')}"></div>
      <div class="modal-foot">
        <button class="btn-ghost" id="mCancel">Cancel</button>
        <button class="btn-solid" id="mSave">${isNew?'Add match':'Save changes'}</button>
      </div>
    `);
    $('mClose').addEventListener('click', closeModal);
    $('mCancel').addEventListener('click', closeModal);
    $('mSave').addEventListener('click', async ()=>{
      if(!requireAdmin()) return;
      const date = $('emDate').value;
      const opponent = $('emOpponent').value.trim();
      if(!date || !opponent){ toast('Date and opponent are required.', true); return; }
      const updated = { date, opponent, time: $('emTime').value.trim(), venue: $('emVenue').value.trim(), location: $('emLocation').value.trim() };
      if(isNew){
        if(state.matches.some(x=>matchKey(x)===matchKey(updated))){ toast('A match with this date and opponent already exists.', true); return; }
        state.matches.push(updated);
      }else{
        const oldKey = matchKey(m);
        const idx = state.matches.findIndex(x=>matchKey(x)===oldKey);
        state.matches[idx] = updated;
        const newKey = matchKey(updated);
        if(newKey !== oldKey){
          if(state.expenses[oldKey]){ state.expenses[newKey] = state.expenses[oldKey]; delete state.expenses[oldKey]; }
        }
      }
      try{ await saveMatches(); closeModal(); toast(isNew?'Match added.':'Match updated.'); renderFxRows(); }
      catch(e){ toast('Could not save: '+e.message, true); }
    });
  }

  async function deleteMatch(m){
    if(!requireAdmin()) return;
    if(!confirm(`Delete ${matchCode(m)} (vs ${m.opponent})? This cannot be undone — its recorded expenses and results will no longer be shown anywhere.`)) return;
    state.matches = state.matches.filter(x=>matchKey(x)!==matchKey(m));
    try{ await saveMatches(); toast('Match deleted.'); renderFxRows(); }
    catch(e){ toast('Could not delete: '+e.message, true); }
  }

  function openScoreModal(m){
    const key = matchKey(m);
    const saved = state.matchResults[key] || {};
    const names = [...new Set(state.contacts.map(c=>c.name))].sort((a,b)=>a.localeCompare(b));
    openModal(`
      <button class="modal-close" id="mClose">×</button>
      <h3>Score · vs ${esc(m.opponent||'TBD')}</h3>
      <p class="modal-sub">${fmtDate(m.date)} — set the match result, then optionally log one player's performance.</p>
      <div class="field"><label>Result</label><select id="scStatus">
        ${['Pending','Won','Lost','Tie','No result'].map(s=>`<option value="${s}" ${saved.status===s?'selected':''}>${s==='Pending'?'Result pending':s}</option>`).join('')}
      </select></div>
      <div class="field"><label>Result detail</label><input id="scDetail" placeholder="e.g. Won by 5 wickets" value="${esc(saved.detail||'')}"></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0;">
      <p class="modal-sub" style="margin-top:-4px;">Add a player performance entry (optional) — feeds Player Statistics / Leaderboards.</p>
      <div class="field"><label>Player</label><select id="scPlayer"><option value="">— select —</option>${names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label>Runs</label><input type="number" id="scRuns" value="0" min="0"></div>
        <div class="field"><label>Balls faced</label><input type="number" id="scBalls" value="0" min="0"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Wickets</label><input type="number" id="scWickets" value="0" min="0"></div>
        <div class="field"><label>Catches</label><input type="number" id="scCatches" value="0" min="0"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" id="mCancel">Cancel</button>
        <button class="btn-solid" id="mSaveResult">Save result</button>
      </div>
    `);
    $('mClose').addEventListener('click', closeModal);
    $('mCancel').addEventListener('click', closeModal);
    $('mSaveResult').addEventListener('click', async ()=>{
      if(!requireAdmin()) return;
      state.matchResults[key] = { status: $('scStatus').value, detail: $('scDetail').value.trim() };
      const player = $('scPlayer').value;
      try{
        await saveMatchResults();
        if(player){
          state.matchStats.push({
            id: Date.now()+'-'+Math.random().toString(36).slice(2),
            matchKey: key, date: m.date, opponent: m.opponent, player,
            runs: num($('scRuns').value), balls: num($('scBalls').value),
            wickets: num($('scWickets').value), catches: num($('scCatches').value),
            batted: true, notOut: false
          });
          await saveMatchStats();
        }
        closeModal(); toast('Result saved.'); renderFxRows();
      }catch(e){ toast('Could not save: '+e.message, true); }
    });
  }

  // ================= FINANCE =================
  RENDERERS['financial-reports'] = function(){
    const exp = totalExpenses(), recv = totalContributionsReceived(), exp_ = totalContributionsExpected();
    const balance = recv - exp;
    $('content').innerHTML = `
      <h1 class="page-title">Financial Reports</h1>
      <p class="page-sub">Season totals, computed the same way as the Finances page on the live site.</p>
      <div class="stat-grid">
        <div class="stat-card"><div class="lbl">Season expenses</div><div class="val">${fmtMoney(exp)}</div><div class="foot">Recorded spending</div></div>
        <div class="stat-card"><div class="lbl">Contributions expected</div><div class="val">${fmtMoney(exp_)}</div><div class="foot">Across all players/months</div></div>
        <div class="stat-card"><div class="lbl">Contributions received</div><div class="val">${fmtMoney(recv)}</div><div class="foot">Confirmed payments</div></div>
        <div class="stat-card"><div class="lbl">Balance</div><div class="val">${fmtMoney(balance)}</div><div class="foot">Received minus expenses</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Per-match expenses</h3></div>
        <ul class="stat-mini-list">${sortedMatches().length ? sortedMatches().map(m=>`<li><span>vs ${esc(m.opponent)} · ${fmtDate(m.date)}</span><b>${fmtMoney(expensesForMatch(m))}</b></li>`).join('') : '<li class="empty-note">No matches yet.</li>'}</ul>
      </div>
    `;
  };

  RENDERERS['expenses'] = function(){
    $('content').innerHTML = `
      <h1 class="page-title">Expenses</h1>
      <p class="page-sub">Recorded spend by match — the same data behind Financial Reports and the Dashboard.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Match</th><th>Date</th><th>Entries</th><th>Total</th></tr></thead><tbody>
      ${sortedMatches().length ? sortedMatches().map(m=>{
        const items = state.expenses[matchKey(m)]||[];
        return `<tr><td>vs ${esc(m.opponent)}</td><td>${fmtDate(m.date)}</td><td>${items.length}</td><td><b>${fmtMoney(expensesForMatch(m))}</b></td></tr>`;
      }).join('') : '<tr><td colspan="4" class="empty-note">No expenses recorded yet.</td></tr>'}
      </tbody></table></div>
    `;
  };

  RENDERERS['expense-categories'] = function(){
    const totals = {};
    EXPENSE_CATEGORIES.forEach(c=>totals[c]=0);
    Object.values(state.expenses).forEach(items => (items||[]).forEach(i=>{ if(totals[i.category]!=null) totals[i.category]+=num(i.amount); }));
    $('content').innerHTML = `
      <h1 class="page-title">Expense Categories</h1>
      <p class="page-sub">The ${EXPENSE_CATEGORIES.length} categories recognised by the expense importer, with season-to-date totals.</p>
      <div class="pill-list">${EXPENSE_CATEGORIES.map(c=>`<div class="pill"><b>${fmtMoney(totals[c])}</b>${esc(c)}</div>`).join('')}</div>
    `;
  };

  RENDERERS['player-contributions'] = function(){
    const players = Object.values(state.contributions).sort((a,b)=>a.name.localeCompare(b.name));
    $('content').innerHTML = `
      <h1 class="page-title">Player Contributions</h1>
      <p class="page-sub">${players.length} player${players.length===1?'':'s'} with contribution records.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Player</th><th>Months tracked</th><th>Expected</th><th>Received</th><th>Pending</th></tr></thead><tbody>
      ${players.length ? players.map(p=>{
        let expected=0, received=0;
        Object.values(p.months||{}).forEach(mo=>{expected+=num(mo.expected); received+=num(mo.received);});
        const pending = Math.max(0, expected-received);
        return `<tr><td><b>${esc(p.name)}</b></td><td>${Object.keys(p.months||{}).length}</td><td>${fmtMoney(expected)}</td><td>${fmtMoney(received)}</td><td>${pending>0?`<span style="color:var(--red);font-weight:700;">${fmtMoney(pending)}</span>`:fmtMoney(0)}</td></tr>`;
      }).join('') : '<tr><td colspan="5" class="empty-note">No contribution data imported yet.</td></tr>'}
      </tbody></table></div>
    `;
  };

  RENDERERS['contribution-payments'] = ()=>{ $('content').innerHTML = comingSoon('Contribution Payments','A payment-by-payment ledger (date, method, receipt) on top of the monthly totals already in Player Contributions.'); };
  RENDERERS['contribution-periods'] = ()=>{ $('content').innerHTML = comingSoon('Contribution Periods','Define custom billing periods instead of calendar months.'); };
  RENDERERS['contribution-matrix'] = ()=>{ $('content').innerHTML = comingSoon('Contribution Matrix','A spreadsheet-style player × month grid for faster bulk edits.'); };
  RENDERERS['club-branding'] = ()=>{ $('content').innerHTML = comingSoon('Club Branding & Settings','Logo, colours, admin/user management.'); };

  // ================= STATISTICS =================
  function playerSeasonStat(name){
    const entries = state.matchStats.filter(it=>String(it.player||'').toLowerCase()===String(name).toLowerCase());
    const batting = entries.filter(it=>it.batted);
    const uniqueMatches = new Set(entries.map(it=>it.matchKey));
    return {
      name, matches: uniqueMatches.size, innings: batting.length,
      runs: entries.reduce((s,it)=>s+num(it.runs),0),
      notOuts: entries.filter(it=>it.notOut).length,
      highScore: batting.reduce((h,it)=>Math.max(h,num(it.runs)),0),
      balls: entries.reduce((s,it)=>s+num(it.balls),0),
      wickets: entries.reduce((s,it)=>s+num(it.wickets),0),
      catches: entries.reduce((s,it)=>s+num(it.catches),0)
    };
  }
  function allPlayerNames(){
    const map = new Map();
    state.contacts.forEach(c=>map.set(c.name.toLowerCase(), c.name));
    state.matchStats.forEach(it=>map.set(String(it.player||'').toLowerCase(), it.player));
    return [...map.values()].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  }

  RENDERERS['leaderboards'] = function(){
    const names = allPlayerNames();
    const byRuns = names.map(playerSeasonStat).sort((a,b)=>b.runs-a.runs).slice(0,5);
    const byWkts = names.map(playerSeasonStat).sort((a,b)=>b.wickets-a.wickets).slice(0,5);
    $('content').innerHTML = `
      <h1 class="page-title">Leaderboards</h1>
      <p class="page-sub">Top performers this season, from recorded match scores.</p>
      <div class="two-col">
        <div class="panel"><div class="panel-head"><h3>Top run scorers</h3></div>
          <ul class="stat-mini-list">${byRuns.length?byRuns.map(p=>`<li><span>${esc(p.name)}</span><b>${p.runs} runs</b></li>`).join(''):'<li class="empty-note">No scores recorded yet.</li>'}</ul>
        </div>
        <div class="panel"><div class="panel-head"><h3>Top wicket takers</h3></div>
          <ul class="stat-mini-list">${byWkts.length?byWkts.map(p=>`<li><span>${esc(p.name)}</span><b>${p.wickets} wkts</b></li>`).join(''):'<li class="empty-note">No scores recorded yet.</li>'}</ul>
        </div>
      </div>
    `;
  };

  RENDERERS['player-statistics'] = function(){
    const names = allPlayerNames();
    $('content').innerHTML = `
      <h1 class="page-title">Player Statistics</h1>
      <p class="page-sub">${names.length} player${names.length===1?'':'s'} with Team Sheet or scored entries.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Player</th><th>Mat</th><th>Inn</th><th>Runs</th><th>High</th><th>Avg</th><th>SR</th><th>Wkts</th><th>Catches</th></tr></thead><tbody>
      ${names.length ? names.map(n=>{
        const s = playerSeasonStat(n);
        const dismissals = s.innings - s.notOuts;
        const avg = dismissals>0 ? (s.runs/dismissals).toFixed(2) : '—';
        const sr = s.balls>0 ? ((s.runs/s.balls)*100).toFixed(1) : '—';
        return `<tr><td><b>${esc(n)}</b></td><td>${s.matches}</td><td>${s.innings}</td><td>${s.runs}</td><td>${s.highScore}</td><td>${avg}</td><td>${sr}</td><td>${s.wickets}</td><td>${s.catches}</td></tr>`;
      }).join('') : '<tr><td colspan="9" class="empty-note">No players yet.</td></tr>'}
      </tbody></table></div>
    `;
  };

  RENDERERS['team-statistics'] = function(){
    const completedStatuses = ['Won','Lost','Tie','No result'];
    const entries = state.matches.map(m=>({m, saved: state.matchResults[matchKey(m)]||{}}));
    const completed = entries.filter(e=>completedStatuses.includes(e.saved.status));
    const count = s => completed.filter(e=>e.saved.status===s).length;
    const won = count('Won'), lost = count('Lost'), tie = count('Tie'), nr = count('No result');
    const winPct = (won+lost) ? (won/(won+lost)*100).toFixed(1) : '0.0';
    $('content').innerHTML = `
      <h1 class="page-title">Team Statistics</h1>
      <p class="page-sub">${completed.length} completed match${completed.length===1?'':'es'} recorded this season.</p>
      <div class="stat-grid">
        <div class="stat-card"><div class="lbl">Won</div><div class="val">${won}</div></div>
        <div class="stat-card"><div class="lbl">Lost</div><div class="val">${lost}</div></div>
        <div class="stat-card"><div class="lbl">Tie</div><div class="val">${tie}</div></div>
        <div class="stat-card"><div class="lbl">No result</div><div class="val">${nr}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Win percentage</h3></div><div class="val" style="font-size:30px;color:var(--navy-dark);">${winPct}%</div></div>
    `;
  };

  // ================= CLUB MANAGEMENT =================
  RENDERERS['players'] = function(){
    $('content').innerHTML = `
      <h1 class="page-title">Players</h1>
      <p class="page-sub">The Team Sheet — same roster used across the whole site.</p>
      ${isAdmin ? `
      <div class="panel" style="margin-bottom:16px;">
        <div class="field-row" style="grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;">
          <div class="field"><label>Name</label><input id="plName"></div>
          <div class="field"><label>Phone</label><input id="plPhone"></div>
          <div class="field"><label>Email</label><input id="plEmail" type="email"></div>
          <button class="btn-solid" id="plAddBtn" style="height:38px;">Add</button>
        </div>
      </div>` : ''}
      <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Phone</th><th>Email</th>${isAdmin?'<th>Actions</th>':''}</tr></thead><tbody>
      ${state.contacts.length ? state.contacts.map((c,idx)=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone||'—')}</td><td>${esc(c.email||'—')}</td>${isAdmin?`<td><button class="rbtn delete" data-idx="${idx}">Remove</button></td>`:''}</tr>`).join('') : `<tr><td colspan="${isAdmin?4:3}" class="empty-note">No players added yet.</td></tr>`}
      </tbody></table></div>
    `;
    if(isAdmin){
      $('plAddBtn').addEventListener('click', async ()=>{
        const name = $('plName').value.trim(), phone = $('plPhone').value.trim(), email = $('plEmail').value.trim().toLowerCase();
        if(!name || !phone){ toast('Name and phone are required.', true); return; }
        state.contacts.push({name, phone, email});
        try{ await saveContacts(); toast('Player added.'); RENDERERS['players'](); }
        catch(e){ toast('Could not save: '+e.message, true); }
      });
      document.querySelectorAll('[data-idx]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const c = state.contacts[btn.dataset.idx];
          if(!confirm(`Remove ${c.name} from the Team Sheet?`)) return;
          state.contacts.splice(btn.dataset.idx,1);
          try{ await saveContacts(); toast('Player removed.'); RENDERERS['players'](); }
          catch(e){ toast('Could not save: '+e.message, true); }
        });
      });
    }
  };

  RENDERERS['opponents'] = function(){
    const map = new Map();
    state.matches.forEach(m=>{
      const key = opponentKey(m.opponent); if(!key) return;
      if(!map.has(key)) map.set(key, {name:m.opponent, played:0, won:0, lost:0});
      const rec = map.get(key); rec.played++;
      const r = state.matchResults[matchKey(m)];
      if(r && r.status==='Won') rec.won++;
      if(r && r.status==='Lost') rec.lost++;
    });
    const rows = [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    $('content').innerHTML = `
      <h1 class="page-title">Opponents</h1>
      <p class="page-sub">Every team you've faced this season, derived from the fixture list.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Team</th><th>Matches played</th><th>Won</th><th>Lost</th></tr></thead><tbody>
      ${rows.length ? rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-note">No fixtures yet.</td></tr>'}
      </tbody></table></div>
    `;
  };

  RENDERERS['grounds'] = function(){
    const map = new Map();
    state.matches.forEach(m=>{
      const v = (m.venue||m.location||'').trim(); if(!v) return;
      map.set(v, (map.get(v)||0)+1);
    });
    const rows = [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    $('content').innerHTML = `
      <h1 class="page-title">Grounds</h1>
      <p class="page-sub">Venues in use this season, derived from the fixture list.</p>
      <div class="pill-list">${rows.length ? rows.map(([v,c])=>`<div class="pill"><b>${c} match${c===1?'':'es'}</b>${esc(v)}</div>`).join('') : '<div class="empty-note">No venues recorded yet.</div>'}</div>
    `;
  };

  showView('overview');
})();

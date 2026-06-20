// 로컬 시간 기준 YYYY-MM-DD (toISOString은 UTC라 한국 자정~9시에 날짜 어긋남)
function _localDateStr(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ── 로딩 오버레이 & 토스트 헬퍼 ──
let _toastTimer = null;

function showToast(msg, type = 'loading', duration = 0) {
    const el = document.getElementById('app-toast');
    const msgEl = document.getElementById('toast-msg');
    const iconEl = document.getElementById('toast-icon-el');
    if (!el || !msgEl) return;

    el.className = '';
    if (type === 'loading') {
        iconEl.innerHTML = '<span class="toast-spinner"></span>';
    } else {
        iconEl.innerHTML = `<span class="toast-icon"></span>`;
        el.classList.add(type === 'success' ? 'toast-success' : 'toast-error');
    }
    msgEl.textContent = msg;
    el.classList.add('visible');

    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    if (duration > 0) {
        _toastTimer = setTimeout(hideToast, duration);
    }
}

function hideToast() {
    const el = document.getElementById('app-toast');
    if (el) el.classList.remove('visible');
}

function setLoadingLabel(main, sub = '') {
    const lbl = document.getElementById('loading-label');
    const sub2 = document.getElementById('loading-sub');
    if (lbl) lbl.textContent = main;
    if (sub2) sub2.textContent = sub;
}

function hideAppOverlay() {
    const overlay = document.getElementById('app-loading-overlay');
    if (!overlay) return;
    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.style.display = 'none'; }, 420);
}

// Build allPlayers from embedded match data — type/level/gender 연동
(function() {
    const playerSet = new Set();
    const memberMap = {};
    data.members.forEach(m => { memberMap[m.name] = m; });
    data.matches.forEach(m => { [m.a1, m.a2, m.b1, m.b2].forEach(n => playerSet.add(n)); });
    data.allPlayers = [];
    playerSet.forEach(name => {
        const mi = memberMap[name];
        data.allPlayers.push({
            name,
            gender: mi ? mi.gender : '남',
            type: mi ? mi.type : '비회원',
            level: mi ? mi.level : 6
        });
    });
    data.allPlayers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
})();

// 헬퍼: 선수의 type 조회
function getMemberType(name) {
    const m = data.members.find(p => p.name === name);
    if (m) return m.type || '비회원';
    const a = data.allPlayers.find(p => p.name === name);
    return a ? (a.type || '비회원') : '비회원';
}

// 로컬에 수정된 경기 데이터가 있으면 우선 적용
(function _loadLocalMatches() {
    try {
        const saved = localStorage.getItem('inout_edited_matches');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                data.matches = parsed;
            }
        }
    } catch(e) {}
})();

let matches = JSON.parse(JSON.stringify(data.matches));
let stats = {};
let currentFilter = { type: 'all' };
let memberMode = 'members'; // 'members' or 'all'

// ============================================
// Admin mode: ?admin=PIN 으로 접근 시 관리자 탭 표시
// ============================================
const ADMIN_PIN = '1234';
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === ADMIN_PIN;
const adminTabs = ['detail', 'scheduler', 'recorder', 'matches', 'members'];

(function applyAdminMode() {
    if (!isAdmin) {
        // 비공개 탭 버튼 숨기기
        document.querySelectorAll('.tab-button').forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick') || '';
            for (const tabId of adminTabs) {
                if (onclickAttr.includes("'" + tabId + "'")) {
                    btn.style.display = 'none';
                    btn.classList.remove('active');
                }
            }
        });
        // 비공개 탭 콘텐츠 숨기기
        adminTabs.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.style.display = 'none'; el.classList.remove('active'); }
        });
        // 첫 번째 공개 탭 활성화
        const firstBtn = document.querySelector('.tab-button[style=""], .tab-button:not([style*="display: none"])');
        if (firstBtn && !document.querySelector('.tab-button.active[style=""], .tab-button.active:not([style*="display: none"])')) {
            firstBtn.classList.add('active');
            const match = (firstBtn.getAttribute('onclick') || '').match(/'([^']+)'/);
            if (match) {
                const el = document.getElementById(match[1]);
                if (el) el.classList.add('active');
            }
        }
    }
})();

// Theme management
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-theme-btn') === theme);
    });
    try { localStorage.setItem('tennis-theme', theme); } catch(e) {}
}
// Load saved theme on startup
try {
    const saved = localStorage.getItem('tennis-theme');
    if (saved) setTheme(saved);
} catch(e) {}

function getActiveMembers() {
    if (memberMode === 'members') {
        return data.allPlayers.filter(p => p.type === '회원');
    }
    return data.allPlayers;
}

function setMemberMode(mode) {
    memberMode = mode;
    document.getElementById('toggle-members').classList.toggle('active', mode === 'members');
    document.getElementById('toggle-all').classList.toggle('active', mode === 'all');
    const info = document.getElementById('member-mode-info');
    const active = getActiveMembers();
    const memberCount = data.allPlayers.filter(p => p.type === '회원').length;
    const nonMemberCount = data.allPlayers.filter(p => p.type !== '회원').length;
    if (mode === 'members') {
        info.textContent = `회원 ${memberCount}명`;
    } else {
        info.textContent = `전체 ${active.length}명 (회원 ${memberCount}명 + 비회원 ${nonMemberCount}명)`;
    }
    initializeDropdowns();
    recalculate();
}

function buildPeriodButtons() {
    const allDates = data.matches.map(m => m.d).filter(Boolean).sort();
    const years = [...new Set(allDates.map(d => d.substring(0, 4)))].sort();
    const months = [...new Set(allDates.map(d => d.substring(0, 7)))].sort();
    const container = document.getElementById('period-buttons');
    container.innerHTML = '<button class="period-btn active" data-period="all" onclick="setPeriod(\'all\', this)">전체</button>';

    // Year buttons
    years.forEach(y => {
        container.innerHTML += `<button class="period-btn" data-period="year-${y}" onclick="setPeriod('year-${y}', this)">${y}년</button>`;
    });

    // Recent period buttons
    container.innerHTML += `<button class="period-btn" data-period="recent-1m" onclick="setPeriod('recent-1m', this)">최근 1개월</button>`;
    container.innerHTML += `<button class="period-btn" data-period="recent-3m" onclick="setPeriod('recent-3m', this)">최근 3개월</button>`;

    // If many months, add month dropdown
    if (months.length > 2) {
        let monthSelect = `<select id="month-select" style="background:var(--input-bg); color:var(--text-label); border:1px solid var(--border-secondary); border-radius:20px; padding:6px 12px; font-size:12px; font-family:inherit; cursor:pointer;" onchange="setMonthFilter(this)">`;
        monthSelect += `<option value="">월별 선택</option>`;
        months.reverse().forEach(m => {
            const [y, mo] = m.split('-');
            monthSelect += `<option value="${m}">${y}년 ${parseInt(mo)}월</option>`;
        });
        monthSelect += `</select>`;
        container.innerHTML += monthSelect;
    }

    // Set date range inputs
    if (allDates.length > 0) {
        document.getElementById('filter-from').value = allDates[0];
        document.getElementById('filter-to').value = allDates[allDates.length - 1];
    }
}

function setPeriod(period, btn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const ms = document.getElementById('month-select');
    if (ms) ms.value = '';

    if (period === 'all') {
        currentFilter = { type: 'all' };
    } else if (period.startsWith('year-')) {
        const year = period.replace('year-', '');
        currentFilter = { type: 'range', from: `${year}-01-01`, to: `${year}-12-31` };
    } else if (period === 'recent-1m') {
        const to = new Date();
        const from = new Date();
        from.setMonth(from.getMonth() - 1);
        currentFilter = { type: 'range', from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
    } else if (period === 'recent-3m') {
        const to = new Date();
        const from = new Date();
        from.setMonth(from.getMonth() - 3);
        currentFilter = { type: 'range', from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
    }
    applyFilter();
}

function setMonthFilter(select) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    if (!select.value) { setPeriod('all', document.querySelector('[data-period="all"]')); return; }
    const [y, m] = select.value.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    currentFilter = { type: 'range', from: `${select.value}-01`, to: `${select.value}-${lastDay}` };
    applyFilter();
}

function applyCustomRange() {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-period="custom"]').classList.add('active');
    const ms = document.getElementById('month-select');
    if (ms) ms.value = '';
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    if (!from || !to) { alert('시작일과 종료일을 입력하세요.'); return; }
    currentFilter = { type: 'range', from, to };
    applyFilter();
}

function applyFilter() {
    if (currentFilter.type === 'all') {
        matches = JSON.parse(JSON.stringify(data.matches));
    } else {
        matches = data.matches.filter(m => m.d >= currentFilter.from && m.d <= currentFilter.to);
        matches = JSON.parse(JSON.stringify(matches));
    }
    // Show filter info
    const info = document.getElementById('filter-info');
    if (currentFilter.type === 'all') {
        info.style.display = 'none';
    } else {
        info.style.display = 'block';
        info.textContent = `📅 ${currentFilter.from} ~ ${currentFilter.to}  |  ${matches.length}경기 표시 중`;
    }
    recalculate();
}

function initializeDropdowns() {
    const members = getActiveMembers().map(m => m.name);
    const selects = ['detail-member', 'trend-member', 'matchup-filter'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">선택...</option>';
        members.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    });
    // Partner filter dropdown
    const pf = document.getElementById('partner-filter');
    const prevPF = pf.value;
    pf.innerHTML = '<option value="">전체 조합</option>';
    members.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        pf.appendChild(option);
    });
    if (prevPF) pf.value = prevPF;
    // Opponent filter dropdown
    const of2 = document.getElementById('opponent-filter');
    const prevOF = of2.value;
    of2.innerHTML = '<option value="">히트맵 보기</option>';
    members.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        of2.appendChild(option);
    });
    if (prevOF) of2.value = prevOF;
}

function getTrend(recent, overall) {
    if (recent > overall + 0.05) return '↑';
    if (recent < overall - 0.05) return '↓';
    return '→';
}

function getTrendClass(trend) {
    if (trend === '↑') return 'trend-up';
    if (trend === '↓') return 'trend-down';
    return 'trend-flat';
}

function getWinRateColor(wr) {
    if (wr >= 0.60) return 'rgba(16,185,129,0.12)';
    if (wr >= 0.40) return 'rgba(245,158,11,0.10)';
    return 'rgba(239,68,68,0.10)';
}

function getWinRateTextColor(wr) {
    const cs = getComputedStyle(document.documentElement);
    if (wr >= 0.60) return cs.getPropertyValue('--win-color').trim() || '#34d399';
    if (wr >= 0.40) return cs.getPropertyValue('--wr-mid').trim() || '#fbbf24';
    return cs.getPropertyValue('--loss-color').trim() || '#f87171';
}

function recalculate() {
    stats = {};

    getActiveMembers().forEach(member => {
        stats[member.name] = {
            name: member.name,
            gender: member.gender,
            games: [],
            w: 0,
            d: 0,
            l: 0
        };
    });

    matches.forEach(match => {
        const { d, a1, a2, b1, b2, ls, rs } = match;
        const aWin = ls > rs ? 1 : (ls === rs ? 0 : -1);
        const bWin = rs > ls ? 1 : (rs === ls ? 0 : -1);

        [a1, a2].forEach(player => {
            if (stats[player]) {
                stats[player].games.push({ date: d, result: aWin, score: `${ls}-${rs}` });
                if (aWin === 1) stats[player].w++;
                else if (aWin === 0) stats[player].d++;
                else stats[player].l++;
            }
        });

        [b1, b2].forEach(player => {
            if (stats[player]) {
                stats[player].games.push({ date: d, result: bWin, score: `${ls}-${rs}` });
                if (bWin === 1) stats[player].w++;
                else if (bWin === 0) stats[player].d++;
                else stats[player].l++;
            }
        });
    });

    renderSummary();
    renderMVP();
    renderPartners();
    renderOpponents();
    renderClutch();
    renderStreaks();
    renderMatchups();
    renderAttendance();
    renderTrend();
    renderMonthlyTrend();
    updateRecentMatches();
    if (typeof renderDataStats === 'function') renderDataStats();
    if (typeof renderRecordHistory === 'function') renderRecordHistory();
}

function renderSummary() {
    const tbody = document.getElementById('summary-table');
    tbody.innerHTML = '';

    const sorted = Object.values(stats)
        .filter(s => s.games.length > 0)
        .sort((a, b) => {
            const wrA = (a.w + a.d * 0.5) / a.games.length;
            const wrB = (b.w + b.d * 0.5) / b.games.length;
            return wrB - wrA;
        });

    sorted.forEach(s => {
        const total = s.games.length;
        const wr = (s.w + s.d * 0.5) / total;
        const recent10 = s.games.slice(-10);
        const recentWr = recent10.length > 0 ? recent10.filter(g => g.result > 0).length / recent10.length + (recent10.filter(g => g.result === 0).length * 0.5) / recent10.length : 0;
        const trend = getTrend(recentWr, wr);

        const row = document.createElement('tr');
        if (isAdmin) {
            row.className = 'clickable-row';
            row.onclick = () => {
                document.getElementById('detail-member').value = s.name;
                switchTab({ target: { textContent: '개인 상세' } }, 'detail');
                showMemberDetail();
            };
        }
        row.style.backgroundColor = getWinRateColor(wr);
        row.style.borderLeft = '3px solid ' + getWinRateTextColor(wr);
        row.style.color = 'var(--text-secondary)';

        const wrColor = getWinRateTextColor(wr);
        const mType = getMemberType(s.name);
        const typeBadge = mType === '회원'
            ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>'
            : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
        row.innerHTML = `
            <td style="white-space:nowrap;">${typeBadge}<strong style="color:var(--text-primary)">${s.name}</strong></td>
            <td><span class="gender-badge gender-${s.gender === '여' ? 'f' : 'm'}">${s.gender}</span></td>
            <td>${total}</td>
            <td>${s.w}</td>
            <td>${s.d}</td>
            <td>${s.l}</td>
            <td><strong style="color:${wrColor}">${(wr * 100).toFixed(1)}%</strong></td>
            <td style="color:${getWinRateTextColor(recentWr)}">${(recentWr * 100).toFixed(1)}%</td>
            <td><span class="trend-indicator ${getTrendClass(trend)}">${trend}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function renderPartners() {
    const filterMember = document.getElementById('partner-filter').value;
    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const pairs = {};
    matches.forEach(m => {
        // Only count pairs where both players are active members
        const a1ok = activeNames.has(m.a1), a2ok = activeNames.has(m.a2);
        const b1ok = activeNames.has(m.b1), b2ok = activeNames.has(m.b2);
        const pair1 = [m.a1, m.a2].sort().join('|');
        const pair2 = [m.b1, m.b2].sort().join('|');
        if (a1ok && a2ok) {
            if (!pairs[pair1]) pairs[pair1] = { w: 0, d: 0, l: 0, games: 0 };
            pairs[pair1].games++;
            if (m.ls > m.rs) pairs[pair1].w++;
            else if (m.ls === m.rs) pairs[pair1].d++;
            else pairs[pair1].l++;
        }
        if (b1ok && b2ok) {
            if (!pairs[pair2]) pairs[pair2] = { w: 0, d: 0, l: 0, games: 0 };
            pairs[pair2].games++;
            if (m.rs > m.ls) pairs[pair2].w++;
            else if (m.rs === m.ls) pairs[pair2].d++;
            else pairs[pair2].l++;
        }
    });

    const tbody = document.getElementById('partners-table');
    tbody.innerHTML = '';

    const results = Object.entries(pairs)
        .filter(([, v]) => v.games >= 2)
        .map(([k, v]) => {
            const [p1, p2] = k.split('|');
            const wr = (v.w + v.d * 0.5) / v.games;
            const avgWr = (((stats[p1]?.w || 0) + (stats[p1]?.d || 0) * 0.5) / (stats[p1]?.games.length || 1) + ((stats[p2]?.w || 0) + (stats[p2]?.d || 0) * 0.5) / (stats[p2]?.games.length || 1)) / 2;
            const synergy = wr - avgWr;
            return { p1, p2, wr, synergy, ...v };
        })
        .filter(r => !filterMember || r.p1 === filterMember || r.p2 === filterMember)
        .sort((a, b) => b.wr - a.wr);

    // Update title & count
    const title = document.getElementById('partners-title');
    const countEl = document.getElementById('partner-count');
    if (filterMember) {
        title.textContent = `${filterMember}의 파트너 조합`;
        countEl.textContent = `${results.length}개 조합`;
    } else {
        title.textContent = '파트너 조합 (2경기 이상)';
        countEl.textContent = `${results.length}개 조합`;
    }

    results.forEach(r => {
            const wrColor = getWinRateTextColor(r.wr);
            const row = document.createElement('tr');
            row.style.borderLeft = '3px solid ' + wrColor;
            const t1 = getMemberType(r.p1), t2 = getMemberType(r.p2);
            const b1 = t1 === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            const b2 = t2 === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            row.innerHTML = `
                <td>${b1}<strong>${r.p1}</strong></td>
                <td>${b2}<strong>${r.p2}</strong></td>
                <td>${r.games}</td>
                <td>${r.w}</td>
                <td>${r.d}</td>
                <td>${r.l}</td>
                <td><strong style="color:${wrColor}">${(r.wr * 100).toFixed(1)}%</strong></td>
                <td style="color: ${r.synergy > 0 ? '#34d399' : '#f87171'}">${r.synergy > 0 ? '+' : ''}${(r.synergy * 100).toFixed(1)}%</td>
            `;
            tbody.appendChild(row);
        });

    // Show visual chart when a member is selected
    const chartCard = document.getElementById('partner-chart-card');
    const chartDiv = document.getElementById('partner-chart');
    if (filterMember && results.length > 0) {
        chartCard.style.display = 'block';
        document.getElementById('partner-chart-title').textContent = `${filterMember}의 파트너별 승률`;
        chartDiv.innerHTML = '';
        results.forEach(r => {
            const partner = r.p1 === filterMember ? r.p2 : r.p1;
            const pct = (r.wr * 100).toFixed(1);
            const colorClass = r.wr >= 0.6 ? 'color-excellent' : r.wr >= 0.4 ? 'color-good' : 'color-poor';
            const synergyStr = r.synergy > 0 ? `<span style="color:#34d399;font-size:11px;margin-left:6px;">▲${(r.synergy*100).toFixed(1)}%</span>` : `<span style="color:#f87171;font-size:11px;margin-left:6px;">▼${(Math.abs(r.synergy)*100).toFixed(1)}%</span>`;
            chartDiv.innerHTML += `
                <div class="bar-container">
                    <div class="bar-label">${partner} <span style="color:var(--text-dimmed);font-size:11px;">(${r.games}경기)</span></div>
                    <div class="bar-wrapper">
                        <div class="bar-fill ${colorClass}" style="width: ${pct}%"></div>
                    </div>
                    <div class="bar-percent">${pct}%${synergyStr}</div>
                </div>
            `;
        });
    } else {
        chartCard.style.display = 'none';
    }
}

function getOpponentData() {
    const opponents = {};
    const clubMembers = getActiveMembers().map(m => m.name);
    clubMembers.forEach(p => {
        opponents[p] = {};
        clubMembers.forEach(o => {
            if (p !== o) opponents[p][o] = { w: 0, d: 0, l: 0, history: [] };
        });
    });
    const sorted = [...matches].sort((a, b) => a.d.localeCompare(b.d));
    sorted.forEach(m => {
        const aWin = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        [m.a1, m.a2].forEach(p => {
            [m.b1, m.b2].forEach(o => {
                if (p !== o && opponents[p] && opponents[p][o]) {
                    if (aWin === 1) opponents[p][o].w++;
                    else if (aWin === 0) opponents[p][o].d++;
                    else opponents[p][o].l++;
                    opponents[p][o].history.push({ d: m.d, result: aWin });
                }
            });
        });
        [m.b1, m.b2].forEach(p => {
            [m.a1, m.a2].forEach(o => {
                if (p !== o && opponents[p] && opponents[p][o]) {
                    if (aWin === -1) opponents[p][o].w++;
                    else if (aWin === 0) opponents[p][o].d++;
                    else opponents[p][o].l++;
                    opponents[p][o].history.push({ d: m.d, result: -aWin });
                }
            });
        });
    });
    return opponents;
}

function heatmapColor(wr) {
    // Smooth gradient: red → neutral → green
    if (wr >= 0.8) return 'rgba(16,185,129,0.45)';
    if (wr >= 0.65) return 'rgba(16,185,129,0.28)';
    if (wr >= 0.55) return 'rgba(16,185,129,0.14)';
    if (wr >= 0.45) return 'rgba(120,160,140,0.08)';
    if (wr >= 0.35) return 'rgba(239,68,68,0.14)';
    if (wr >= 0.2) return 'rgba(239,68,68,0.28)';
    return 'rgba(239,68,68,0.45)';
}

function heatmapTextColor(wr) {
    if (wr >= 0.65) return '#34d399';
    if (wr >= 0.55) return '#81c784';
    if (wr >= 0.45) return 'var(--text-muted)';
    if (wr >= 0.35) return '#e57373';
    return '#f87171';
}

function renderOpponents() {
    const filterMember = document.getElementById('opponent-filter').value;
    const opponents = getOpponentData();
    const clubMembers = getActiveMembers().map(m => m.name);
    const heatmapCard = document.getElementById('heatmap-card');
    const detailCard = document.getElementById('opponent-detail-card');

    if (filterMember) {
        // Individual view
        heatmapCard.style.display = 'none';
        detailCard.style.display = 'block';
        document.getElementById('opponent-detail-title').textContent = `${filterMember}의 상대 전적`;

        const rows = [];
        clubMembers.forEach(o => {
            if (o === filterMember || !opponents[filterMember] || !opponents[filterMember][o]) return;
            const s = opponents[filterMember][o];
            const total = s.w + s.d + s.l;
            if (total < 1) return;
            const wr = (s.w + s.d * 0.5) / total;
            // Recent 5 matches
            const recent5 = (s.history || []).slice(-5);
            const r5w = recent5.filter(h => h.result === 1).length;
            const r5d = recent5.filter(h => h.result === 0).length;
            const r5total = recent5.length;
            const r5wr = r5total > 0 ? (r5w + r5d * 0.5) / r5total : null;
            // Tag: 천적 or Easy Win
            let tag = '';
            if (total >= 3 && wr <= 0.3) tag = '천적';
            else if (total >= 3 && wr >= 0.7) tag = 'Easy Win';
            rows.push({ name: o, total, w: s.w, d: s.d, l: s.l, wr, r5wr, r5w, r5d, r5l: r5total - r5w - r5d, r5total, tag, recent5 });
        });
        rows.sort((a, b) => b.wr - a.wr);

        // ── Summary cards ──
        const summaryDiv = document.getElementById('opponent-summary-cards');
        const nemesis = rows.filter(r => r.total >= 3).sort((a, b) => a.wr - b.wr)[0];
        const prey = rows.filter(r => r.total >= 3).sort((a, b) => b.wr - a.wr)[0];
        const mostPlayed = [...rows].sort((a, b) => b.total - a.total)[0];
        let summaryHtml = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">';
        if (prey) {
            summaryHtml += `<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:11px; color:#34d399; font-weight:600; margin-bottom:6px;">Easy Win</div>
                <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${prey.name}</div>
                <div style="font-size:12px; color:#34d399; margin-top:4px;">${(prey.wr*100).toFixed(1)}% (${prey.w}승 ${prey.d}무 ${prey.l}패)</div>
            </div>`;
        }
        if (nemesis) {
            summaryHtml += `<div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:11px; color:#f87171; font-weight:600; margin-bottom:6px;">천적</div>
                <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${nemesis.name}</div>
                <div style="font-size:12px; color:#f87171; margin-top:4px;">${(nemesis.wr*100).toFixed(1)}% (${nemesis.w}승 ${nemesis.d}무 ${nemesis.l}패)</div>
            </div>`;
        }
        if (mostPlayed) {
            summaryHtml += `<div style="background:rgba(139,105,20,0.1); border:1px solid rgba(139,105,20,0.3); border-radius:12px; padding:14px; text-align:center;">
                <div style="font-size:11px; color:var(--accent-text); font-weight:600; margin-bottom:6px;">최다 대전</div>
                <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${mostPlayed.name}</div>
                <div style="font-size:12px; color:var(--accent-text); margin-top:4px;">${mostPlayed.total}경기 (승률 ${(mostPlayed.wr*100).toFixed(1)}%)</div>
            </div>`;
        }
        summaryHtml += '</div>';
        summaryDiv.innerHTML = summaryHtml;

        // Chart
        const chartDiv = document.getElementById('opponent-detail-chart');
        chartDiv.innerHTML = '';
        rows.forEach(r => {
            const pct = (r.wr * 100).toFixed(1);
            const colorClass = r.wr >= 0.6 ? 'color-excellent' : r.wr >= 0.4 ? 'color-good' : 'color-poor';
            const tagLabel = r.tag === '천적' ? ' <span style="color:#f87171;font-size:10px;font-weight:700;background:rgba(239,68,68,0.15);padding:1px 6px;border-radius:8px;">천적</span>'
                : r.tag === 'Easy Win' ? ' <span style="color:#34d399;font-size:10px;font-weight:700;background:rgba(16,185,129,0.15);padding:1px 6px;border-radius:8px;">Easy Win</span>' : '';
            chartDiv.innerHTML += `
                <div class="bar-container">
                    <div class="bar-label">${r.name}${tagLabel} <span style="color:var(--text-dimmed);font-size:11px;">(${r.total})</span></div>
                    <div class="bar-wrapper">
                        <div class="bar-fill ${colorClass}" style="width: ${pct}%"></div>
                    </div>
                    <div class="bar-percent">${pct}%</div>
                </div>`;
        });

        // Table
        const tbody = document.getElementById('opponent-detail-table');
        tbody.innerHTML = '';
        rows.forEach(r => {
            const wrColor = getWinRateTextColor(r.wr);
            const row = document.createElement('tr');
            row.style.borderLeft = '3px solid ' + wrColor;
            const oType = getMemberType(r.name);
            const oBadge = oType === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            // Recent 5 visual dots
            let r5Html = '';
            if (r.recent5 && r.recent5.length > 0) {
                r.recent5.forEach(h => {
                    const c = h.result === 1 ? '#34d399' : (h.result === 0 ? '#fbbf24' : '#f87171');
                    const label = h.result === 1 ? '승' : (h.result === 0 ? '무' : '패');
                    r5Html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin:0 1px;" title="${h.d} ${label}"></span>`;
                });
                if (r.r5wr !== null) {
                    r5Html += `<span style="font-size:11px;color:var(--text-dimmed);margin-left:4px;">${(r.r5wr*100).toFixed(0)}%</span>`;
                }
            } else {
                r5Html = '<span style="color:var(--text-dimmed);">-</span>';
            }
            // Tag
            let tagHtml = '';
            if (r.tag === '천적') tagHtml = '<span style="color:#f87171;font-size:11px;font-weight:700;background:rgba(239,68,68,0.15);padding:2px 8px;border-radius:8px;">천적</span>';
            else if (r.tag === 'Easy Win') tagHtml = '<span style="color:#34d399;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);padding:2px 8px;border-radius:8px;">Easy Win</span>';
            else tagHtml = '<span style="color:var(--text-dimmed);">-</span>';
            row.innerHTML = `
                <td>${oBadge}<strong>${r.name}</strong></td>
                <td>${r.total}</td>
                <td>${r.w}</td>
                <td>${r.d}</td>
                <td>${r.l}</td>
                <td><strong style="color:${wrColor}">${(r.wr * 100).toFixed(1)}%</strong></td>
                <td style="white-space:nowrap;">${r5Html}</td>
                <td>${tagHtml}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        // Heatmap view
        heatmapCard.style.display = 'block';
        detailCard.style.display = 'none';

        const container = document.getElementById('heatmap-container');
        // Filter to members who actually played
        const activePlayers = clubMembers.filter(p => {
            return matches.some(m => m.a1 === p || m.a2 === p || m.b1 === p || m.b2 === p);
        });

        // Dynamic sizing based on player count
        const n = activePlayers.length;
        const cellSize = n <= 8 ? 48 : n <= 14 ? 40 : n <= 20 ? 34 : 28;
        const fontSize = n <= 8 ? 12 : n <= 14 ? 11 : n <= 20 ? 10 : 9;
        const showPercent = n <= 20;

        let html = '<div class="heatmap-wrap">';
        html += '<table class="heatmap-table"><thead><tr><th class="corner"></th>';
        activePlayers.forEach(o => {
            const hType = getMemberType(o);
            const dot = hType === '회원' ? '<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:#10b981;margin-bottom:3px;"></span> ' : '';
            html += `<th class="col-header" title="${o}" style="min-width:${cellSize}px;max-width:${cellSize}px;">${dot}${o}</th>`;
        });
        html += '</tr></thead><tbody>';

        activePlayers.forEach(p => {
            const hType = getMemberType(p);
            const hDot = hType === '회원' ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#10b981;margin-right:3px;"></span>' : '';
            html += `<tr><th class="row-header">${hDot}${p}</th>`;
            activePlayers.forEach(o => {
                const sizeStyle = `width:${cellSize}px;height:${cellSize}px;font-size:${fontSize}px;line-height:${cellSize}px;`;
                if (p === o) {
                    html += `<td class="cell-self" style="${sizeStyle}">·</td>`;
                } else if (!opponents[p] || !opponents[p][o]) {
                    html += `<td class="cell-empty" style="${sizeStyle}">-</td>`;
                } else {
                    const s = opponents[p][o];
                    const total = s.w + s.d + s.l;
                    if (total >= 2) {
                        const wr = (s.w + s.d * 0.5) / total;
                        const bg = heatmapColor(wr);
                        const tc = heatmapTextColor(wr);
                        const label = showPercent ? (wr*100).toFixed(0)+'%' : s.w+'';
                        const glow = wr >= 0.65 ? 'box-shadow:inset 0 0 8px rgba(16,185,129,0.15);' : wr <= 0.35 ? 'box-shadow:inset 0 0 8px rgba(239,68,68,0.15);' : '';
                        html += `<td style="${sizeStyle}background:${bg};color:${tc};cursor:pointer;${glow}" title="${p} vs ${o}: ${s.w}승 ${s.d}무 ${s.l}패 (${(wr*100).toFixed(1)}%)" onclick="document.getElementById('opponent-filter').value='${p}';renderOpponents();">${label}</td>`;
                    } else if (total >= 1) {
                        html += `<td class="cell-empty" style="${sizeStyle}color:var(--text-dimmed);" title="${p} vs ${o}: ${s.w}승 ${s.d}무 ${s.l}패">${total}</td>`;
                    } else {
                        html += `<td class="cell-empty" style="${sizeStyle}">-</td>`;
                    }
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        // Legend
        html += `<div class="heatmap-legend">
            <span style="font-weight:600; color:var(--text-secondary);">승률</span>
            <span class="heatmap-legend-swatch" style="background:rgba(239,68,68,0.45);"></span><span>~20%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(239,68,68,0.28);"></span><span>~35%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(239,68,68,0.14);"></span><span>~45%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(120,160,140,0.08);border:1px solid var(--border-subtle);"></span><span>~55%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(16,185,129,0.14);"></span><span>~65%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(16,185,129,0.28);"></span><span>~80%</span>
            <span class="heatmap-legend-swatch" style="background:rgba(16,185,129,0.45);"></span><span>80%~</span>
            <span style="margin-left:auto; color:var(--text-dimmed); font-style:italic;">${n}명 · 셀 클릭 → 상세</span>
        </div>`;
        container.innerHTML = html;
    }
}

function renderTrend() {
    const container = document.getElementById('trend-chart');
    let html = '';

    Object.values(stats)
        .filter(s => s.games.length > 0)
        .sort((a, b) => {
            const wrB = (b.w + b.d * 0.5) / b.games.length;
            const wrA = (a.w + a.d * 0.5) / a.games.length;
            return wrB - wrA;
        })
        .forEach(s => {
            const overallWr = (s.w + s.d * 0.5) / s.games.length;
            const recent10 = s.games.slice(-10);
            const recentWr = recent10.length > 0 ? recent10.filter(g => g.result > 0).length / recent10.length + (recent10.filter(g => g.result === 0).length * 0.5) / recent10.length : 0;

            const tType = getMemberType(s.name);
            const tBadge = tType === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            html += `
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: 600; margin-bottom: 8px;">${tBadge}${s.name}</div>
                    <div class="bar-container">
                        <div class="bar-label">전체</div>
                        <div class="bar-wrapper">
                            <div class="bar-fill color-good" style="width: ${overallWr * 100}%;">${overallWr > 0.05 ? (overallWr * 100).toFixed(1) + '%' : ''}</div>
                        </div>
                        <div class="bar-percent">${(overallWr * 100).toFixed(1)}%</div>
                    </div>
                    <div class="bar-container">
                        <div class="bar-label">최근10경기</div>
                        <div class="bar-wrapper">
                            <div class="bar-fill ${recentWr >= 0.60 ? 'color-excellent' : (recentWr >= 0.40 ? 'color-fair' : 'color-poor')}" style="width: ${recentWr * 100}%;">${recentWr > 0.05 ? (recentWr * 100).toFixed(1) + '%' : ''}</div>
                        </div>
                        <div class="bar-percent">${(recentWr * 100).toFixed(1)}%</div>
                    </div>
                </div>
            `;
        });

    container.innerHTML = html;
}

function updateRecentMatches() {
    const container = document.getElementById('recent-matches-list');
    const recent = matches.slice(-10).reverse();
    let html = '<div class="match-row"><div>날짜</div><div>팀A</div><div>팀B</div><div>스코어</div></div>';
    recent.forEach(m => {
        const aWin = m.ls > m.rs;
        const draw = m.ls === m.rs;
        const resultClass = aWin ? 'match-win' : (draw ? 'match-draw' : 'match-loss');
        html += `<div class="match-row"><div>${m.d}</div><div>${m.a1}, ${m.a2}</div><div>${m.b1}, ${m.b2}</div><div class="match-score ${resultClass}">${m.ls}-${m.rs}</div></div>`;
    });
    container.innerHTML = html;
}

function showMemberDetail() {
    const member = document.getElementById('detail-member').value;
    if (!member) return;

    const s = stats[member];
    const total = s.games.length;
    if (total === 0) return;

    const wr = (s.w + s.d * 0.5) / total;
    const content = document.getElementById('member-detail-content');

    const detailType = getMemberType(member);
    const detailBadge = detailType === '회원'
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#10b981;color:#fff;font-size:11px;margin-left:8px;">회원</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#6b7280;color:#fff;font-size:11px;margin-left:8px;">비회원</span>';
    let html = `<div class="card"><h2>${member}${detailBadge}</h2>`;
    html += '<div class="stat-grid">';
    html += `<div class="stat-card"><div class="label">전체 경기</div><div class="value">${total}</div></div>`;
    html += `<div class="stat-card"><div class="label">승</div><div class="value">${s.w}</div></div>`;
    html += `<div class="stat-card"><div class="label">무</div><div class="value">${s.d}</div></div>`;
    html += `<div class="stat-card"><div class="label">패</div><div class="value">${s.l}</div></div>`;
    html += `<div class="stat-card"><div class="label">승률</div><div class="value">${(wr * 100).toFixed(1)}%</div></div>`;
    html += '</div>';

    html += '<div class="summary-section"><div><div style="font-weight: 600; margin-bottom: 8px;">W/D/L 분포</div>';
    const wPercent = (s.w / total * 100).toFixed(1);
    const dPercent = (s.d / total * 100).toFixed(1);
    const lPercent = (s.l / total * 100).toFixed(1);
    html += `<div class="wdl-bar">
        <div class="wdl-segment wdl-wins" style="flex: ${s.w || 0.1}">${s.w}</div>
        <div class="wdl-segment wdl-draws" style="flex: ${s.d || 0.1}">${s.d}</div>
        <div class="wdl-segment wdl-losses" style="flex: ${s.l || 0.1}">${s.l}</div>
    </div></div></div>`;
    html += '</div></div>';

    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const opponents = {};
    matches.forEach(m => {
        [m.a1, m.a2].forEach(p => {
            if (p === member) {
                [m.b1, m.b2].forEach(o => {
                    if (!activeNames.has(o)) return; // skip non-members in member mode
                    if (!opponents[o]) opponents[o] = { w: 0, d: 0, l: 0 };
                    if (m.ls > m.rs) opponents[o].w++;
                    else if (m.ls === m.rs) opponents[o].d++;
                    else opponents[o].l++;
                });
            }
        });
        [m.b1, m.b2].forEach(p => {
            if (p === member) {
                [m.a1, m.a2].forEach(o => {
                    if (!activeNames.has(o)) return; // skip non-members in member mode
                    if (!opponents[o]) opponents[o] = { w: 0, d: 0, l: 0 };
                    if (m.rs > m.ls) opponents[o].w++;
                    else if (m.rs === m.ls) opponents[o].d++;
                    else opponents[o].l++;
                });
            }
        });
    });

    html += '<div class="card opponent-vs-table"><h3 style="margin-bottom: 15px;">상대별 전적</h3>';
    html += '<div style="overflow-x: auto;"><table><thead><tr><th>상대</th><th>승</th><th>무</th><th>패</th><th>승률</th></tr></thead><tbody>';
    Object.entries(opponents)
        .sort((a, b) => {
            const wrA = (a[1].w + a[1].d * 0.5) / (a[1].w + a[1].d + a[1].l);
            const wrB = (b[1].w + b[1].d * 0.5) / (b[1].w + b[1].d + b[1].l);
            return wrB - wrA;
        })
        .forEach(([opp, record]) => {
            const total = record.w + record.d + record.l;
            const wr = (record.w + record.d * 0.5) / total;
            const oppType = getMemberType(opp);
            const oppDot = oppType === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;"></span>';
            html += `<tr><td>${oppDot}${opp}</td><td>${record.w}</td><td>${record.d}</td><td>${record.l}</td><td>${(wr * 100).toFixed(1)}%</td></tr>`;
        });
    html += '</tbody></table></div></div>';

    html += '<div class="card"><h3 style="margin-bottom: 15px;">경기 기록 (최근순)</h3>';
    html += '<div style="overflow-x: auto;"><table><thead><tr><th>날짜</th><th>파트너</th><th>상대</th><th>스코어</th><th>결과</th></tr></thead><tbody>';
    const gameLog = [];
    matches.forEach(m => {
        let partner, opponents, isTeamA = false;
        if (m.a1 === member) { partner = m.a2; opponents = [m.b1, m.b2]; isTeamA = true; }
        else if (m.a2 === member) { partner = m.a1; opponents = [m.b1, m.b2]; isTeamA = true; }
        else if (m.b1 === member) { partner = m.b2; opponents = [m.a1, m.a2]; isTeamA = false; }
        else if (m.b2 === member) { partner = m.b1; opponents = [m.a1, m.a2]; isTeamA = false; }

        if (partner) {
            const myScore = isTeamA ? m.ls : m.rs;
            const oppScore = isTeamA ? m.rs : m.ls;
            let result = 'W';
            if (myScore === oppScore) result = 'D';
            else if (myScore < oppScore) result = 'L';
            gameLog.push({ date: m.d, partner, opponents: opponents.join(', '), score: `${myScore}-${oppScore}`, result });
        }
    });
    gameLog.reverse().forEach(g => {
        const resultClass = g.result === 'W' ? 'match-win' : (g.result === 'D' ? 'match-draw' : 'match-loss');
        html += `<tr><td>${g.date}</td><td>${g.partner}</td><td>${g.opponents}</td><td>${g.score}</td><td><span class="match-score ${resultClass}">${g.result}</span></td></tr>`;
    });
    html += '</tbody></table></div></div>';

    content.innerHTML = html;
}

// ===== MVP Ranking =====
function renderMVP() {
    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const mvpData = [];
    const maxGames = Math.max(...Object.values(stats).map(s => s.games.length), 1);

    // Calculate avg synergy per player
    const synergyMap = {};
    const pairs = {};
    matches.forEach(m => {
        const pair1 = [m.a1, m.a2].sort().join('|');
        const pair2 = [m.b1, m.b2].sort().join('|');
        [[pair1, m.a1, m.a2, m.ls > m.rs ? 1 : m.ls === m.rs ? 0 : -1],
         [pair2, m.b1, m.b2, m.rs > m.ls ? 1 : m.rs === m.ls ? 0 : -1]].forEach(([pk, p1, p2, res]) => {
            if (!activeNames.has(p1) || !activeNames.has(p2)) return;
            if (!pairs[pk]) pairs[pk] = { w: 0, d: 0, l: 0, g: 0 };
            pairs[pk].g++; if (res === 1) pairs[pk].w++; else if (res === 0) pairs[pk].d++; else pairs[pk].l++;
        });
    });
    Object.entries(pairs).forEach(([k, v]) => {
        if (v.g < 2) return;
        const [p1, p2] = k.split('|');
        const pairWr = (v.w + v.d * 0.5) / v.g;
        const wr1 = stats[p1] ? (stats[p1].w + stats[p1].d * 0.5) / (stats[p1].games.length || 1) : 0;
        const wr2 = stats[p2] ? (stats[p2].w + stats[p2].d * 0.5) / (stats[p2].games.length || 1) : 0;
        const syn = pairWr - (wr1 + wr2) / 2;
        [p1, p2].forEach(p => {
            if (!synergyMap[p]) synergyMap[p] = { sum: 0, count: 0 };
            synergyMap[p].sum += syn;
            synergyMap[p].count++;
        });
    });

    Object.values(stats).forEach(s => {
        if (!activeNames.has(s.name) || s.games.length === 0) return;
        const total = s.games.length;
        const wr = (s.w + s.d * 0.5) / total;
        const recent10 = s.games.slice(-10);
        const recentWr = recent10.length > 0 ? (recent10.filter(g => g.result > 0).length + recent10.filter(g => g.result === 0).length * 0.5) / recent10.length : 0;
        const gameScore = Math.min(total / maxGames, 1);
        const avgSyn = synergyMap[s.name] ? synergyMap[s.name].sum / synergyMap[s.name].count : 0;
        const synScore = Math.max(0, Math.min(1, avgSyn + 0.5)); // normalize -0.5~+0.5 to 0~1
        const mvpScore = wr * 40 + gameScore * 20 + synScore * 20 + recentWr * 20;
        mvpData.push({ name: s.name, mvpScore, wr, total, avgSyn, recentWr });
    });
    mvpData.sort((a, b) => b.mvpScore - a.mvpScore);

    // Podium
    const podium = document.getElementById('mvp-podium');
    const top3 = mvpData.slice(0, 3);
    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const heights = [130, 170, 100];
    const medals = ['🥈', '🥇', '🥉'];
    const podiumHeights = top3.length >= 3 ? heights : [170, 130, 100].slice(0, top3.length);
    let podiumHtml = '';
    podiumOrder.forEach((p, i) => {
        const idx = top3.length >= 3 ? i : i;
        const h = podiumHeights[idx];
        const medal = top3.length >= 3 ? medals[idx] : medals[idx];
        const pType = getMemberType(p.name);
        const pTypeDot = pType === '회원'
            ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:2px;" title="회원"></span>'
            : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:2px;" title="비회원"></span>';
        podiumHtml += `<div style="text-align:center; width:100px;">
            <div style="font-size:28px;">${medal}</div>
            <div style="font-weight:700; color:var(--text-primary); margin:6px 0; font-size:15px;">${pTypeDot}${p.name}</div>
            <div style="font-size:12px; color:var(--accent-text); font-weight:600;">${p.mvpScore.toFixed(1)}점</div>
            <div style="background: linear-gradient(180deg, var(--accent) 0%, var(--bg-hover) 100%); height:${h}px; border-radius:8px 8px 0 0; margin-top:8px; display:flex; align-items:flex-start; justify-content:center; padding-top:12px;">
                <span style="color:var(--btn-text); font-weight:700; font-size:13px;">${(p.wr*100).toFixed(1)}%</span>
            </div>
        </div>`;
    });
    podium.innerHTML = podiumHtml;

    // Table
    const tbody = document.getElementById('mvp-table');
    tbody.innerHTML = '';
    mvpData.forEach((p, i) => {
        const row = document.createElement('tr');
        const wrColor = getWinRateTextColor(p.wr);
        const mType = getMemberType(p.name);
        const typeBadge = mType === '회원'
            ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>'
            : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
        row.innerHTML = `
            <td style="font-weight:700; color:${i < 3 ? 'var(--accent-text)' : 'var(--text-muted)'}">${i + 1}</td>
            <td>${typeBadge}<strong>${p.name}</strong></td>
            <td><strong style="color:var(--accent-text)">${p.mvpScore.toFixed(1)}</strong></td>
            <td style="color:${wrColor}">${(p.wr * 100).toFixed(1)}%</td>
            <td>${p.total}</td>
            <td style="color:${p.avgSyn > 0 ? '#34d399' : '#f87171'}">${p.avgSyn > 0 ? '+' : ''}${(p.avgSyn * 100).toFixed(1)}%</td>
            <td>${(p.recentWr * 100).toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
    });
}

// ===== Clutch (접전) =====
function renderClutch() {
    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const clutch = {};
    matches.forEach(m => {
        const diff = Math.abs(m.ls - m.rs);
        if (diff > 2) return; // only close games (0,1,2 point diff)
        const aWin = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        [m.a1, m.a2].forEach(p => {
            if (!activeNames.has(p)) return;
            if (!clutch[p]) clutch[p] = { w: 0, d: 0, l: 0 };
            if (aWin === 1) clutch[p].w++; else if (aWin === 0) clutch[p].d++; else clutch[p].l++;
        });
        [m.b1, m.b2].forEach(p => {
            if (!activeNames.has(p)) return;
            if (!clutch[p]) clutch[p] = { w: 0, d: 0, l: 0 };
            if (aWin === -1) clutch[p].w++; else if (aWin === 0) clutch[p].d++; else clutch[p].l++;
        });
    });
    const tbody = document.getElementById('clutch-table');
    tbody.innerHTML = '';
    Object.entries(clutch)
        .map(([name, c]) => {
            const total = c.w + c.d + c.l;
            const cwr = (c.w + c.d * 0.5) / total;
            const overall = stats[name] ? (stats[name].w + stats[name].d * 0.5) / (stats[name].games.length || 1) : 0;
            const clutchIdx = cwr - overall;
            return { name, ...c, total, cwr, overall, clutchIdx };
        })
        .filter(r => r.total >= 2)
        .sort((a, b) => b.cwr - a.cwr)
        .forEach(r => {
            const row = document.createElement('tr');
            const ciColor = r.clutchIdx > 0 ? '#34d399' : '#f87171';
            const cType = getMemberType(r.name);
            const cBadge = cType === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            row.innerHTML = `
                <td>${cBadge}<strong>${r.name}</strong></td>
                <td>${r.total}</td>
                <td>${r.w}</td>
                <td>${r.d}</td>
                <td>${r.l}</td>
                <td><strong style="color:${getWinRateTextColor(r.cwr)}">${(r.cwr * 100).toFixed(1)}%</strong></td>
                <td>${(r.overall * 100).toFixed(1)}%</td>
                <td style="color:${ciColor}; font-weight:600;">${r.clutchIdx > 0 ? '+' : ''}${(r.clutchIdx * 100).toFixed(1)}%</td>
            `;
            tbody.appendChild(row);
        });
}

// ===== Streaks (연승/연패) =====
function renderStreaks() {
    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const streaks = {};
    // Sort matches by date
    const sorted = [...matches].sort((a, b) => a.d.localeCompare(b.d));
    sorted.forEach(m => {
        const aWin = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        function update(player, result) {
            if (!activeNames.has(player)) return;
            if (!streaks[player]) streaks[player] = { maxWin: 0, maxLose: 0, curWin: 0, curLose: 0, curType: '' };
            const s = streaks[player];
            if (result === 1) {
                s.curWin++;
                s.curLose = 0;
                s.curType = 'win';
                if (s.curWin > s.maxWin) s.maxWin = s.curWin;
            } else if (result === -1) {
                s.curLose++;
                s.curWin = 0;
                s.curType = 'lose';
                if (s.curLose > s.maxLose) s.maxLose = s.curLose;
            } else {
                s.curWin = 0;
                s.curLose = 0;
                s.curType = 'draw';
            }
        }
        [m.a1, m.a2].forEach(p => update(p, aWin));
        [m.b1, m.b2].forEach(p => update(p, -aWin));
    });
    const tbody = document.getElementById('streak-table');
    tbody.innerHTML = '';
    Object.entries(streaks)
        .sort((a, b) => b[1].maxWin - a[1].maxWin)
        .forEach(([name, s]) => {
            const row = document.createElement('tr');
            let curLabel = '';
            if (s.curType === 'win' && s.curWin >= 2) curLabel = `<span style="color:#34d399; font-weight:600;">🔥 ${s.curWin}연승 중</span>`;
            else if (s.curType === 'lose' && s.curLose >= 2) curLabel = `<span style="color:#f87171; font-weight:600;">❄️ ${s.curLose}연패 중</span>`;
            else curLabel = '<span style="color:var(--text-dimmed);">-</span>';
            const sType = getMemberType(name);
            const sBadge = sType === '회원' ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:4px;" title="회원"></span>' : '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7280;margin-right:4px;" title="비회원"></span>';
            row.innerHTML = `
                <td>${sBadge}<strong>${name}</strong></td>
                <td style="color:#34d399; font-weight:600;">${s.maxWin}연승</td>
                <td style="color:#f87171; font-weight:600;">${s.maxLose}연패</td>
                <td>${curLabel}</td>
            `;
            tbody.appendChild(row);
        });
}

// ===== Monthly Trend Line Chart (CSS-based) =====
function renderMonthlyTrend() {
    const member = document.getElementById('trend-member').value;
    const container = document.getElementById('monthly-chart');
    if (!member) { container.innerHTML = '<p style="color:var(--text-dimmed); text-align:center; padding:40px;">선수를 선택하세요</p>'; return; }

    // Group matches by month for this member
    const monthly = {};
    matches.forEach(m => {
        let result = null;
        if (m.a1 === member || m.a2 === member) result = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        else if (m.b1 === member || m.b2 === member) result = m.rs > m.ls ? 1 : (m.rs === m.ls ? 0 : -1);
        if (result === null) return;
        const month = m.d.substring(0, 7);
        if (!monthly[month]) monthly[month] = { w: 0, d: 0, l: 0 };
        if (result === 1) monthly[month].w++;
        else if (result === 0) monthly[month].d++;
        else monthly[month].l++;
    });

    const months = Object.keys(monthly).sort();
    if (months.length === 0) { container.innerHTML = '<p style="color:var(--text-dimmed); text-align:center; padding:40px;">데이터 없음</p>'; return; }

    const points = months.map(m => {
        const s = monthly[m];
        const total = s.w + s.d + s.l;
        return { month: m, wr: (s.w + s.d * 0.5) / total, total, w: s.w, d: s.d, l: s.l };
    });

    // Draw CSS line chart
    const chartH = 220;
    const chartW = Math.max(months.length * 80, 400);
    let html = `<div style="overflow-x:auto;"><div style="position:relative; width:${chartW}px; height:${chartH + 50}px; margin:0 auto;">`;

    // Y-axis grid lines
    [0, 25, 50, 75, 100].forEach(pct => {
        const y = chartH - (pct / 100 * chartH);
        html += `<div style="position:absolute; left:0; right:0; top:${y}px; border-bottom:1px solid var(--border-subtle); z-index:0;"></div>`;
        html += `<div style="position:absolute; left:-35px; top:${y - 7}px; color:var(--text-dimmed); font-size:10px;">${pct}%</div>`;
    });
    // 50% reference line
    const y50 = chartH - (50 / 100 * chartH);
    html += `<div style="position:absolute; left:0; right:0; top:${y50}px; border-bottom:1px dashed var(--accent); opacity:0.3; z-index:0;"></div>`;

    // Points and lines
    const gap = chartW / (months.length + 1);
    points.forEach((p, i) => {
        const x = gap * (i + 1);
        const y = chartH - (p.wr * chartH);
        const dotColor = p.wr >= 0.5 ? '#34d399' : '#f87171';

        // Line to next point
        if (i < points.length - 1) {
            const nx = gap * (i + 2);
            const ny = chartH - (points[i + 1].wr * chartH);
            const len = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);
            const angle = Math.atan2(ny - y, nx - x) * 180 / Math.PI;
            html += `<div style="position:absolute; left:${x}px; top:${y}px; width:${len}px; height:2px; background:linear-gradient(90deg, ${dotColor}, ${points[i+1].wr >= 0.5 ? '#34d399' : '#f87171'}); transform-origin:0 50%; transform:rotate(${angle}deg); z-index:1;"></div>`;
        }

        // Dot
        html += `<div style="position:absolute; left:${x - 6}px; top:${y - 6}px; width:12px; height:12px; border-radius:50%; background:${dotColor}; border:2px solid #0a0a0a; z-index:2;" title="${p.month}: ${(p.wr*100).toFixed(1)}% (${p.w}승 ${p.d}무 ${p.l}패)"></div>`;

        // Value label
        html += `<div style="position:absolute; left:${x - 20}px; top:${y - 22}px; color:${dotColor}; font-size:11px; font-weight:600; text-align:center; width:40px; z-index:3;">${(p.wr*100).toFixed(0)}%</div>`;

        // Month label
        const [yr, mo] = p.month.split('-');
        html += `<div style="position:absolute; left:${x - 25}px; top:${chartH + 8}px; color:var(--text-muted); font-size:11px; text-align:center; width:50px;">${parseInt(mo)}월</div>`;
        html += `<div style="position:absolute; left:${x - 25}px; top:${chartH + 22}px; color:var(--text-dimmed); font-size:9px; text-align:center; width:50px;">${p.total}경기</div>`;
    });

    html += '</div></div>';
    container.innerHTML = html;
}

// ===== Best Matchups (팀 vs 팀) =====
function renderMatchups() {
    const filterPlayer = document.getElementById('matchup-filter').value;
    const sortMode = document.getElementById('matchup-sort').value;
    const activeNames = new Set(getActiveMembers().map(m => m.name));
    const matchups = {};

    matches.forEach(m => {
        const teamA = [m.a1, m.a2].sort().join(' & ');
        const teamB = [m.b1, m.b2].sort().join(' & ');
        // Normalize key so A vs B and B vs A are the same
        const [first, second] = [teamA, teamB].sort();
        const key = `${first}||${second}`;
        if (!matchups[key]) matchups[key] = { teamA: first, teamB: second, aWin: 0, bWin: 0, draw: 0, games: 0 };
        matchups[key].games++;
        if (first === teamA) {
            if (m.ls > m.rs) matchups[key].aWin++;
            else if (m.ls === m.rs) matchups[key].draw++;
            else matchups[key].bWin++;
        } else {
            if (m.rs > m.ls) matchups[key].aWin++;
            else if (m.rs === m.ls) matchups[key].draw++;
            else matchups[key].bWin++;
        }
    });

    let results = Object.values(matchups).filter(r => r.games >= 2);

    if (filterPlayer) {
        results = results.filter(r => r.teamA.includes(filterPlayer) || r.teamB.includes(filterPlayer));
    }

    if (sortMode === 'wr-high') results.sort((a, b) => (b.aWin / b.games) - (a.aWin / a.games));
    else if (sortMode === 'wr-low') results.sort((a, b) => (a.aWin / a.games) - (b.aWin / b.games));
    else results.sort((a, b) => b.games - a.games);

    const tbody = document.getElementById('matchup-table');
    tbody.innerHTML = '';
    results.forEach(r => {
        const aWr = (r.aWin + r.draw * 0.5) / r.games;
        const row = document.createElement('tr');
        const wrColor = getWinRateTextColor(aWr);
        // Highlight dominant matchups
        let rowStyle = '';
        if (r.aWin >= 3 && r.bWin === 0) rowStyle = 'border-left: 3px solid #34d399;';
        else if (r.bWin >= 3 && r.aWin === 0) rowStyle = 'border-left: 3px solid #f87171;';
        row.style.cssText = rowStyle;
        row.innerHTML = `
            <td><strong>${r.teamA}</strong></td>
            <td style="color:var(--text-dimmed);">vs</td>
            <td><strong>${r.teamB}</strong></td>
            <td>${r.games}</td>
            <td style="color:#34d399;">${r.aWin}</td>
            <td style="color:var(--text-label);">${r.draw}</td>
            <td style="color:#f87171;">${r.bWin}</td>
            <td><strong style="color:${wrColor}">${(aWr * 100).toFixed(1)}%</strong></td>
        `;
        tbody.appendChild(row);
    });
}

// ===== Attendance / Participation =====
let _attendanceData = {};
let _attendanceMonths = [];

function renderAttendance() {
    const activeMembers = getActiveMembers();
    const allDates = [...new Set(matches.map(m => m.d))].sort();
    const totalDays = allDates.length;
    const monthSet = [...new Set(allDates.map(d => d.substring(0, 7)))].sort();
    _attendanceMonths = monthSet;

    const attendance = {};
    activeMembers.forEach(m => {
        attendance[m.name] = { games: 0, days: new Set(), months: {}, matchesByMonth: {} };
        monthSet.forEach(mo => { attendance[m.name].months[mo] = 0; attendance[m.name].matchesByMonth[mo] = []; });
    });

    matches.forEach(m => {
        [m.a1, m.a2, m.b1, m.b2].forEach(p => {
            if (!attendance[p]) return;
            attendance[p].games++;
            attendance[p].days.add(m.d);
            const mo = m.d.substring(0, 7);
            if (attendance[p].months[mo] !== undefined) {
                attendance[p].months[mo]++;
                attendance[p].matchesByMonth[mo].push(m);
            }
        });
    });
    _attendanceData = attendance;

    // Chart
    const chartDiv = document.getElementById('attendance-chart');
    let chartHtml = '';
    const maxGames = Math.max(...Object.values(attendance).map(a => a.games), 1);
    const sorted = Object.entries(attendance).sort((a, b) => b[1].games - a[1].games);
    sorted.forEach(([name, a]) => {
        const pct = (a.games / maxGames * 100).toFixed(0);
        chartHtml += `<div class="bar-container">
            <div class="bar-label">${name}</div>
            <div class="bar-wrapper">
                <div class="bar-fill color-good" style="width:${pct}%"></div>
            </div>
            <div class="bar-percent">${a.games}경기</div>
        </div>`;
    });
    chartDiv.innerHTML = chartHtml;

    // Table
    const tbody = document.getElementById('attendance-table');
    tbody.innerHTML = '';
    sorted.forEach(([name, a]) => {
        const rate = totalDays > 0 ? (a.days.size / totalDays * 100).toFixed(1) : '0.0';
        const maxMo = Math.max(...Object.values(a.months), 1);
        let spark = '<div style="display:flex; gap:2px; align-items:flex-end; height:28px;">';
        monthSet.forEach(mo => {
            const val = a.months[mo] || 0;
            const h = Math.max(3, (val / maxMo) * 26);
            const opacity = val > 0 ? 1 : 0.15;
            const [yr, moNum] = mo.split('-');
            const isActive = val > 0 ? 'cursor:pointer;' : '';
            spark += `<div onclick="${val > 0 ? `showAttendanceDetail('${name}','${mo}')` : ''}" title="${parseInt(moNum)}월: ${val}경기" style="width:16px; height:${h}px; background:#3b82f6; opacity:${opacity}; border-radius:3px; ${isActive} transition:transform 0.15s;" onmouseover="this.style.transform='scaleY(1.15)'" onmouseout="this.style.transform='scaleY(1)'"><div style="font-size:8px; color:#fff; text-align:center; padding-top:1px;">${val > 0 ? val : ''}</div></div>`;
        });
        spark += '</div>';
        // Month labels under sparkline
        let labels = '<div style="display:flex; gap:2px; margin-top:2px;">';
        monthSet.forEach(mo => {
            const [, moNum] = mo.split('-');
            labels += `<div style="width:16px; text-align:center; font-size:8px; color:var(--text-dimmed);">${parseInt(moNum)}월</div>`;
        });
        labels += '</div>';

        const row = document.createElement('tr');
        row.className = 'clickable-row';
        row.onclick = () => showAttendanceDetail(name, null);
        const rateColor = getWinRateTextColor(parseFloat(rate) / 100);
        row.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${a.games}</td>
            <td>${a.days.size}</td>
            <td>${totalDays}</td>
            <td><strong style="color:${rateColor}">${rate}%</strong></td>
            <td onclick="event.stopPropagation();">${spark}${labels}</td>
        `;
        tbody.appendChild(row);
    });

    // Hide detail on re-render
    document.getElementById('attendance-detail').style.display = 'none';
}

function showAttendanceDetail(name, month) {
    const detail = document.getElementById('attendance-detail');
    const a = _attendanceData[name];
    if (!a) return;
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    let html = '';
    if (month) {
        // Show specific month detail
        const [yr, mo] = month.split('-');
        const monthMatches = a.matchesByMonth[month] || [];
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">`;
        html += `<h3 style="color:var(--accent-text); margin:0;">${name} — ${yr}년 ${parseInt(mo)}월</h3>`;
        html += `<button onclick="document.getElementById('attendance-detail').style.display='none'" style="background:none; border:1px solid var(--border-secondary); color:var(--text-muted); border-radius:6px; padding:4px 12px; cursor:pointer; font-family:inherit;">닫기</button>`;
        html += `</div>`;
        html += `<div class="stat-grid" style="margin-bottom:16px;">`;
        const mw = monthMatches.filter(m => { const isA = m.a1===name||m.a2===name; return isA ? m.ls>m.rs : m.rs>m.ls; }).length;
        const md = monthMatches.filter(m => m.ls===m.rs).length;
        const ml = monthMatches.length - mw - md;
        const mwr = monthMatches.length > 0 ? ((mw + md * 0.5) / monthMatches.length * 100).toFixed(1) : '0.0';
        html += `<div class="stat-card"><div class="label">경기수</div><div class="value">${monthMatches.length}</div></div>`;
        html += `<div class="stat-card"><div class="label">승</div><div class="value" style="color:var(--win-color)">${mw}</div></div>`;
        html += `<div class="stat-card"><div class="label">무</div><div class="value" style="color:var(--wr-mid)">${md}</div></div>`;
        html += `<div class="stat-card"><div class="label">패</div><div class="value" style="color:var(--loss-color)">${ml}</div></div>`;
        html += `<div class="stat-card"><div class="label">승률</div><div class="value">${mwr}%</div></div>`;
        html += `</div>`;
        // Match list
        html += `<table><thead><tr><th>날짜</th><th>파트너</th><th>상대</th><th>스코어</th><th>결과</th></tr></thead><tbody>`;
        monthMatches.sort((a, b) => a.d.localeCompare(b.d)).forEach(m => {
            let partner, opps, myScore, oppScore;
            if (m.a1 === name) { partner = m.a2; opps = `${m.b1}, ${m.b2}`; myScore = m.ls; oppScore = m.rs; }
            else if (m.a2 === name) { partner = m.a1; opps = `${m.b1}, ${m.b2}`; myScore = m.ls; oppScore = m.rs; }
            else if (m.b1 === name) { partner = m.b2; opps = `${m.a1}, ${m.a2}`; myScore = m.rs; oppScore = m.ls; }
            else { partner = m.b1; opps = `${m.a1}, ${m.a2}`; myScore = m.rs; oppScore = m.ls; }
            const result = myScore > oppScore ? '승' : (myScore === oppScore ? '무' : '패');
            const resultColor = result === '승' ? 'var(--win-color)' : (result === '무' ? 'var(--wr-mid)' : 'var(--loss-color)');
            html += `<tr><td>${m.d}</td><td>${partner}</td><td>${opps}</td><td>${myScore}-${oppScore}</td><td style="color:${resultColor}; font-weight:600;">${result}</td></tr>`;
        });
        html += `</tbody></table>`;
    } else {
        // Show all months overview
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">`;
        html += `<h3 style="color:var(--accent-text); margin:0;">${name} — 월별 참여 상세</h3>`;
        html += `<button onclick="document.getElementById('attendance-detail').style.display='none'" style="background:none; border:1px solid var(--border-secondary); color:var(--text-muted); border-radius:6px; padding:4px 12px; cursor:pointer; font-family:inherit;">닫기</button>`;
        html += `</div>`;
        html += `<table><thead><tr><th>월</th><th>경기수</th><th>승</th><th>무</th><th>패</th><th>승률</th><th></th></tr></thead><tbody>`;
        _attendanceMonths.forEach(mo => {
            const val = a.months[mo] || 0;
            const monthMatches = a.matchesByMonth[mo] || [];
            const [yr, moNum] = mo.split('-');
            const mw = monthMatches.filter(m => { const isA = m.a1===name||m.a2===name; return isA ? m.ls>m.rs : m.rs>m.ls; }).length;
            const md = monthMatches.filter(m => m.ls===m.rs).length;
            const ml = val - mw - md;
            const mwr = val > 0 ? ((mw + md * 0.5) / val * 100).toFixed(1) : '-';
            const wrColor = val > 0 ? getWinRateTextColor((mw + md * 0.5) / val) : '#555';
            html += `<tr style="cursor:${val > 0 ? 'pointer' : 'default'}; opacity:${val > 0 ? 1 : 0.4};" ${val > 0 ? `onclick="showAttendanceDetail('${name}','${mo}')"` : ''}>
                <td><strong>${yr}년 ${parseInt(moNum)}월</strong></td>
                <td>${val}</td>
                <td>${mw}</td><td>${md}</td><td>${ml}</td>
                <td style="color:${wrColor}; font-weight:600;">${mwr}${mwr !== '-' ? '%' : ''}</td>
                <td style="color:var(--text-dimmed); font-size:12px;">${val > 0 ? '상세 보기 →' : ''}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }
    detail.innerHTML = html;
}

function switchTab(event, tabName, _force) {
    // 관리자 모드가 아닌데 비공개 탭 접근 시 차단 (_force로 내부 호출 허용)
    if (!_force && !isAdmin && adminTabs.includes(tabName)) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    // 탭 버튼 활성화: 실제 DOM 이벤트이면 target 사용, 아니면 버튼 탐색
    if (event && event.target && event.target.classList) {
        event.target.classList.add('active');
    } else {
        document.querySelectorAll('.tab-button').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes("'" + tabName + "'")) btn.classList.add('active');
        });
    }
    // 탭별 진입 콜백
    if (tabName === 'todaymatchup') tmuRefreshSchedule();
}

// Excel upload handling
function setupUpload() {
    const area = document.getElementById('upload-area');
    const input = document.getElementById('excel-upload');
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.style.borderColor = 'var(--accent)';
        area.style.background = 'var(--bg-tertiary)';
    });
    area.addEventListener('dragleave', () => {
        area.style.borderColor = 'var(--border-secondary)';
        area.style.background = 'var(--bg-stripe)';
    });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = 'var(--border-secondary)';
        area.style.background = 'var(--bg-stripe)';
        if (e.dataTransfer.files.length) handleExcelFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', (e) => {
        if (e.target.files.length) handleExcelFile(e.target.files[0]);
    });
}

function handleExcelFile(file) {
    if (!file.name.endsWith('.xlsx')) {
        showUploadError('.xlsx 파일만 업로드 가능합니다.');
        return;
    }
    // Dynamically load SheetJS
    if (typeof XLSX !== 'undefined') {
        parseExcel(file);
    } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
        script.onload = () => parseExcel(file);
        script.onerror = () => {
            showUploadError('엑셀 파서 로드 실패. 인터넷 연결을 확인하세요.');
        };
        document.head.appendChild(script);
    }
}

function parseDate(val) {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'number') {
        // Excel serial date
        const d = new Date((val - 25569) * 86400 * 1000);
        return d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    // Try ISO format or common formats
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.substring(0, 10).replace(/\//g, '-');
    return s;
}

function parseExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
            const resultSheet = wb.Sheets['Result'];
            if (!resultSheet) {
                showUploadError("'Result' 시트를 찾을 수 없습니다.");
                return;
            }
            const rows = XLSX.utils.sheet_to_json(resultSheet, { header: 1, defval: null });

            // Find header row: look for row containing team_a_p1, a1, or Date
            let headerIdx = -1;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const r = rows[i];
                if (!r) continue;
                const joined = r.map(c => String(c || '').toLowerCase()).join('|');
                if (joined.includes('team_a_p1') || joined.includes('team_b_p1') ||
                    (joined.includes('a1') && joined.includes('b1')) ||
                    (joined.includes('date') && (joined.includes('score') || joined.includes('left')))) {
                    headerIdx = i;
                    break;
                }
            }
            if (headerIdx === -1) {
                showUploadError("헤더 행을 찾을 수 없습니다. Result 시트에 team_a_p1/Date 등의 헤더가 필요합니다.");
                return;
            }

            const headers = rows[headerIdx].map(h => String(h || '').trim().toLowerCase());

            // Map columns flexibly
            const colMap = {};
            headers.forEach((h, i) => {
                // Date column
                if (!colMap.d && (h === 'date' || h.includes('날짜'))) colMap.d = i;
                // Team A player 1
                if (!colMap.a1 && (h === 'team_a_p1' || h === 'a1')) colMap.a1 = i;
                // Team A player 2
                if (!colMap.a2 && (h === 'team_a_p2' || h === 'a2')) colMap.a2 = i;
                // Team B player 1
                if (!colMap.b1 && (h === 'team_b_p1' || h === 'b1')) colMap.b1 = i;
                // Team B player 2
                if (!colMap.b2 && (h === 'team_b_p2' || h === 'b2')) colMap.b2 = i;
                // Left score
                if (!colMap.ls && (h === 'leftscore' || h === 'left_score' || h.includes('left'))) colMap.ls = i;
                // Right score
                if (!colMap.rs && (h === 'rightscore' || h === 'right_score' || h.includes('right'))) colMap.rs = i;
                // score_text as fallback (e.g. "3:4")
                if (!colMap.st && (h === 'score_text' || h === 'score')) colMap.st = i;
            });

            if (colMap.a1 === undefined || colMap.b1 === undefined) {
                showUploadError("필요한 컬럼을 찾을 수 없습니다. team_a_p1, team_a_p2, team_b_p1, team_b_p2 컬럼이 필요합니다.");
                return;
            }

            const newMatches = [];
            const memberSet = new Set();
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const r = rows[i];
                if (!r || !r[colMap.a1]) continue;
                const dateVal = parseDate(r[colMap.d]);
                const a1 = String(r[colMap.a1] || '').trim();
                const a2 = String(r[colMap.a2] || '').trim();
                const b1 = String(r[colMap.b1] || '').trim();
                const b2 = String(r[colMap.b2] || '').trim();

                // Get scores: try LeftScore/RightScore first, fallback to score_text
                let ls, rs;
                if (colMap.ls !== undefined && colMap.rs !== undefined && r[colMap.ls] != null) {
                    ls = parseInt(r[colMap.ls]) || 0;
                    rs = parseInt(r[colMap.rs]) || 0;
                } else if (colMap.st !== undefined && r[colMap.st]) {
                    const scoreParts = String(r[colMap.st]).split(':');
                    ls = parseInt(scoreParts[0]) || 0;
                    rs = parseInt(scoreParts[1]) || 0;
                } else {
                    ls = 0; rs = 0;
                }

                if (a1 && a2 && b1 && b2) {
                    newMatches.push({ d: dateVal, a1, a2, b1, b2, ls, rs });
                    [a1, a2, b1, b2].forEach(n => memberSet.add(n));
                }
            }

            if (newMatches.length === 0) {
                showUploadError("유효한 경기 데이터가 없습니다.");
                return;
            }

            // Read info sheet for member info (gender, 회원여부)
            const infoSheet = wb.Sheets['info'];
            const genderMap = {};
            const officialMembers = new Set();
            if (infoSheet) {
                const infoRows = XLSX.utils.sheet_to_json(infoSheet, { header: 1, defval: null });
                // Find header row in info sheet
                let infoHeaderIdx = 0;
                for (let i = 0; i < Math.min(infoRows.length, 5); i++) {
                    const r = infoRows[i];
                    if (r && r.some(c => String(c||'').toLowerCase() === 'name' || String(c||'') === '이름')) {
                        infoHeaderIdx = i; break;
                    }
                }
                const infoHeaders = (infoRows[infoHeaderIdx] || []).map(h => String(h || '').trim().toLowerCase());
                // Find column indices
                let nameCol = -1, genderCol = -1, memberCol = -1;
                infoHeaders.forEach((h, i) => {
                    if (h === 'name' || h === '이름') nameCol = i;
                    if (h === 'gender' || h === '성별') genderCol = i;
                    if (h === '회원여부' || h.includes('회원')) memberCol = i;
                });
                // Fallback: col B(1)=name, col D(3)=gender based on known format
                if (nameCol === -1) nameCol = 1;
                if (genderCol === -1) genderCol = 3;

                for (let i = infoHeaderIdx + 1; i < infoRows.length; i++) {
                    const r = infoRows[i];
                    if (!r || !r[nameCol]) continue;
                    const name = String(r[nameCol]).trim();
                    const gender = String(r[genderCol] || '').trim();
                    if (name && (gender === '남' || gender === '여')) {
                        genderMap[name] = gender;
                    }
                    // Check member status
                    if (memberCol !== -1 && r[memberCol]) {
                        const mv = String(r[memberCol]).trim();
                        if (mv === '회원') officialMembers.add(name);
                    }
                }
            }

            // Build allPlayers (everyone) and members (회원 only)
            const allPlayersList = [];
            memberSet.forEach(name => {
                allPlayersList.push({ name, gender: genderMap[name] || '남' });
            });
            allPlayersList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            data.allPlayers = allPlayersList;

            const newMembers = [];
            if (officialMembers.size > 0) {
                officialMembers.forEach(name => {
                    newMembers.push({ name, gender: genderMap[name] || '남' });
                });
            } else {
                // No 회원 info — treat all players as members
                allPlayersList.forEach(p => newMembers.push({ ...p }));
            }
            newMembers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

            data.members = newMembers;
            data.matches = newMatches;
            matches = JSON.parse(JSON.stringify(newMatches));

            const memberCount = officialMembers.size > 0 ? officialMembers.size : memberSet.size;
            showUploadSuccess(file.name, newMatches.length, memberCount, memberSet.size);
            currentFilter = { type: 'all' };
            buildPeriodButtons();
            setMemberMode(memberMode); // re-apply current mode with new data
        } catch (err) {
            showUploadError('파일 처리 중 오류: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function showUploadSuccess(filename, matchCount, memberCount, totalPlayers) {
    document.getElementById('upload-status').style.display = 'block';
    document.getElementById('upload-error').style.display = 'none';
    let msg = `${filename} — ${matchCount}경기 불러옴`;
    if (totalPlayers && totalPlayers !== memberCount) {
        msg += ` | 회원 ${memberCount}명 (전체 참여자 ${totalPlayers}명)`;
    } else {
        msg += ` | ${memberCount}명 선수`;
    }
    document.getElementById('upload-message').textContent = msg;
}

function showUploadError(msg) {
    document.getElementById('upload-error').style.display = 'block';
    document.getElementById('upload-status').style.display = 'none';
    document.getElementById('error-message').textContent = msg;
}

function renderDataStats() {
    const statsDiv = document.getElementById('data-stats');
    const dates = [...new Set(matches.map(m => m.d))].sort();
    const players = new Set();
    matches.forEach(m => { [m.a1, m.a2, m.b1, m.b2].forEach(n => players.add(n)); });
    statsDiv.innerHTML = `
        <div class="stat-card"><div class="label">총 경기수</div><div class="value">${matches.length}</div></div>
        <div class="stat-card"><div class="label">참여 선수</div><div class="value">${players.size}</div></div>
        <div class="stat-card"><div class="label">경기 일수</div><div class="value">${dates.length}</div></div>
        <div class="stat-card"><div class="label">기간</div><div class="value" style="font-size:14px;">${dates[0] || '-'}<br>~ ${dates[dates.length-1] || '-'}</div></div>
    `;
}

// ====================================================
// Excel Report Generation (ExcelJS — 회원_분석_결과 양식)
// ====================================================
async function generateExcel() {
    const btn = document.getElementById('xlsx-download-btn');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '⏳ 생성 중...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');

        const EWB = new ExcelJS.Workbook();
        EWB.creator = 'IN&OUT Tennis Club';
        const activeNames = new Set(getActiveMembers().map(m => m.name));
        const activeList = getActiveMembers().filter(m => activeNames.has(m.name));
        const maxGames = Math.max(...Object.values(stats).map(s => s.games.length), 1);
        const now = new Date();
        const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

        // ── Style constants (Light Theme) ──
        const gold = 'FF8B6914', dark = 'FF2D2D2D', white = 'FFFFFFFF', grey = 'FF999999';
        const green = 'FF16A34A', red = 'FFDC2626', amber = 'FFD97706';
        const headerBg = 'FF2C3E50';
        const stripeBg = 'FFF8F9FA';
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        const headerFont = { bold: true, color: { argb: white }, size: 11, name: 'Malgun Gothic' };
        const dataFont = { size: 10, name: 'Malgun Gothic', color: { argb: 'FF333333' } };
        const centerAlign = { horizontal: 'center', vertical: 'middle' };
        const leftAlign = { horizontal: 'left', vertical: 'middle' };
        const thinBorder = { style: 'thin', color: { argb: 'FFD9D9D9' } };
        const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const titleFont = { bold: true, color: { argb: headerBg }, size: 14, name: 'Malgun Gothic' };
        const subtitleFont = { bold: false, color: { argb: 'FF666666' }, size: 11, name: 'Malgun Gothic' };
        const sectionFont = { bold: true, color: { argb: gold }, size: 11, name: 'Malgun Gothic' };

        function styleHeader(ws, colCount, rowNum) {
            rowNum = rowNum || 1;
            const row = ws.getRow(rowNum);
            row.height = 30;
            for (let c = 1; c <= colCount; c++) {
                const cell = row.getCell(c);
                cell.fill = headerFill;
                cell.font = headerFont;
                cell.alignment = centerAlign;
                cell.border = borders;
            }
        }
        function styleDataRows(ws, startRow, endRow, colCount) {
            for (let r = startRow; r <= endRow; r++) {
                const row = ws.getRow(r);
                row.height = 24;
                const isEven = (r - startRow) % 2 === 0;
                for (let c = 1; c <= colCount; c++) {
                    const cell = row.getCell(c);
                    cell.font = { ...dataFont };
                    cell.alignment = centerAlign;
                    cell.border = borders;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? white : stripeBg } };
                }
            }
        }
        function wrColor(wr) { return wr >= 0.6 ? green : wr >= 0.45 ? amber : red; }

        // ── Pre-calculate pair data ──
        const pairStats = {};
        matches.forEach(m => {
            const pair1 = [m.a1, m.a2].sort().join('|');
            const pair2 = [m.b1, m.b2].sort().join('|');
            [[pair1, m.a1, m.a2, m.ls > m.rs ? 1 : m.ls === m.rs ? 0 : -1],
             [pair2, m.b1, m.b2, m.rs > m.ls ? 1 : m.rs === m.ls ? 0 : -1]].forEach(([pk, p1, p2, res]) => {
                if (!pairStats[pk]) pairStats[pk] = { w:0, d:0, l:0, g:0 };
                pairStats[pk].g++; if (res===1) pairStats[pk].w++; else if (res===0) pairStats[pk].d++; else pairStats[pk].l++;
            });
        });

        // Synergy map
        const synergyMap = {};
        Object.entries(pairStats).forEach(([k, v]) => {
            if (v.g < 2) return;
            const [p1, p2] = k.split('|');
            const pairWr = (v.w + v.d * 0.5) / v.g;
            const wr1 = stats[p1] ? (stats[p1].w + stats[p1].d*0.5)/(stats[p1].games.length||1) : 0;
            const wr2 = stats[p2] ? (stats[p2].w + stats[p2].d*0.5)/(stats[p2].games.length||1) : 0;
            const syn = pairWr - (wr1+wr2)/2;
            [p1,p2].forEach(p => { if(!synergyMap[p])synergyMap[p]={sum:0,count:0}; synergyMap[p].sum+=syn; synergyMap[p].count++; });
        });

        // ══════════════════════════════════════════
        // Sheet 1: 파트너조합 승률
        // ══════════════════════════════════════════
        const wsP = EWB.addWorksheet('파트너조합 승률', { properties: { tabColor: { argb: gold } } });
        wsP.columns = [
            {header:'파트너1',width:12},{header:'파트너2',width:12},{header:'경기수',width:9},
            {header:'승',width:7},{header:'무',width:7},{header:'패',width:7},
            {header:'승률',width:11},{header:'평균득실차',width:13},{header:'시너지',width:11}
        ];
        const pairArr = [];
        Object.entries(pairStats).forEach(([k, v]) => {
            if (v.g < 2) return;
            const [p1, p2] = k.split('|');
            if (!activeNames.has(p1) || !activeNames.has(p2)) return;
            const wr = (v.w + v.d*0.5)/v.g;
            const wr1 = stats[p1]?(stats[p1].w+stats[p1].d*0.5)/(stats[p1].games.length||1):0;
            const wr2 = stats[p2]?(stats[p2].w+stats[p2].d*0.5)/(stats[p2].games.length||1):0;
            const syn = wr - (wr1+wr2)/2;
            // avg score diff
            let totalDiff = 0, cnt = 0;
            matches.forEach(m => {
                const pa = [m.a1,m.a2].sort().join('|'), pb = [m.b1,m.b2].sort().join('|');
                if (pa === k) { totalDiff += m.ls - m.rs; cnt++; }
                else if (pb === k) { totalDiff += m.rs - m.ls; cnt++; }
            });
            pairArr.push({ p1, p2, ...v, wr, avgDiff: cnt?totalDiff/cnt:0, syn });
        });
        pairArr.sort((a,b) => b.wr - a.wr);
        pairArr.forEach(p => {
            wsP.addRow([p.p1, p.p2, p.g, p.w, p.d, p.l,
                (p.wr*100).toFixed(1)+'%', p.avgDiff.toFixed(1), (p.syn>0?'+':'')+(p.syn*100).toFixed(1)+'%']);
        });
        styleHeader(wsP, 9);
        styleDataRows(wsP, 2, pairArr.length+1, 9);
        for (let r=2; r<=pairArr.length+1; r++) {
            const p = pairArr[r-2];
            wsP.getRow(r).getCell(1).font = {...dataFont, bold:true};
            wsP.getRow(r).getCell(2).font = {...dataFont, bold:true};
            wsP.getRow(r).getCell(7).font = {...dataFont, bold:true, color:{argb:wrColor(p.wr)}};
            wsP.getRow(r).getCell(9).font = {...dataFont, color:{argb:p.syn>0?green:red}};
        }

        // ══════════════════════════════════════════
        // Sheet 2: 회원별 요약 (with best/worst partner)
        // ══════════════════════════════════════════
        const ws1 = EWB.addWorksheet('회원별 요약', { properties: { tabColor: { argb: gold } } });
        ws1.columns = [
            {header:'이름',width:12},{header:'구분',width:8},{header:'성별',width:8},{header:'경기수',width:10},
            {header:'승',width:7},{header:'무',width:7},{header:'패',width:7},
            {header:'승률',width:11},{header:'최근10경기 승률',width:16},{header:'트렌드',width:10},
            {header:'최고파트너',width:12},{header:'최고파트너 승률',width:16},
            {header:'최저파트너',width:12},{header:'최저파트너 승률',width:16}
        ];
        const summaryData = Object.values(stats)
            .filter(s => s.games.length > 0 && activeNames.has(s.name))
            .sort((a, b) => ((b.w+b.d*0.5)/b.games.length) - ((a.w+a.d*0.5)/a.games.length));
        summaryData.forEach(s => {
            const total = s.games.length;
            const wr = (s.w+s.d*0.5)/total;
            const recent10 = s.games.slice(-10);
            const recentWr = recent10.length>0?(recent10.filter(g=>g.result>0).length+recent10.filter(g=>g.result===0).length*0.5)/recent10.length:0;
            const trend = recentWr > wr + 0.05 ? '↑ 상승' : recentWr < wr - 0.05 ? '↓ 하락' : '→ 유지';
            // Best/worst partner
            let bestP = '-', bestWr = 0, worstP = '-', worstWr = 1;
            Object.entries(pairStats).forEach(([k,v]) => {
                if (v.g < 2) return;
                const [p1,p2] = k.split('|');
                let partner = null;
                if (p1===s.name && activeNames.has(p2)) partner = p2;
                else if (p2===s.name && activeNames.has(p1)) partner = p1;
                if (!partner) return;
                const pwr = (v.w+v.d*0.5)/v.g;
                if (pwr > bestWr) { bestWr = pwr; bestP = partner; }
                if (pwr < worstWr) { worstWr = pwr; worstP = partner; }
            });
            const mtype = getMemberType(s.name);
            ws1.addRow([s.name, mtype, s.gender, total, s.w, s.d, s.l,
                (wr*100).toFixed(1)+'%', (recentWr*100).toFixed(1)+'%', trend,
                bestP, bestWr>0?(bestWr*100).toFixed(1)+'%':'-',
                worstP, worstWr<1?(worstWr*100).toFixed(1)+'%':'-']);
        });
        styleHeader(ws1, 14);
        styleDataRows(ws1, 2, summaryData.length+1, 14);
        for (let r=2; r<=summaryData.length+1; r++) {
            const s = summaryData[r-2]; const wr=(s.w+s.d*0.5)/s.games.length;
            ws1.getRow(r).getCell(1).font = {...dataFont, bold:true};
            const mtype2 = getMemberType(s.name);
            ws1.getRow(r).getCell(2).font = {...dataFont, bold:true, color:{argb:mtype2==='회원'?green:'FF6B7280'}};
            ws1.getRow(r).getCell(3).font = {...dataFont, color:{argb:s.gender==='여'?'FFDB2777':'FF2563EB'}};
            ws1.getRow(r).getCell(8).font = {...dataFont, bold:true, color:{argb:wrColor(wr)}};
            const r10=s.games.slice(-10); const rwr=r10.length>0?(r10.filter(g=>g.result>0).length+r10.filter(g=>g.result===0).length*0.5)/r10.length:0;
            ws1.getRow(r).getCell(9).font = {...dataFont, color:{argb:wrColor(rwr)}};
            const trend = ws1.getRow(r).getCell(10).value;
            ws1.getRow(r).getCell(10).font = {...dataFont, color:{argb:trend.includes('상승')?green:trend.includes('하락')?red:amber}};
            ws1.getRow(r).getCell(12).font = {...dataFont, color:{argb:green}};
            ws1.getRow(r).getCell(14).font = {...dataFont, color:{argb:red}};
        }

        // ══════════════════════════════════════════
        // Sheet 3: 상대전적 매트릭스
        // ══════════════════════════════════════════
        const memberNames = summaryData.map(s => s.name);
        const wsM = EWB.addWorksheet('상대전적 매트릭스', { properties: { tabColor: { argb: 'FF3B82F6' } } });
        wsM.columns = [{header:'상대 →', width:12}, ...memberNames.map(n => ({header:n, width:12}))];
        // Build h2h matrix
        const h2h = {};
        matches.forEach(m => {
            const aWin = m.ls>m.rs?1:(m.ls===m.rs?0:-1);
            [[m.a1,m.b1,aWin],[m.a1,m.b2,aWin],[m.a2,m.b1,aWin],[m.a2,m.b2,aWin],
             [m.b1,m.a1,-aWin],[m.b1,m.a2,-aWin],[m.b2,m.a1,-aWin],[m.b2,m.a2,-aWin]].forEach(([me,opp,res]) => {
                if (me===opp) return;
                const k = me+'|'+opp;
                if (!h2h[k]) h2h[k] = {w:0,d:0,l:0,g:0};
                h2h[k].g++; if(res===1)h2h[k].w++; else if(res===0)h2h[k].d++; else h2h[k].l++;
            });
        });
        memberNames.forEach(me => {
            const row = [me];
            memberNames.forEach(opp => {
                if (me===opp) { row.push('-'); return; }
                const k = me+'|'+opp;
                if (!h2h[k]||h2h[k].g===0) { row.push(''); return; }
                const v = h2h[k];
                const wr = (v.w+v.d*0.5)/v.g;
                if (v.g < 3) row.push(v.w+'승'+v.l+'패');
                else row.push((wr*100).toFixed(1)+'%');
            });
            wsM.addRow(row);
        });
        styleHeader(wsM, memberNames.length+1);
        styleDataRows(wsM, 2, memberNames.length+1, memberNames.length+1);
        for (let r=2; r<=memberNames.length+1; r++) {
            wsM.getRow(r).getCell(1).font = {...dataFont, bold:true};
            wsM.getRow(r).getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF1F5F9'} };
            for (let c=2; c<=memberNames.length+1; c++) {
                const val = wsM.getRow(r).getCell(c).value;
                if (val==='-') {
                    wsM.getRow(r).getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE2E8F0'} };
                    wsM.getRow(r).getCell(c).font = {...dataFont, color:{argb:'FFAAAAAA'}};
                    continue;
                }
                if (!val) continue;
                if (typeof val==='string'&&val.includes('%')) {
                    const n = parseFloat(val)/100;
                    wsM.getRow(r).getCell(c).font = {...dataFont, bold:true, color:{argb:wrColor(n)}};
                }
            }
        }

        // ══════════════════════════════════════════
        // Sheet 4: 시너지 분석
        // ══════════════════════════════════════════
        const wsSyn = EWB.addWorksheet('시너지 분석', { properties: { tabColor: { argb: 'FF8B5CF6' } } });
        wsSyn.columns = [
            {header:'파트너1',width:12},{header:'파트너2',width:12},{header:'경기수',width:9},
            {header:'실제 승률',width:12},{header:'기대 승률',width:12},{header:'시너지',width:11},{header:'판정',width:12}
        ];
        const synArr = [];
        Object.entries(pairStats).forEach(([k,v]) => {
            if (v.g<2) return;
            const [p1,p2] = k.split('|');
            if (!activeNames.has(p1)||!activeNames.has(p2)) return;
            const wr = (v.w+v.d*0.5)/v.g;
            const wr1 = stats[p1]?(stats[p1].w+stats[p1].d*0.5)/(stats[p1].games.length||1):0;
            const wr2 = stats[p2]?(stats[p2].w+stats[p2].d*0.5)/(stats[p2].games.length||1):0;
            const expected = (wr1+wr2)/2;
            const syn = wr - expected;
            let verdict = '보통';
            if (syn >= 0.3) verdict = '최고 궁합';
            else if (syn >= 0.1) verdict = '좋은 궁합';
            else if (syn <= -0.15) verdict = '나쁜 궁합';
            synArr.push({p1,p2,g:v.g,wr,expected,syn,verdict});
        });
        synArr.sort((a,b) => b.syn - a.syn);
        synArr.forEach(s => {
            wsSyn.addRow([s.p1,s.p2,s.g,(s.wr*100).toFixed(1)+'%',(s.expected*100).toFixed(1)+'%',
                (s.syn>0?'+':'')+(s.syn*100).toFixed(1)+'%',s.verdict]);
        });
        styleHeader(wsSyn, 7);
        styleDataRows(wsSyn, 2, synArr.length+1, 7);
        for (let r=2; r<=synArr.length+1; r++) {
            const s = synArr[r-2];
            wsSyn.getRow(r).getCell(1).font = {...dataFont, bold:true};
            wsSyn.getRow(r).getCell(2).font = {...dataFont, bold:true};
            wsSyn.getRow(r).getCell(4).font = {...dataFont, color:{argb:wrColor(s.wr)}};
            wsSyn.getRow(r).getCell(6).font = {...dataFont, bold:true, color:{argb:s.syn>0?green:red}};
            const vColor = s.verdict.includes('최고')?green:s.verdict.includes('좋은')?'FF2563EB':s.verdict.includes('나쁜')?red:amber;
            wsSyn.getRow(r).getCell(7).font = {...dataFont, bold:true, color:{argb:vColor}};
        }

        // ══════════════════════════════════════════
        // Sheet 5: 최근 폼
        // ══════════════════════════════════════════
        const wsForm = EWB.addWorksheet('최근 폼', { properties: { tabColor: { argb: green } } });
        wsForm.columns = [
            {header:'이름',width:12},{header:'전체 승률',width:12},{header:'최근5경기',width:12},
            {header:'최근10경기',width:12},{header:'트렌드',width:10},{header:'폼 변화량',width:12}
        ];
        const formData = [];
        summaryData.forEach(s => {
            const total = s.games.length;
            const wr = (s.w+s.d*0.5)/total;
            const r5 = s.games.slice(-5);
            const r10 = s.games.slice(-10);
            const wr5 = r5.length>0?(r5.filter(g=>g.result>0).length+r5.filter(g=>g.result===0).length*0.5)/r5.length:0;
            const wr10 = r10.length>0?(r10.filter(g=>g.result>0).length+r10.filter(g=>g.result===0).length*0.5)/r10.length:0;
            const trend = wr10>wr+0.05?'↑ 상승':wr10<wr-0.05?'↓ 하락':'→ 유지';
            const change = wr10 - wr;
            formData.push({name:s.name,wr,wr5,wr10,trend,change});
        });
        formData.forEach(f => {
            wsForm.addRow([f.name,(f.wr*100).toFixed(1)+'%',(f.wr5*100).toFixed(1)+'%',
                (f.wr10*100).toFixed(1)+'%',f.trend,(f.change>0?'+':'')+(f.change*100).toFixed(1)+'%']);
        });
        styleHeader(wsForm, 6);
        styleDataRows(wsForm, 2, formData.length+1, 6);
        for (let r=2; r<=formData.length+1; r++) {
            const f = formData[r-2];
            wsForm.getRow(r).getCell(1).font = {...dataFont, bold:true};
            wsForm.getRow(r).getCell(2).font = {...dataFont, color:{argb:wrColor(f.wr)}};
            wsForm.getRow(r).getCell(3).font = {...dataFont, color:{argb:wrColor(f.wr5)}};
            wsForm.getRow(r).getCell(4).font = {...dataFont, bold:true, color:{argb:wrColor(f.wr10)}};
            wsForm.getRow(r).getCell(5).font = {...dataFont, color:{argb:f.trend.includes('상승')?green:f.trend.includes('하락')?red:amber}};
            wsForm.getRow(r).getCell(6).font = {...dataFont, bold:true, color:{argb:f.change>0?green:f.change<0?red:amber}};
        }

        // ══════════════════════════════════════════
        // Sheet 6+: 회원별 상대전적 (individual sheets)
        // ══════════════════════════════════════════
        memberNames.forEach(name => {
            const s = stats[name];
            if (!s || s.games.length === 0) return;
            const gender = s.gender;
            const total = s.games.length;
            const wr = (s.w+s.d*0.5)/total;

            const ws = EWB.addWorksheet(name+' 상대전적', { properties: { tabColor: { argb: gold } } });
            ws.columns = Array(9).fill(null).map(()=>({width:13}));

            // Row 1: Title
            let rn = 1;
            ws.getRow(rn).getCell(1).value = `${name} (${gender})`;
            ws.getRow(rn).getCell(1).font = titleFont;
            ws.getRow(rn).height = 30;

            // Row 2: Summary
            rn = 2;
            ws.getRow(rn).getCell(1).value = `전체: ${total}경기 ${s.w}승 ${s.d}무 ${s.l}패 (승률 ${(wr*100).toFixed(1)}%)`;
            ws.getRow(rn).getCell(1).font = subtitleFont;

            // Row 4: Section header
            rn = 4;
            ws.getRow(rn).getCell(1).value = '▶ 상대별 전적';
            ws.getRow(rn).getCell(1).font = sectionFont;

            // Row 5: Table header
            rn = 5;
            const oppHeaders = ['상대','경기수','승','무','패','승률','평균득점','평균실점','득실차'];
            oppHeaders.forEach((h,i) => ws.getRow(rn).getCell(i+1).value = h);
            styleHeader(ws, 9, rn);

            // Build opponent data
            const oppData = {};
            matches.forEach(m => {
                let myTeam = null, myScore, oppScore;
                if (m.a1===name||m.a2===name) { myTeam='a'; myScore=m.ls; oppScore=m.rs; }
                else if (m.b1===name||m.b2===name) { myTeam='b'; myScore=m.rs; oppScore=m.ls; }
                if (!myTeam) return;
                const opps = myTeam==='a' ? [m.b1,m.b2] : [m.a1,m.a2];
                const result = myScore>oppScore?1:(myScore===oppScore?0:-1);
                opps.forEach(opp => {
                    if (opp===name) return;
                    if (!oppData[opp]) oppData[opp] = {w:0,d:0,l:0,g:0,scored:0,conceded:0};
                    oppData[opp].g++;
                    if (result===1) oppData[opp].w++; else if (result===0) oppData[opp].d++; else oppData[opp].l++;
                    oppData[opp].scored += myScore;
                    oppData[opp].conceded += oppScore;
                });
            });

            const oppArr = Object.entries(oppData)
                .filter(([n]) => activeNames.has(n))
                .map(([n,v]) => ({name:n,...v,wr:(v.w+v.d*0.5)/v.g,avgS:v.scored/v.g,avgC:v.conceded/v.g,diff:(v.scored-v.conceded)/v.g}))
                .sort((a,b) => b.wr - a.wr);

            rn = 6;
            oppArr.forEach(o => {
                ws.getRow(rn).getCell(1).value = o.name;
                ws.getRow(rn).getCell(2).value = o.g;
                ws.getRow(rn).getCell(3).value = o.w;
                ws.getRow(rn).getCell(4).value = o.d;
                ws.getRow(rn).getCell(5).value = o.l;
                ws.getRow(rn).getCell(6).value = (o.wr*100).toFixed(1)+'%';
                ws.getRow(rn).getCell(7).value = o.avgS.toFixed(1);
                ws.getRow(rn).getCell(8).value = o.avgC.toFixed(1);
                ws.getRow(rn).getCell(9).value = o.diff.toFixed(1);
                rn++;
            });
            styleDataRows(ws, 6, 5+oppArr.length, 9);
            for (let r=6; r<6+oppArr.length; r++) {
                ws.getRow(r).getCell(1).font = {...dataFont, bold:true};
                const owr = oppArr[r-6].wr;
                ws.getRow(r).getCell(6).font = {...dataFont, bold:true, color:{argb:wrColor(owr)}};
                const diff = oppArr[r-6].diff;
                ws.getRow(r).getCell(9).font = {...dataFont, color:{argb:diff>0?green:diff<0?red:amber}};
            }

            // Gap + Match history
            rn = 6 + oppArr.length + 2;
            ws.getRow(rn).getCell(1).value = '▶ 경기 기록';
            ws.getRow(rn).getCell(1).font = sectionFont;

            rn++;
            const histHeaders = ['날짜','파트너','상대1','상대2','내 점수','상대 점수','결과'];
            histHeaders.forEach((h,i) => ws.getRow(rn).getCell(i+1).value = h);
            styleHeader(ws, 7, rn);

            rn++;
            const myMatches = matches
                .filter(m => [m.a1,m.a2,m.b1,m.b2].includes(name))
                .sort((a,b) => a.d.localeCompare(b.d));
            const histStart = rn;
            myMatches.forEach(m => {
                let partner, opp1, opp2, myScore, oppScore;
                if (m.a1===name||m.a2===name) {
                    partner = m.a1===name?m.a2:m.a1; opp1=m.b1; opp2=m.b2; myScore=m.ls; oppScore=m.rs;
                } else {
                    partner = m.b1===name?m.b2:m.b1; opp1=m.a1; opp2=m.a2; myScore=m.rs; oppScore=m.ls;
                }
                const result = myScore>oppScore?'승':(myScore===oppScore?'무':'패');
                ws.getRow(rn).getCell(1).value = m.d;
                ws.getRow(rn).getCell(2).value = partner;
                ws.getRow(rn).getCell(3).value = opp1;
                ws.getRow(rn).getCell(4).value = opp2;
                ws.getRow(rn).getCell(5).value = myScore;
                ws.getRow(rn).getCell(6).value = oppScore;
                ws.getRow(rn).getCell(7).value = result;
                rn++;
            });
            styleDataRows(ws, histStart, histStart+myMatches.length-1, 7);
            for (let r=histStart; r<histStart+myMatches.length; r++) {
                const res = ws.getRow(r).getCell(7).value;
                ws.getRow(r).getCell(7).font = {...dataFont, bold:true, color:{argb:res==='승'?green:res==='패'?red:amber}};
            }
        });

        // ── Download ──
        const buffer = await EWB.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `인앤아웃_분석결과_${dateStr.replace(/\./g,'')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error('Excel generation error:', err);
        alert('Excel 생성에 실패했습니다. 인터넷 연결을 확인해주세요.\n(ExcelJS CDN 필요)');
    } finally {
        btn.innerHTML = origHTML;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

// ═══════════════════════════════════════════════
// Match Scheduler (대진 작성)
// ═══════════════════════════════════════════════
// 게스트는 data.members에 type:'게스트'로 통합 관리 (회원관리 탭과 양방향 연동)
let currentSchedule = null;
// 로컬이면 localhost:5050, 배포 환경이면 같은 서버(상대 URL)
const SCHEDULE_SERVER = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5050'
    : '';
let _scheduleSaveTimer = null;

// ── 서버 저장/불러오기 ──
async function saveScheduleManually() {
    if (!currentSchedule) return;
    const btn = document.getElementById('sch-save-btn');
    const status = document.getElementById('sch-save-status');
    btn.disabled = true;
    btn.textContent = '⏳ 저장 중...';
    status.style.display = 'inline';
    status.style.color = 'var(--text-muted)';
    status.textContent = '';

    const date = currentSchedule.date || _localDateStr();
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/${date}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSchedule)
        });
        if (resp.ok) {
            btn.textContent = '✅ 저장 완료';
            status.style.color = '#4ade80';
            status.textContent = date;
            _saveScheduleToLocal();
            await _populateScheduleDateSelect();
        } else {
            throw new Error(`서버 오류 ${resp.status}`);
        }
    } catch(e) {
        btn.textContent = '❌ 저장 실패';
        btn.style.color = '#f87171';
        status.style.color = '#f87171';
        status.textContent = e.message;
    }

    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '💾 수정사항 저장';
        btn.style.color = '';
        status.style.display = 'none';
    }, 3000);
}

async function _saveScheduleToServer() {
    if (!currentSchedule) return;
    const date = currentSchedule.date || _localDateStr();
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/${date}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSchedule)
        });
        if (resp.ok) await _populateScheduleDateSelect();
    } catch(e) { console.warn('[Schedule] 자동저장 실패:', e.message); }
}

function _scheduleSaveDebounced() {
    clearTimeout(_scheduleSaveTimer);
    _scheduleSaveTimer = setTimeout(_saveScheduleToServer, 5000); // 5초 디바운스
}

async function _loadLatestScheduleFromServer() {
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/latest`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && data.schedule) {
            currentSchedule = data;
            document.getElementById('sch-result').style.display = 'block';
            renderScheduleOutput();
            console.log('[Schedule] 최근 대진 복원:', data.date);
            await _populateScheduleDateSelect();
        }
    } catch(e) { console.warn('[Schedule] 서버에서 불러오기 실패:', e.message); }
}

async function _loadScheduleList() {
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/list`);
        if (!resp.ok) return [];
        return await resp.json(); // [{date, versions:[{id, saved_at}]}]
    } catch(e) { return []; }
}

async function loadScheduleByDate(key) {
    if (!key) { alert('날짜/버전을 선택해주세요.'); return; }
    showToast('대진 불러오는 중...', 'loading');
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/${key}`);
        if (!resp.ok) {
            showToast('대진을 찾을 수 없습니다', 'error', 2500);
            return;
        }
        const result = await resp.json();
        if (result && result.schedule) {
            currentSchedule = result;
            _saveScheduleToLocal();
            document.getElementById('sch-result').style.display = 'block';
            renderScheduleOutput();

            // 이전 대진 참석자 복원
            if (result.players && result.players.length > 0) {
                const prevNames = new Set(result.players.map(p => p.name));
                // 기존 회원 선택 상태 업데이트
                data.members.forEach(m => { m._selected = prevNames.has(m.name); });
                // 이전 참석자 중 현재 멤버 목록에 없는 사람(게스트 등) 추가
                result.players.forEach(p => {
                    if (!data.members.find(m => m.name === p.name)) {
                        data.members.push({ name: p.name, gender: p.gender, level: p.level, type: p.type || '게스트', _selected: true });
                    }
                });
            } else {
                data.members.forEach(m => { if (m._selected === undefined) m._selected = false; });
            }

            renderTimeSlots();
            renderSchPlayerList();
            const playerCount = result.players ? result.players.length : 0;
            showToast(`${result.date} 대진 불러오기 완료 — 참석자 ${playerCount}명 복원`, 'success', 2500);
        }
    } catch(e) {
        showToast('불러오기 실패', 'error', 2500);
    }
}

async function _populateScheduleDateSelect() {
    const sel = document.getElementById('sch-load-date');
    if (!sel) return;
    const list = await _loadScheduleList();
    if (!list || list.length === 0) {
        sel.innerHTML = '<option value="">저장된 대진 없음</option>';
        return;
    }
    let html = '<option value="">-- 날짜/버전 선택 --</option>';
    list.forEach(({ date, versions }) => {
        if (versions.length === 1) {
            html += `<option value="${versions[0].id}">${date}</option>`;
        } else {
            html += `<optgroup label="${date} (${versions.length}개)">`;
            versions.forEach((v, i) => {
                const label = i === 0 ? `${v.saved_at} (최신)` : v.saved_at;
                html += `<option value="${v.id}">${date} ${label}</option>`;
            });
            html += '</optgroup>';
        }
    });
    sel.innerHTML = html;
}

// 대진표 localStorage 저장/복원
function _saveScheduleToLocal() {
    try {
        if (currentSchedule) localStorage.setItem('inout_current_schedule', JSON.stringify(currentSchedule));
    } catch(e) {}
}
function _loadScheduleFromLocal() {
    try {
        const saved = localStorage.getItem('inout_current_schedule');
        if (saved) {
            currentSchedule = JSON.parse(saved);
            document.getElementById('sch-result').style.display = 'block';
            renderScheduleOutput();
        }
    } catch(e) {}
}

// ── 시간대 슬롯 관리 ──
let timeSlots = [
    { start: '17:00', end: '17:30', courts: 2 },
    { start: '17:30', end: '18:00', courts: 2 },
    { start: '18:00', end: '18:30', courts: 3 },
    { start: '18:30', end: '19:00', courts: 3 },
    { start: '19:00', end: '19:30', courts: 2 },
    { start: '19:30', end: '20:00', courts: 2 }
];

function renderTimeSlots() {
    const container = document.getElementById('sch-timeslots');
    container.innerHTML = timeSlots.map((slot, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:8px;">
            <span style="color:var(--text-muted);font-size:12px;font-weight:600;min-width:24px;">${i+1}</span>
            <input type="time" value="${slot.start}" onchange="timeSlots[${i}].start=this.value;autoFillNextSlot(${i})" style="background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;">
            <span style="color:var(--text-muted);">~</span>
            <input type="time" value="${slot.end}" onchange="timeSlots[${i}].end=this.value;autoFillNextSlot(${i})" style="background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;">
            <select onchange="timeSlots[${i}].courts=parseInt(this.value)" style="background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;">
                ${[1,2,3,4].map(c => `<option value="${c}" ${c===slot.courts?'selected':''}>${c}면</option>`).join('')}
            </select>
            ${timeSlots.length > 1 ? `<button onclick="removeTimeSlot(${i})" style="background:none;border:none;color:var(--loss-color);cursor:pointer;font-size:16px;padding:4px;" title="삭제">✕</button>` : ''}
        </div>
    `).join('');
    updateSchSelectedCount();
}

function addTimeSlot() {
    const last = timeSlots[timeSlots.length - 1];
    const newStart = last ? last.end : '17:00';
    const [h,m] = newStart.split(':').map(Number);
    const endMin = h * 60 + m + 30;
    const newEnd = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
    timeSlots.push({ start: newStart, end: newEnd, courts: 2 });
    renderTimeSlots();
}

function removeTimeSlot(i) {
    timeSlots.splice(i, 1);
    renderTimeSlots();
}

function autoFillNextSlot(i) {
    if (i + 1 < timeSlots.length) {
        timeSlots[i+1].start = timeSlots[i].end;
        renderTimeSlots();
    }
}

function renderSchPlayerList() {
    renderSchWorkspace();
    renderSchLibrary();
    updateSchSelectedCount();
}

function renderSchWorkspace() {
    const container = document.getElementById('sch-workspace-chips');
    if (!container) return;
    const slotCount = timeSlots.length;
    const selected = data.members.filter(p => p._selected !== false);

    if (selected.length === 0) {
        container.innerHTML = '<span class="ws-empty-hint">아직 참석자가 없습니다. 위 검색창에서 이름을 검색하거나 라이브러리에서 [참석] 버튼을 눌러 추가하세요.</span>';
        return;
    }

    container.innerHTML = selected.map(p => {
        const gClass = p.gender === '여' ? 'ws-chip-gender-f' : 'ws-chip-gender-m';
        const levelColor = p.level >= 7 ? 'var(--win-color)' : p.level <= 4 ? 'var(--loss-color)' : 'var(--wr-mid)';
        const chipId = `wschip_${p.name.replace(/\s/g,'_')}`;
        const panelId = `wspanel_${p.name.replace(/\s/g,'_')}`;

        if (!p._availableSlots) p._availableSlots = Array.from({length: Math.max(slotCount, 8)}, () => true);
        while (p._availableSlots.length < slotCount) p._availableSlots.push(true);
        const activeSlots = timeSlots.filter((_, si) => p._availableSlots[si] !== false).length;
        const allSlots = activeSlots === slotCount;
        const slotInfo = allSlots ? '' : ` <span style="color:var(--wr-mid);font-size:10px;font-weight:700;">${activeSlots}/${slotCount}</span>`;

        const isEditable = p.type !== '회원';
        const curMax = p._maxGames || 0;
        const levelOptions = [3,4,5,6,7,8].map(lv => `<option value="${lv}" ${lv===p.level?'selected':''}>${lv}</option>`).join('');
        const maxGameOptions = [0,1,2,3,4,5,6,7,8].map(v =>
            `<option value="${v}" ${v===curMax?'selected':''}>${v===0?'∞':v}</option>`
        ).join('');

        const slotChecks = slotCount > 1 ? timeSlots.map((slot, si) => {
            const slotChecked = p._availableSlots[si] !== false ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:3px;cursor:pointer;background:${p._availableSlots[si]!==false?'rgba(76,175,80,0.12)':'var(--bg-primary)'};border:1px solid ${p._availableSlots[si]!==false?'var(--accent)':'var(--border-secondary)'};border-radius:6px;padding:3px 6px;" title="${slot.start}~${slot.end}">
                <input type="checkbox" ${slotChecked} onchange="togglePlayerSlotWs('${p.name}',${si},this.checked)" style="accent-color:var(--accent);width:12px;height:12px;">
                <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">${slot.start.slice(0,5)}</span>
            </label>`;
        }).join('') : '';

        const typeOptions = ['회원','비회원','게스트'].map(t => `<option value="${t}" ${t===p.type?'selected':''}>${t}</option>`).join('');

        return `<div id="${chipId}" style="display:flex;flex-direction:column;">
            <div class="ws-chip" onclick="toggleWsChip('${p.name}')">
                <div class="ws-chip-main">
                    <span class="ws-chip-name">${p.name}</span>
                    <span class="${gClass}">${p.gender}</span>
                    <span class="ws-chip-level" style="color:${levelColor};">Lv${p.level}</span>
                    ${slotInfo}
                </div>
                <div class="ws-chip-remove" onclick="event.stopPropagation(); removeFromWorkspace('${p.name}')">✕</div>
            </div>
            <div id="${panelId}" class="ws-chip-panel" style="display:none;">
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                    ${slotCount > 1 ? `<div><div style="font-size:11px;color:var(--text-dimmed);margin-bottom:4px;">시간대</div><div style="display:flex;gap:4px;flex-wrap:wrap;">${slotChecks}</div></div>` : ''}
                    <div><div style="font-size:11px;color:var(--text-dimmed);margin-bottom:4px;">최대 게임</div>
                        <select onchange="changePlayerMaxGames('${p.name}',parseInt(this.value));renderSchWorkspace();" style="background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-secondary);border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit;cursor:pointer;">${maxGameOptions}</select>
                    </div>
                    <div><div style="font-size:11px;color:var(--text-dimmed);margin-bottom:4px;">레벨</div>
                        <select onchange="changePlayerLevel('${p.name}',parseInt(this.value));" style="background:var(--input-bg);color:${levelColor};border:1px solid var(--border-secondary);border-radius:6px;padding:4px 6px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;">${levelOptions}</select>
                    </div>
                    ${isEditable ? `<div><div style="font-size:11px;color:var(--text-dimmed);margin-bottom:4px;">성별</div>
                        <select onchange="changePlayerGender('${p.name}',this.value);" style="background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-secondary);border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit;cursor:pointer;">
                            <option value="남" ${p.gender==='남'?'selected':''}>남</option><option value="여" ${p.gender==='여'?'selected':''}>여</option>
                        </select></div>` : ''}
                    ${isEditable ? `<div><div style="font-size:11px;color:var(--text-dimmed);margin-bottom:4px;">구분</div>
                        <select onchange="changePlayerType('${p.name}',this.value);" style="background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-secondary);border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit;cursor:pointer;">${typeOptions}</select></div>` : ''}
                    ${p.type === '게스트' ? `<button onclick="removeSchPlayer('${p.name}')" style="background:none;border:1px solid var(--loss-color);color:var(--loss-color);cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px;font-family:inherit;align-self:flex-end;">삭제</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // 재렌더 후 열려있던 패널 상태 복원
    _wsExpandedSet.forEach(name => _applyWsChipState(name));
}

function renderSchLibrary() {
    const container = document.getElementById('sch-player-list');
    if (!container) return;
    const filter = document.getElementById('sch-type-filter')?.value || 'all';
    const searchQuery = (document.getElementById('sch-lib-search')?.value || '').trim().toLowerCase();
    const slotCount = timeSlots.length;

    let filtered = filter === 'all' ? data.members : data.members.filter(p => p.type === filter);
    if (searchQuery) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));

    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1;color:var(--text-dimmed);font-size:13px;padding:12px;">검색 결과가 없습니다.</div>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const isSelected = p._selected !== false;
        const gColor = p.gender === '여' ? '#ec4899' : '#3b82f6';
        const gBg = p.gender === '여' ? 'rgba(236,72,153,0.15)' : 'rgba(59,130,246,0.15)';
        const levelColor = p.level >= 7 ? 'var(--win-color)' : p.level <= 4 ? 'var(--loss-color)' : 'var(--wr-mid)';
        const typeBadge = p.type === '게스트' ? '<span style="font-size:10px;color:#f59e0b;font-weight:700;">게스트</span>' :
                          p.type === '비회원' ? '<span style="font-size:10px;color:#6b7280;font-weight:700;">비회원</span>' : '';
        const actionBtn = isSelected
            ? `<button class="lib-cancel-btn" onclick="removeFromWorkspace('${p.name}')">참석 취소</button>`
            : `<button class="lib-add-btn" onclick="addToWorkspace('${p.name}')">참석</button>`;
        const deleteBtn = p.type === '게스트'
            ? `<button onclick="removeSchPlayer('${p.name}')" title="삭제" style="background:none;border:none;color:var(--loss-color);cursor:pointer;font-size:11px;padding:0 2px;opacity:0.5;transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">✕</button>` : '';

        return `<div class="lib-card ${isSelected ? 'lib-selected' : ''}">
            <div class="lib-card-info">
                <div style="display:flex;align-items:center;gap:4px;">
                    <span class="lib-card-name">${p.name}</span>
                    ${typeBadge}
                </div>
                <div class="lib-card-meta">
                    <span style="color:${gColor};background:${gBg};font-size:10px;font-weight:700;padding:1px 4px;border-radius:4px;">${p.gender}</span>
                    <span style="color:${levelColor};font-weight:700;margin-left:4px;">Lv${p.level}</span>
                </div>
            </div>
            ${actionBtn}
            ${deleteBtn}
        </div>`;
    }).join('');
}

function addToWorkspace(name) {
    const m = data.members.find(m => m.name === name);
    if (m) { m._selected = true; renderSchPlayerList(); }
}

function removeFromWorkspace(name) {
    const m = data.members.find(m => m.name === name);
    if (m) { m._selected = false; _wsExpandedSet.delete(name); renderSchPlayerList(); }
}

const _wsExpandedSet = new Set();

function toggleWsChip(name) {
    if (_wsExpandedSet.has(name)) {
        _wsExpandedSet.delete(name);
    } else {
        _wsExpandedSet.add(name);
    }
    _applyWsChipState(name);
}

function _applyWsChipState(name) {
    const panelId = `wspanel_${name.replace(/\s/g,'_')}`;
    const chipId = `wschip_${name.replace(/\s/g,'_')}`;
    const panel = document.getElementById(panelId);
    const chipWrapper = document.getElementById(chipId);
    if (!panel) return;
    const open = _wsExpandedSet.has(name);
    panel.style.display = open ? 'block' : 'none';
    const chipEl = chipWrapper?.querySelector('.ws-chip');
    if (chipEl) chipEl.classList.toggle('chip-expanded', open);
}

let _wsLastQuery = '';
let _wsDropdownMatches = [];

function schQuickSearch(query) {
    const dropdown = document.getElementById('ws-dropdown');
    if (!dropdown) return;
    const q = query.trim().toLowerCase();
    _wsLastQuery = query.trim();

    if (!q) { dropdown.style.display = 'none'; _wsDropdownMatches = []; return; }

    _wsDropdownMatches = data.members.filter(m => m.name.toLowerCase().includes(q));
    if (_wsDropdownMatches.length === 0) {
        dropdown.innerHTML = `<div class="ws-dd-guest-add" onclick="schAddGuestFromSearch('${query.trim()}')">+ "${query.trim()}" 게스트로 추가</div>`;
    } else {
        dropdown.innerHTML = _wsDropdownMatches.map((m, i) => {
            const alreadyIn = m._selected !== false;
            const gColor = m.gender === '여' ? '#ec4899' : '#3b82f6';
            return `<div class="ws-dd-item${i === 0 ? ' ws-dd-first' : ''}" onclick="schQuickAdd('${m.name}')">
                <span style="font-weight:700;">${m.name}</span>
                <span style="margin-left:6px;font-size:11px;color:${gColor};">${m.gender}</span>
                <span style="margin-left:4px;font-size:11px;color:var(--text-dimmed);">Lv${m.level}</span>
                ${alreadyIn ? '<span style="margin-left:6px;font-size:10px;color:var(--accent-text);font-weight:700;">✓ 참석 중</span>' : ''}
            </div>`;
        }).join('') + `<div class="ws-dd-guest-add" onclick="schAddGuestFromSearch('${query.trim()}')">+ 새 게스트: "${query.trim()}"</div>`;
    }
    dropdown.style.display = 'block';
}

function schQuickSearchKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (_wsDropdownMatches.length > 0) {
        // 매칭 결과가 있으면 첫 번째 항목 바로 추가
        schQuickAdd(_wsDropdownMatches[0].name);
    } else if (_wsLastQuery) {
        // 매칭 없으면 게스트 추가 흐름
        schAddGuestFromSearch(_wsLastQuery);
    }
}

function schQuickAdd(name) {
    addToWorkspace(name);
    const inp = document.getElementById('sch-search-input');
    if (inp) inp.value = '';
    const dd = document.getElementById('ws-dropdown');
    if (dd) dd.style.display = 'none';
}

function schAddGuestFromSearch(name) {
    if (!name) return;
    if (data.members.some(m => m.name === name)) {
        addToWorkspace(name);
    } else {
        document.getElementById('sch-guest-name').value = name;
        const drawer = document.getElementById('sch-guest-drawer');
        if (drawer) drawer.style.display = 'block';
    }
    const inp = document.getElementById('sch-search-input');
    if (inp) inp.value = '';
    const dd = document.getElementById('ws-dropdown');
    if (dd) dd.style.display = 'none';
}

function toggleGuestDrawer() {
    const el = document.getElementById('sch-guest-drawer');
    if (!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    if (!open) document.getElementById('sch-guest-name')?.focus();
}

function toggleSchLibrary() {
    const body = document.getElementById('sch-library-body');
    const icon = document.getElementById('lib-toggle-icon');
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (icon) icon.style.transform = open ? '' : 'rotate(180deg)';
    if (!open) renderSchLibrary();
}

function toggleSchOptions() {
    const el = document.getElementById('sch-options-drawer');
    if (!el) return;
    el.style.display = el.style.display !== 'none' ? 'none' : 'block';
}

function togglePlayerSlotWs(name, slotIdx, checked) {
    const p = data.members.find(m => m.name === name);
    if (p) {
        if (!p._availableSlots) p._availableSlots = Array.from({length: timeSlots.length}, () => true);
        p._availableSlots[slotIdx] = checked;
        renderSchWorkspace();
        updateSchSelectedCount();
    }
}

// 외부 클릭시 드롭다운 닫기 (document 레벨)
document.addEventListener('click', function(e) {
    const dd = document.getElementById('ws-dropdown');
    const inp = document.getElementById('sch-search-input');
    if (dd && inp && !inp.contains(e.target) && !dd.contains(e.target)) {
        dd.style.display = 'none';
    }
});

function togglePlayerSlot(name, slotIdx, checked) {
    const p = data.members.find(m => m.name === name);
    if (p) {
        if (!p._availableSlots) p._availableSlots = Array.from({length: timeSlots.length}, () => true);
        p._availableSlots[slotIdx] = checked;
    }
}

function changePlayerMaxGames(name, value) {
    const p = data.members.find(m => m.name === name);
    if (p) p._maxGames = value;
}

function _syncToAllPlayers(name, updates) {
    const ap = data.allPlayers.find(p => p.name === name);
    if (ap) Object.assign(ap, updates);
}

function changePlayerLevel(name, newLevel) {
    const m = data.members.find(m => m.name === name);
    if (m) m.level = newLevel;
    _syncToAllPlayers(name, { level: newLevel });
    renderSchPlayerList();
    syncMembersToGSheet();
    if (typeof renderMemberList === 'function') renderMemberList();
}

function changePlayerGender(name, newGender) {
    const m = data.members.find(m => m.name === name);
    if (m) m.gender = newGender;
    _syncToAllPlayers(name, { gender: newGender });
    renderSchPlayerList();
    syncMembersToGSheet();
    if (typeof renderMemberList === 'function') renderMemberList();
}

function removeSchGuest(name) {
    const idx = data.members.findIndex(m => m.name === name && m.type === '게스트');
    if (idx >= 0) {
        data.members.splice(idx, 1);
        const apIdx = data.allPlayers.findIndex(p => p.name === name);
        if (apIdx >= 0) data.allPlayers.splice(apIdx, 1);
        renderSchPlayerList();
        updateSchSelectedCount();
        if (typeof renderMemberList === 'function') renderMemberList();
    }
}

function removeSchPlayer(name) {
    const mIdx = data.members.findIndex(m => m.name === name);
    if (mIdx >= 0) {
        const m = data.members[mIdx];
        if (m.type === '회원') return; // 회원은 삭제 불가
        data.members.splice(mIdx, 1);
        const apIdx = data.allPlayers.findIndex(p => p.name === name);
        if (apIdx >= 0) data.allPlayers.splice(apIdx, 1);
        renderSchPlayerList();
        updateSchSelectedCount();
        setMemberMode(memberMode);
        syncMembersToGSheet();
        if (typeof renderMemberList === 'function') renderMemberList();
    }
}

function changePlayerType(name, newType) {
    const m = data.members.find(m => m.name === name);
    if (m) m.type = newType;
    // allPlayers에도 반영 (없으면 추가)
    const ap = data.allPlayers.find(p => p.name === name);
    if (ap) {
        ap.type = newType;
    } else if (m) {
        data.allPlayers.push({ name: m.name, gender: m.gender, level: m.level, type: newType });
    }
    renderSchPlayerList();
    // 분석 데이터 전체 갱신 (드롭다운 + 회원요약, MVP, 파트너조합 등)
    setMemberMode(memberMode);
    syncMembersToGSheet();
    if (typeof renderMemberList === 'function') renderMemberList();
}

function toggleSchPlayer(name, checked) {
    const m = data.members.find(m => m.name === name);
    if (m) m._selected = checked;
    renderSchPlayerList();
}

function schSelectAll(select) {
    const filter = document.getElementById('sch-type-filter')?.value || 'all';
    data.members.forEach(m => {
        if (filter === 'all' || m.type === filter) m._selected = select;
    });
    renderSchPlayerList();
}

function _recommendCourts(n) {
    // n명일 때 적정 코트 수 추천
    // 4명당 1코트, 대기 1~2명 적정 (전원 참여 보장 + 쉬는 인원 최소화)
    if (n < 4) return { rec: 0, msg: '4명 이상 필요' };
    // 코트별: 경기 n명 = courts*4, 대기 = n - courts*4
    // 대기 0~3명이 이상적 (너무 많으면 기다리는 시간 길어짐)
    const maxPossible = Math.floor(n / 4);
    let rec = maxPossible;
    const wait = n - rec * 4;
    // 대기가 0이면 완벽, 1~3명도 OK
    // 하지만 코트가 너무 많으면 레벨 배분이 어려우므로 대기 2~4명 유지 권장
    if (n >= 6 && n <= 7) rec = 1;    // 6~7명: 1면 (대기 2~3)
    else if (n >= 8 && n <= 11) rec = 2;   // 8~11명: 2면 (대기 0~3)
    else if (n >= 12 && n <= 15) rec = 3;  // 12~15명: 3면 (대기 0~3)
    else if (n >= 16 && n <= 19) rec = 4;  // 16~19명: 4면 (대기 0~3)
    else if (n >= 20) rec = Math.min(Math.floor(n / 4.5), 5); // 20+

    const waitCount = n - rec * 4;
    const playCount = rec * 4;
    return { rec, wait: waitCount, play: playCount };
}

function updateSchSelectedCount() {
    const selected = getSchSelectedPlayers();
    const badge = document.getElementById('sch-selected-count');
    const infoEl = document.getElementById('sch-count-info');
    const maxCourts = Math.max(...timeSlots.map(s => s.courts));
    const totalRounds = _expandTimeSlotsToRounds().length;
    const n = selected.length;
    const info = _recommendCourts(n);

    if (badge) badge.textContent = `${n}명`;

    if (!infoEl) return;
    if (n < 4) {
        infoEl.innerHTML = `<span style="color:var(--loss-color);">최소 4명 필요</span>`;
    } else {
        let html = `<span style="color:var(--accent-text);font-weight:700;">${n}명</span>`;
        html += ` <span style="color:var(--text-muted);">${totalRounds}라운드</span>`;
        html += ` · 추천 <span style="color:var(--accent-text);font-weight:700;">${info.rec}면</span>`;
        html += ` <span style="color:var(--text-muted);">(경기 ${info.play} / 대기 ${info.wait})</span>`;
        if (info.rec !== maxCourts) {
            html += ` <span style="color:var(--wr-mid);font-size:11px;">현재 최대 ${maxCourts}면</span>`;
        }
        infoEl.innerHTML = html;
    }
}

function getSchSelectedPlayers() {
    return data.members.filter(p => p._selected !== false);
}

function addSchGuest() {
    const name = document.getElementById('sch-guest-name').value.trim();
    const gender = document.getElementById('sch-guest-gender').value;
    const level = parseInt(document.getElementById('sch-guest-level').value);
    if (!name) { alert('이름을 입력하세요.'); return; }
    if (data.members.some(m => m.name === name)) {
        alert('이미 라이브러리에 있는 이름입니다. 워크스페이스에 추가하려면 이름을 검색하거나 라이브러리에서 [+ 추가]를 누르세요.'); return;
    }
    data.members.push({name, gender, level, type:'게스트', _selected:true});
    if (!data.allPlayers.find(p => p.name === name)) {
        data.allPlayers.push({name, gender, level, type:'게스트'});
        data.allPlayers.sort((a,b) => a.name.localeCompare(b.name,'ko'));
    }
    document.getElementById('sch-guest-name').value = '';
    const drawer = document.getElementById('sch-guest-drawer');
    if (drawer) drawer.style.display = 'none';
    renderSchPlayerList();
    if (typeof renderMemberList === 'function') renderMemberList();
    autoSyncMembers();
}

// ── 이전 대진 반영 UI 토글 ──
function toggleHistoryOptions() {
    const checked = document.getElementById('sch-use-history').checked;
    document.getElementById('sch-history-options').style.display = checked ? 'block' : 'none';
    if (checked) {
        const info = document.getElementById('sch-history-info');
        const matchCount = data.matches ? data.matches.length : 0;
        const playerCount = data.allPlayers ? data.allPlayers.length : 0;
        info.textContent = `${matchCount}경기, ${playerCount}명의 기록을 반영합니다.`;
    }
}

// ── 이전 대진 데이터에서 파트너/상대 카운트 로드 ──
function _loadHistoryCounts(players) {
    const partnerCounts = {};
    const opponentCounts = {};
    const playerNames = new Set(players.map(p => p.name));
    if (!data.matches) return { partnerCounts, opponentCounts };

    data.matches.forEach(m => {
        // 파트너 카운트
        if (playerNames.has(m.a1) && playerNames.has(m.a2)) {
            const pk = _pairKey(m.a1, m.a2);
            partnerCounts[pk] = (partnerCounts[pk] || 0) + 1;
        }
        if (playerNames.has(m.b1) && playerNames.has(m.b2)) {
            const pk = _pairKey(m.b1, m.b2);
            partnerCounts[pk] = (partnerCounts[pk] || 0) + 1;
        }
        // 상대 카운트
        [m.a1, m.a2].forEach(a => {
            [m.b1, m.b2].forEach(b => {
                if (playerNames.has(a) && playerNames.has(b)) {
                    const ok = _pairKey(a, b);
                    opponentCounts[ok] = (opponentCounts[ok] || 0) + 1;
                }
            });
        });
    });
    return { partnerCounts, opponentCounts };
}

// ── 상성 데이터 로드: 1:1 승률 매트릭스 ──
function _loadMatchupData(players) {
    const matchups = {}; // matchups[A|B] = { w, l, total }  (A 시점 기준)
    const playerNames = new Set(players.map(p => p.name));
    if (!data.matches) return matchups;

    data.matches.forEach(m => {
        const aWin = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        [m.a1, m.a2].forEach(a => {
            [m.b1, m.b2].forEach(b => {
                if (!playerNames.has(a) || !playerNames.has(b)) return;
                const key = _pairKey(a, b);
                if (!matchups[key]) matchups[key] = {};
                if (!matchups[key][a]) matchups[key][a] = { w: 0, l: 0, total: 0 };
                if (!matchups[key][b]) matchups[key][b] = { w: 0, l: 0, total: 0 };
                matchups[key][a].total++;
                matchups[key][b].total++;
                if (aWin === 1) { matchups[key][a].w++; matchups[key][b].l++; }
                else if (aWin === -1) { matchups[key][a].l++; matchups[key][b].w++; }
            });
        });
    });
    return matchups;
}

// ── 승률 기반 레벨 보정 ──
function _adjustLevelsFromHistory(players) {
    if (!data.matches || data.matches.length === 0) return;
    const playerNames = new Set(players.map(p => p.name));
    const statsMap = {};
    data.matches.forEach(m => {
        const aWin = m.ls > m.rs ? 1 : (m.ls === m.rs ? 0 : -1);
        [m.a1, m.a2].forEach(p => {
            if (!playerNames.has(p)) return;
            if (!statsMap[p]) statsMap[p] = { w: 0, d: 0, l: 0, total: 0 };
            statsMap[p].total++;
            if (aWin === 1) statsMap[p].w++; else if (aWin === 0) statsMap[p].d++; else statsMap[p].l++;
        });
        [m.b1, m.b2].forEach(p => {
            if (!playerNames.has(p)) return;
            if (!statsMap[p]) statsMap[p] = { w: 0, d: 0, l: 0, total: 0 };
            statsMap[p].total++;
            if (aWin === -1) statsMap[p].w++; else if (aWin === 0) statsMap[p].d++; else statsMap[p].l++;
        });
    });

    players.forEach(p => {
        const s = statsMap[p.name];
        if (!s || s.total < 3) return; // 3경기 미만은 보정 안함
        const wr = (s.w + s.d * 0.5) / s.total;
        // 승률→레벨 보정: 50%=기준(변동 없음), 70%이상=+1, 30%이하=-1
        // 원래 레벨에서 최대 ±1.5 범위로 부드럽게 보정
        const delta = (wr - 0.5) * 3.0; // -1.5 ~ +1.5
        p._originalLevel = p.level;
        p.level = Math.max(3, Math.min(8, Math.round(p.level + delta)));
    });
}

// ── 스케줄러 설정 (가중치) ── Python SchedulerConfig 이식
const schConfig = {
    w_team_balance: 3.0,      // 팀 레벨 합 차이 페널티
    w_level_spread: 2.0,      // 코트 내 4명 레벨 분산 페널티
    w_repeat_partner: 6.0,    // 파트너 중복 페널티
    w_repeat_opponent: 2.0,   // 상대 중복 페널티
    w_mixed_team: 2.0,        // 혼성 팀 보너스 (음수=좋음, 높을수록 혼성 선호)
    w_same_gender_team: 5.0,  // 동성 팀 페널티 (남남/여여 억제)
    w_all_female_court: 3.0,  // 전원 여자 코트 보너스
    prefer_women_court_min: 4,// 여자코트 선호 활성화 최소 여성 수
    transition_rounds: 3,     // 레벨 분산 가중치 감소 라운드
    max_extra_games: 1,       // 목표 초과 허용치
    min_games_each: 4,        // 최소 보장 경기 수
    heuristic_iters: 4000,    // 3코트+ 로컬서치 반복 횟수
    heuristic_restarts: 3,    // 로컬서치 재시작 횟수
    w_game_balance: 5.0,      // 경기수 균형 페널티 (높을수록 균등 배분 강화)
    balance_post_passes: 3    // 후처리 밸런싱 반복 횟수
};

// ── 헬퍼 함수들 ──
function _pairKey(a, b) { return a < b ? a+'|'+b : b+'|'+a; }

function _allTeamPairings(four) {
    // 4명의 3가지 팀 조합 반환: [[t1,t2], [t1,t2], [t1,t2]]
    const [a,b,c,d] = four;
    return [
        [[a,b],[c,d]],
        [[a,c],[b,d]],
        [[a,d],[b,c]]
    ];
}

// ── 여자복식 코트 선점: 여자 4명을 먼저 확정하고, 나머지를 일반 배정 ──
// 반환: { womenCourt: {t1, t2} 또는 null, remainingPlayers: [...] }
function _reserveWomenDoublesCourt(allSelected, cfg, state) {
    const females = allSelected.filter(p => p.gender === '여');
    const minWDTarget = 2; // 여자당 최소 여자복식 경기 수

    // 여자 4명 미만이면 불가
    if (females.length < 4) return { womenCourt: null, remainingPlayers: allSelected };

    // 여자복식이 아직 필요한 여자: 목표(2경기) 미달인 사람
    const needWD = females.filter(p => (state.womenDoublesCount[p.name] || 0) < minWDTarget);

    // 필요한 여자가 4명 이상이면 우선 배정
    // 필요한 여자가 1~3명이면 나머지는 가장 적게 뛴 여자로 보충
    // 필요한 여자가 0명이면 여자복식 코트 안 만들어도 됨 (다 충족)
    if (needWD.length === 0) return { womenCourt: null, remainingPlayers: allSelected };

    // 여자복식 코트에 배정할 4명 선택
    // 우선순위: 여자복식 카운트 적은 순 → 전체 경기수 적은 순
    const sortedFemales = [...females].sort((a, b) => {
        const wdDiff = (state.womenDoublesCount[a.name] || 0) - (state.womenDoublesCount[b.name] || 0);
        if (wdDiff !== 0) return wdDiff;
        return (state.playedCounts[a.name] || 0) - (state.playedCounts[b.name] || 0);
    });

    const womenFour = sortedFemales.slice(0, 4);
    const womenNames = new Set(womenFour.map(p => p.name));

    // 최적 팀 페어링 찾기
    const bp = _bestPairingForFour(womenFour, cfg, state);

    // 나머지 선수 (선택된 여자 4명 제외)
    const remaining = allSelected.filter(p => !womenNames.has(p.name));

    return {
        womenCourt: { four: womenFour, t1: bp.t1, t2: bp.t2 },
        remainingPlayers: remaining
    };
}

function _levelSpreadPenalty(four) {
    const levels = four.map(p => p.level || 6);
    const mean = levels.reduce((s,v) => s+v, 0) / 4;
    return levels.reduce((s,v) => s + (v-mean)*(v-mean), 0) / 4;
}

function _teamBalancePenalty(t1, t2) {
    const s1 = (t1[0].level||6) + (t1[1].level||6);
    const s2 = (t2[0].level||6) + (t2[1].level||6);
    return Math.abs(s1 - s2);
}

function _mixedTeamBonus(team) {
    return team[0].gender !== team[1].gender ? -1.0 : 0.0;
}

function _sameGenderBonus(team) {
    // 동성 팀이면 양수 페널티 → 스코어 올라감 → 기피
    // 단, 여여 팀은 여자복식 코트 구성을 위해 면제
    if (team[0].gender === team[1].gender) {
        if (team[0].gender === '여') return 0.0; // 여여는 페널티 없음
        return 1.0; // 남남만 페널티
    }
    return 0.0;
}

function _allFemaleCourtBonus(four) {
    return four.every(p => p.gender === '여') ? -8.0 : 0.0;
}

function _countPenalty(state, t1, t2) {
    const pk1 = _pairKey(t1[0].name, t1[1].name);
    const pk2 = _pairKey(t2[0].name, t2[1].name);
    const partnerPen = (state.partnerCounts[pk1]||0) + (state.partnerCounts[pk2]||0);
    let oppPen = 0;
    for (const x of t1) for (const y of t2) {
        oppPen += state.opponentCounts[_pairKey(x.name, y.name)] || 0;
    }
    return { partnerPen, oppPen };
}

function _roundLevelSpreadWeight(cfg, roundIdx) {
    if (cfg.transition_rounds <= 0) return cfg.w_level_spread;
    const t = Math.min(1.0, roundIdx / cfg.transition_rounds);
    return cfg.w_level_spread * (1.0 - 0.7 * t); // 100% → 30%
}

// ── 4명 내 최적 팀 페어링 찾기 (Python _best_pairing_for_four 이식) ──
function _bestPairingForFour(four, cfg, state) {
    const rSpread = _roundLevelSpreadWeight(cfg, state.roundIdx);
    const spreadPen = _levelSpreadPenalty(four);
    const numFemales = state.selectedFemales || 0;

    // 경기수 균형 페널티: 이 4명이 추가 경기를 하면 목표 대비 초과되는 정도
    let gameBalPen = 0;
    if (cfg.w_game_balance) {
        four.forEach(p => {
            const target = state.targetGames[p.name] || 0;
            const played = state.playedCounts[p.name] || 0;
            const over = played - target;
            if (over >= 0) gameBalPen += (over + 1) * 0.5; // 초과할수록 증가
        });
    }

    // 상성 페널티: 같은 코트에서 천적/Easy Win 관계가 상대팀으로 만나면 페널티
    const matchups = state.matchups || {};
    function _matchupPenalty(t1, t2) {
        let pen = 0;
        for (const a of t1) {
            for (const b of t2) {
                const key = _pairKey(a.name, b.name);
                const mu = matchups[key];
                if (!mu) continue;
                const aStats = mu[a.name], bStats = mu[b.name];
                if (!aStats || !bStats || aStats.total < 3) continue;
                const aWr = aStats.w / aStats.total;
                const bWr = bStats.w / bStats.total;
                // 일방적 매치업(70%+ vs 30%-) 이면 페널티
                if (aWr >= 0.7 || bWr >= 0.7) pen += 2.0;
                else if (aWr >= 0.6 || bWr >= 0.6) pen += 0.5;
            }
        }
        return pen;
    }

    let best = null;
    for (const [t1, t2] of _allTeamPairings(four)) {
        const balPen = _teamBalancePenalty(t1, t2);
        const {partnerPen, oppPen} = _countPenalty(state, t1, t2);
        const mixedB = _mixedTeamBonus(t1) + _mixedTeamBonus(t2);
        const sameB = _sameGenderBonus(t1) + _sameGenderBonus(t2);
        let femaleCB = 0;
        if (numFemales >= cfg.prefer_women_court_min) {
            femaleCB = _allFemaleCourtBonus(four);
        }
        const muPen = Object.keys(matchups).length > 0 ? _matchupPenalty(t1, t2) : 0;
        const score = cfg.w_team_balance * balPen
            + rSpread * spreadPen
            + cfg.w_repeat_partner * partnerPen
            + cfg.w_repeat_opponent * oppPen
            + cfg.w_mixed_team * mixedB
            + cfg.w_same_gender_team * sameB
            + cfg.w_all_female_court * femaleCB
            + (cfg.w_game_balance || 0) * gameBalPen
            + cfg.w_repeat_opponent * muPen;
        if (best === null || score < best.score) {
            best = { score, t1, t2 };
        }
    }
    return best;
}

// ── 2코트 전수 탐색 (Python _best_assignment_for_selected 이식) ──
function _exactSearch(selected, cfg, state) {
    const C = cfg._courts;
    let best = null;

    function rec(remaining, built) {
        if (built.length === C) {
            let totalScore = 0;
            const courtsDetail = [];
            for (const four of built) {
                const bp = _bestPairingForFour(four, cfg, state);
                totalScore += bp.score;
                courtsDetail.push({ four, t1: bp.t1, t2: bp.t2 });
            }
            if (best === null || totalScore < best.totalScore) {
                best = { totalScore, courtsDetail };
            }
            return;
        }
        if (remaining.length < 4 * (C - built.length)) return;

        // 조합 생성: remaining에서 4명 선택
        const n = remaining.length;
        for (let i = 0; i < n-3; i++)
        for (let j = i+1; j < n-2; j++)
        for (let k = j+1; k < n-1; k++)
        for (let l = k+1; l < n; l++) {
            const four = [remaining[i], remaining[j], remaining[k], remaining[l]];
            const rest = remaining.filter((_, idx) => idx!==i && idx!==j && idx!==k && idx!==l);
            rec(rest, [...built, four]);
        }
    }

    rec(selected, []);
    return best;
}

// ── 스네이크 초기 배치 (Python _snake_initial_courts 이식) ──
function _snakeInitialCourts(selected, courts) {
    const sorted = [...selected].sort((a,b) => b.level - a.level);
    const buckets = Array.from({length: courts}, () => []);
    const fwd = [...Array(courts).keys()];
    const rev = [...fwd].reverse();
    const idxs = [...fwd, ...rev];
    let t = 0;
    for (const p of sorted) {
        buckets[idxs[t % idxs.length]].push(p);
        t++;
    }
    return buckets;
}

// ── 3코트+ 휴리스틱 로컬서치 (Python _heuristic_local_search 이식) ──
function _heuristicLocalSearch(selected, cfg, state) {
    const C = cfg._courts;
    let bestGlobal = null;

    for (let rr = 0; rr < cfg.heuristic_restarts; rr++) {
        // 스네이크 초기 배치
        let courtsPlayers;
        try {
            courtsPlayers = _snakeInitialCourts(selected, C);
        } catch(e) {
            // fallback: 단순 분할
            const flat = [...selected].sort(() => Math.random() - 0.5);
            courtsPlayers = [];
            for (let i = 0; i < C; i++) courtsPlayers.push(flat.slice(i*4, i*4+4));
        }
        // 버킷 크기 검증
        if (courtsPlayers.some(b => b.length !== 4)) {
            const flat = [...selected].sort(() => Math.random() - 0.5);
            courtsPlayers = [];
            for (let i = 0; i < C; i++) courtsPlayers.push(flat.slice(i*4, i*4+4));
        }

        // 현재 점수 계산
        let curScore = 0;
        for (const four of courtsPlayers) {
            curScore += _bestPairingForFour(four, cfg, state).score;
        }
        let bestScore = curScore;
        let bestPlayers = courtsPlayers.map(b => [...b]);

        // 로컬서치: 두 코트 간 선수 스왑
        for (let iter = 0; iter < cfg.heuristic_iters; iter++) {
            // 랜덤 두 코트 선택
            const c1 = Math.floor(Math.random() * C);
            let c2 = Math.floor(Math.random() * (C-1));
            if (c2 >= c1) c2++;
            const i1 = Math.floor(Math.random() * 4);
            const i2 = Math.floor(Math.random() * 4);

            const before1 = [...courtsPlayers[c1]];
            const before2 = [...courtsPlayers[c2]];

            // 스왑
            const tmp = courtsPlayers[c1][i1];
            courtsPlayers[c1][i1] = courtsPlayers[c2][i2];
            courtsPlayers[c2][i2] = tmp;

            const oldSc = _bestPairingForFour(before1, cfg, state).score
                        + _bestPairingForFour(before2, cfg, state).score;
            const newSc = _bestPairingForFour(courtsPlayers[c1], cfg, state).score
                        + _bestPairingForFour(courtsPlayers[c2], cfg, state).score;

            const newTotal = curScore - oldSc + newSc;

            // accept if better, or 2% chance accept worse (escape local minima)
            if (newTotal <= curScore || Math.random() < 0.02) {
                curScore = newTotal;
                if (curScore < bestScore) {
                    bestScore = curScore;
                    bestPlayers = courtsPlayers.map(b => [...b]);
                }
            } else {
                // 되돌리기
                courtsPlayers[c1] = before1;
                courtsPlayers[c2] = before2;
            }
        }

        // 최종 결과
        let finalScore = 0;
        const detail = [];
        for (const four of bestPlayers) {
            const bp = _bestPairingForFour(four, cfg, state);
            finalScore += bp.score;
            detail.push({ four, t1: bp.t1, t2: bp.t2 });
        }
        if (bestGlobal === null || finalScore < bestGlobal.totalScore) {
            bestGlobal = { totalScore: finalScore, courtsDetail: detail };
        }
    }
    return bestGlobal;
}

// ── 선수 선택 (Python _select_players_for_round 이식) ──
function _selectPlayersForRound(players, cfg, state) {
    const slots = 4 * cfg._courts;

    const available = players.filter(p => {
        if (p._startRound && state.roundIdx < p._startRound) return false;
        if (p._endRound != null && state.roundIdx > p._endRound) return false;
        // 최대 게임수 도달 시 제외
        if (p._maxGames > 0 && (state.playedCounts[p.name] || 0) >= p._maxGames) return false;
        return true;
    });

    const canExtra = (name) => (state.remainingGames[name] || 0) > -cfg.max_extra_games;

    const need = available.filter(p => (state.remainingGames[p.name] || 0) > 0);
    const extra = available.filter(p => (state.remainingGames[p.name] || 0) <= 0 && canExtra(p.name));

    const eligible = [...need, ...extra];
    const byName = {};
    eligible.forEach(p => byName[p.name] = p);

    // 경기수 균형 점수: 목표 대비 부족할수록 높은 우선순위
    const balanceScore = (name) => {
        const target = state.targetGames[name] || 0;
        const played = state.playedCounts[name] || 0;
        return target - played; // 클수록 더 뛰어야 함
    };

    const mustPlayNames = new Set();
    state.lastRoundRested.forEach(n => { if (byName[n]) mustPlayNames.add(n); });
    const chosen = [...mustPlayNames].map(n => byName[n]);

    const chosenNames = new Set(chosen.map(p => p.name));

    // 여자복식 보장 (최우선): 여자 4명 이상 가능하고 아직 목표(2회) 미달이면, 최소 4명은 반드시 선택
    const allFemales = eligible.filter(p => p.gender === '여');
    const wdNeeded = allFemales.filter(p => (state.womenDoublesCount && (state.womenDoublesCount[p.name]||0) < 2));
    if (allFemales.length >= 4 && wdNeeded.length > 0) {
        const femaleSorted = [...allFemales]
            .filter(p => !chosenNames.has(p.name))
            .sort((a, b) => {
                const wdA = state.womenDoublesCount ? (state.womenDoublesCount[a.name]||0) : 0;
                const wdB = state.womenDoublesCount ? (state.womenDoublesCount[b.name]||0) : 0;
                return wdA - wdB || balanceScore(b.name) - balanceScore(a.name);
            });
        const neededFemaleCount = Math.max(0, 4 - chosen.filter(p => p.gender === '여').length);
        for (const p of femaleSorted.slice(0, neededFemaleCount)) {
            if (chosen.length < slots && !chosenNames.has(p.name)) {
                chosen.push(p); chosenNames.add(p.name);
            }
        }
    }

    // 통합 정렬: 목표 대비 부족한 순 → 경기수 적은 순 → remaining 큰 순
    const remaining = eligible
        .filter(p => !chosenNames.has(p.name))
        .sort((a, b) => {
            // 1순위: 목표 대비 부족한 정도 (내림차순 = 부족한 사람 먼저)
            const bsDiff = balanceScore(b.name) - balanceScore(a.name);
            if (Math.abs(bsDiff) > 0.5) return bsDiff;
            // 2순위: 현재까지 경기수 (오름차순 = 적게 뛴 사람 먼저)
            const pcDiff = (state.playedCounts[a.name]||0) - (state.playedCounts[b.name]||0);
            if (pcDiff !== 0) return pcDiff;
            // 3순위: remainingGames (내림차순)
            return (state.remainingGames[b.name]||0) - (state.remainingGames[a.name]||0);
        });

    for (const p of remaining) {
        if (chosen.length >= slots) break;
        if (!chosenNames.has(p.name)) { chosen.push(p); chosenNames.add(p.name); }
    }

    return chosen;
}

// ── 라운드 결과 적용 (Python _apply_round_result 이식) ──
function _applyRoundResult(state, courtsDetail, players, cfg) {
    const playedNames = new Set();
    for (const cd of courtsDetail) {
        const fourPlayers = [cd.t1[0], cd.t1[1], cd.t2[0], cd.t2[1]];
        const isAllFemale = fourPlayers.every(p => p.gender === '여');
        for (const p of fourPlayers) {
            playedNames.add(p.name);
            state.remainingGames[p.name] = (state.remainingGames[p.name]||0) - 1;
            state.playedCounts[p.name] = (state.playedCounts[p.name]||0) + 1;
            // 여자복식 카운트 추적
            if (isAllFemale && state.womenDoublesCount) {
                state.womenDoublesCount[p.name] = (state.womenDoublesCount[p.name]||0) + 1;
            }
        }
        const pk1 = _pairKey(cd.t1[0].name, cd.t1[1].name);
        const pk2 = _pairKey(cd.t2[0].name, cd.t2[1].name);
        state.partnerCounts[pk1] = (state.partnerCounts[pk1]||0) + 1;
        state.partnerCounts[pk2] = (state.partnerCounts[pk2]||0) + 1;
        for (const x of cd.t1) for (const y of cd.t2) {
            const ok = _pairKey(x.name, y.name);
            state.opponentCounts[ok] = (state.opponentCounts[ok]||0) + 1;
        }
    }

    const canExtra = (name) => (state.remainingGames[name]||0) > -cfg.max_extra_games;
    const eligibleNames = new Set();
    for (const p of players) {
        if (p._startRound && state.roundIdx < p._startRound) continue;
        if (p._endRound != null && state.roundIdx > p._endRound) continue;
        if ((state.remainingGames[p.name]||0) > 0 || canExtra(p.name)) {
            eligibleNames.add(p.name);
        }
    }
    state.lastRoundRested = new Set([...eligibleNames].filter(n => !playedNames.has(n)));
    state.roundIdx++;
}

// ── 메인 대진 생성 (Python make_schedule 이식) ──
// ── 시간대 슬롯을 라운드 목록으로 펼치기 ──
function _expandTimeSlotsToRounds() {
    const duration = parseInt(document.getElementById('sch-duration').value);
    const rounds = [];
    for (let si = 0; si < timeSlots.length; si++) {
        const slot = timeSlots[si];
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        for (let t = startMin; t + duration <= endMin; t += duration) {
            const ts = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
            const te = `${String(Math.floor((t+duration)/60)).padStart(2,'0')}:${String((t+duration)%60).padStart(2,'0')}`;
            rounds.push({ timeStart: ts, timeEnd: te, courts: slot.courts, slotIndex: si });
        }
    }
    return rounds;
}

// ── 후처리 밸런싱: 코트↔대기 스왑으로 경기수 편차 최소화 ──
function _postBalanceSchedule(schedule, gameCounts, players, cfg) {
    const passes = cfg.balance_post_passes || 3;
    const playerMap = {};
    players.forEach(p => playerMap[p.name] = p);

    // 해당 라운드의 slotIndex에 선수가 가용한지 확인
    function _isAvailableForRound(round, playerName) {
        const si = round.slotIndex !== undefined ? round.slotIndex : -1;
        if (si < 0) return true;
        const p = playerMap[playerName];
        if (!p || !p._availableSlots) return true;
        return p._availableSlots[si] !== false;
    }

    // 여자복식 코트 판별 헬퍼: 해당 코트의 4명이 모두 여자인지 체크
    function _isWomenDoublesCourt(court) {
        const names = [court.a1, court.a2, court.b1, court.b2];
        return names.every(n => playerMap[n] && playerMap[n].gender === '여');
    }

    for (let pass = 0; pass < passes; pass++) {
        let improved = false;
        const counts = { ...gameCounts };
        const vals = Object.values(counts);
        const maxG = Math.max(...vals);
        const minG = Math.min(...vals);
        if (maxG - minG <= 1) break; // 이미 충분히 균등

        for (let ri = 0; ri < schedule.length; ri++) {
            const round = schedule[ri];
            const courtPlayers = [];
            round.courts.forEach((c, ci) => {
                // 여자복식 코트는 스왑 대상에서 제외
                if (_isWomenDoublesCourt(c)) return;
                ['a1','a2','b1','b2'].forEach(pos => {
                    courtPlayers.push({ name: c[pos], ri, ci, pos });
                });
            });
            const waitingNames = round.waiting || [];

            // 경기 많은 코트선수 ↔ 경기 적은 대기선수 스왑 시도
            for (const cp of courtPlayers) {
                for (const wn of waitingNames) {
                    const cpCount = counts[cp.name] || 0;
                    const wnCount = counts[wn] || 0;
                    // 스왑하면 cp -1, wn +1 → 차이가 줄어드는 경우만
                    if (cpCount - wnCount >= 2) {
                        // 슬롯 가용성 체크: 해당 라운드에 참석 불가한 선수는 스왑 대상 제외
                        if (!_isAvailableForRound(round, wn)) continue;

                        // 레벨 차이 체크: 너무 다르면 스킵
                        const cpLevel = playerMap[cp.name] ? playerMap[cp.name].level : 6;
                        const wnLevel = playerMap[wn] ? playerMap[wn].level : 6;
                        if (Math.abs(cpLevel - wnLevel) > 3) continue;

                        // 성별 체크: 스왑으로 인해 혼성 구성이 깨지지 않도록
                        const cpGender = playerMap[cp.name] ? playerMap[cp.name].gender : '남';
                        const wnGender = playerMap[wn] ? playerMap[wn].gender : '남';
                        // 여자를 빼고 남자를 넣으면 여자복식이 깨질 수 있으므로, 같은 성별끼리만 스왑
                        if (cpGender !== wnGender) continue;

                        // 스왑 실행
                        round.courts[cp.ci][cp.pos] = wn;
                        const wIdx = round.waiting.indexOf(wn);
                        if (wIdx >= 0) round.waiting[wIdx] = cp.name;
                        counts[cp.name]--;
                        counts[wn]++;
                        gameCounts[cp.name]--;
                        gameCounts[wn]++;
                        improved = true;
                        break;
                    }
                }
                if (improved) break;
            }
        }
        if (!improved) break;
    }
}

const SCHEDULE_SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5050'
    : '';

async function generateSchedule() {
    const players = getSchSelectedPlayers();
    const date = document.getElementById('sch-date').value || _localDateStr();
    if (players.length < 4) { alert('최소 4명이 필요합니다.'); return; }

    // Python 서버가 켜져 있으면 서버 알고리즘 사용, 아니면 JS 폴백
    try {
        const health = await fetch(SCHEDULE_SERVER_URL + '/api/health', { signal: AbortSignal.timeout(800) });
        if (health.ok) {
            await _generateScheduleFromServer(players, date);
            return;
        }
    } catch(e) { /* 서버 꺼짐 → JS 로직으로 폴백 */ }

    _generateScheduleJS(players, date);
}

async function _generateScheduleFromServer(players, date) {
    const duration = parseInt(document.getElementById('sch-duration').value);
    const useHistory = document.getElementById('sch-use-history').checked;
    const usePartnerHist = useHistory && document.getElementById('sch-hist-partner').checked;
    const useMatchupHist = useHistory && document.getElementById('sch-hist-matchup').checked;

    const body = {
        players: players.map(p => ({
            name: p.name,
            gender: p.gender,
            level: p.level,
            _maxGames: p._maxGames || 0,
            _availableSlots: p._availableSlots || null,
            _startRound: p._startRound || null,
            _endRound: p._endRound || null,
        })),
        timeSlots,
        duration,
        date,
        config: schConfig,
        history: useHistory ? {
            usePartner: usePartnerHist,
            useMatchup: useMatchupHist,
            partnerCounts: usePartnerHist ? _loadHistoryCounts(players).partnerCounts : {},
            opponentCounts: useMatchupHist ? _loadHistoryCounts(players).opponentCounts : {},
            matchups: useMatchupHist ? _loadMatchupData(players) : {},
        } : null,
    };

    const btn = document.getElementById('sch-gen-btn');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳ 생성 중...'; btn.disabled = true; }
    showToast('대진 생성 중...', 'loading');

    try {
        const res = await fetch(SCHEDULE_SERVER_URL + '/api/generate-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) {
            showToast('대진 생성 실패: ' + (result.error || '서버 오류'), 'error', 3000);
            return;
        }

        currentSchedule = {
            date: result.date,
            schedule: result.schedule,
            gameCounts: result.gameCounts,
            players: players,
        };
        _saveScheduleToServer();
        document.getElementById('sch-result').style.display = 'block';
        renderScheduleOutput();
        showToast('대진 생성 완료!', 'success', 2000);
    } catch(e) {
        showToast('서버 연결 실패', 'error', 3000);
    } finally {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
}

function _generateScheduleJS(players, date) {

    const roundDefs = _expandTimeSlotsToRounds();
    if (roundDefs.length === 0) { alert('시간대 설정에서 최소 1라운드가 필요합니다.'); return; }

    // 공정 목표 경기수 계산: 총 슬롯 / 인원수
    const totalSlots = roundDefs.reduce((sum, rd) => sum + rd.courts * 4, 0);
    const numPlayers = players.length;
    const fairTarget = Math.round(totalSlots / numPlayers);
    // 각 플레이어 목표: floor와 ceil을 배분해 총합이 totalSlots에 맞도록
    const baseTarget = Math.floor(totalSlots / numPlayers);
    const extraSlots = totalSlots - baseTarget * numPlayers; // ceil을 받을 인원 수

    // ── 이전 대진 반영 옵션 체크 ──
    const useHistory = document.getElementById('sch-use-history').checked;
    const usePartnerHist = useHistory && document.getElementById('sch-hist-partner').checked;
    const useMatchupHist = useHistory && document.getElementById('sch-hist-matchup').checked;
    const useLevelHist = useHistory && document.getElementById('sch-hist-level').checked;

    // 승률 기반 레벨 보정 (원본 유지를 위해 복사본 사용)
    const playersWork = players.map(p => ({ ...p }));
    if (useLevelHist) {
        _adjustLevelsFromHistory(playersWork);
    }

    const state = {
        remainingGames: {},
        playedCounts: {},
        targetGames: {},
        partnerCounts: {},
        opponentCounts: {},
        matchups: {},
        womenDoublesCount: {},  // 여자복식 경기 수 추적
        lastRoundRested: new Set(),
        roundIdx: 1,
        selectedFemales: playersWork.filter(p => p.gender === '여').length
    };

    // 여자복식 카운트 초기화
    playersWork.filter(p => p.gender === '여').forEach(p => {
        state.womenDoublesCount[p.name] = 0;
    });

    // 이전 파트너/상대 카운트 로드
    if (usePartnerHist) {
        const hist = _loadHistoryCounts(playersWork);
        // 가중치 적용: 이전 기록은 50% 반영 (최근 대진보다 약하게)
        Object.entries(hist.partnerCounts).forEach(([k, v]) => {
            state.partnerCounts[k] = Math.round(v * 0.5);
        });
        Object.entries(hist.opponentCounts).forEach(([k, v]) => {
            state.opponentCounts[k] = Math.round(v * 0.3);
        });
    }

    // 상성 데이터 로드
    if (useMatchupHist) {
        state.matchups = _loadMatchupData(playersWork);
    }

    const totalRounds = roundDefs.length;
    // 시간대별 가용성을 반영한 개인별 목표 경기수 계산
    const playerAvailableRounds = {};
    playersWork.forEach(p => {
        let availRounds = 0;
        roundDefs.forEach(rd => {
            const si = rd.slotIndex !== undefined ? rd.slotIndex : -1;
            const isAvail = si >= 0 ? (p._availableSlots ? p._availableSlots[si] !== false : true) : true;
            if (isAvail) availRounds++;
        });
        playerAvailableRounds[p.name] = availRounds;
    });

    // 개인별 목표: (가용 라운드 / 전체 라운드) × 전체 평균 목표, 최대 게임수 제한 적용
    const shuffled = [...playersWork].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
        const availRatio = totalRounds > 0 ? playerAvailableRounds[p.name] / totalRounds : 1;
        let personalTarget = Math.max(1, Math.round(fairTarget * availRatio));
        if (p._maxGames > 0) personalTarget = Math.min(personalTarget, p._maxGames);
        state.remainingGames[p.name] = personalTarget;
        state.targetGames[p.name] = personalTarget;
        state.playedCounts[p.name] = 0;
    });

    const schedule = [];
    const gameCounts = {};
    playersWork.forEach(p => gameCounts[p.name] = 0);

    for (let r = 0; r < roundDefs.length; r++) {
        const rd = roundDefs[r];
        const courtsNum = rd.courts;
        const cfg = { ...schConfig, _courts: courtsNum };

        // 해당 시간대에 가용한 선수만 필터링
        const slotIdx = rd.slotIndex !== undefined ? rd.slotIndex : -1;
        const availablePlayers = slotIdx >= 0
            ? playersWork.filter(p => p._availableSlots ? p._availableSlots[slotIdx] !== false : true)
            : playersWork;

        const selected = _selectPlayersForRound(availablePlayers, cfg, state);
        if (selected.length < 4) break;

        const usableCourts = Math.min(courtsNum, Math.floor(selected.length / 4));
        if (usableCourts === 0) break;
        cfg._courts = usableCourts;

        // ── 여자복식 코트 선점 (최우선) ──
        let result;
        const wdReserve = usableCourts >= 2
            ? _reserveWomenDoublesCourt(selected.slice(0, cfg._courts * 4), cfg, state)
            : { womenCourt: null, remainingPlayers: selected.slice(0, cfg._courts * 4) };

        if (wdReserve.womenCourt && usableCourts >= 2) {
            // 여자복식 1코트 확정 + 나머지 코트는 일반 알고리즘
            const remainCourts = usableCourts - 1;
            const remainPlayers = wdReserve.remainingPlayers;

            if (remainCourts === 0) {
                // 1코트뿐이면 여자복식만
                result = {
                    totalScore: 0,
                    courtsDetail: [wdReserve.womenCourt]
                };
            } else if (remainPlayers.length >= 4) {
                const remainCfg = { ...cfg, _courts: remainCourts };
                let remainResult;
                if (remainCourts <= 2 && remainPlayers.length <= 12) {
                    remainResult = _exactSearch(remainPlayers.slice(0, remainCourts * 4), remainCfg, state);
                } else {
                    remainResult = _heuristicLocalSearch(remainPlayers.slice(0, remainCourts * 4), remainCfg, state);
                }
                if (remainResult) {
                    result = {
                        totalScore: remainResult.totalScore,
                        courtsDetail: [wdReserve.womenCourt, ...remainResult.courtsDetail]
                    };
                } else {
                    // 나머지 코트 배정 실패 시 여자복식만이라도
                    result = { totalScore: 0, courtsDetail: [wdReserve.womenCourt] };
                }
            } else {
                result = { totalScore: 0, courtsDetail: [wdReserve.womenCourt] };
            }
        } else {
            // 여자복식 불필요 또는 1코트 → 일반 알고리즘
            if (cfg._courts <= 2 && selected.length <= 12) {
                result = _exactSearch(selected.slice(0, cfg._courts * 4), cfg, state);
            } else {
                result = _heuristicLocalSearch(selected.slice(0, cfg._courts * 4), cfg, state);
            }
        }

        if (!result) break;

        const playedThisRound = new Set();
        result.courtsDetail.forEach(cd => {
            [cd.t1[0], cd.t1[1], cd.t2[0], cd.t2[1]].forEach(p => playedThisRound.add(p.name));
        });
        // 대기는 해당 슬롯에 가용한 선수 중 뛰지 않은 선수만 포함
        const waiting = availablePlayers.filter(p => !playedThisRound.has(p.name));

        const courtAssignments = result.courtsDetail.map(cd => ({
            a1: cd.t1[0].name, a2: cd.t1[1].name,
            b1: cd.t2[0].name, b2: cd.t2[1].name
        }));

        result.courtsDetail.forEach(cd => {
            [cd.t1[0], cd.t1[1], cd.t2[0], cd.t2[1]].forEach(p => gameCounts[p.name]++);
        });

        schedule.push({
            round: r + 1,
            timeStart: rd.timeStart,
            timeEnd: rd.timeEnd,
            courts: courtAssignments,
            waiting: waiting.map(p => p.name),
            score: result.totalScore,
            courtCount: usableCourts,
            slotIndex: rd.slotIndex
        });

        _applyRoundResult(state, result.courtsDetail, playersWork, cfg);
    }

    // ── 후처리 밸런싱: 경기수 편차를 줄이는 스왑 ──
    _postBalanceSchedule(schedule, gameCounts, playersWork, schConfig);

    // 레벨 보정 원복 (표시용 players는 원래 레벨 유지)
    if (useLevelHist) {
        playersWork.forEach(p => { if (p._originalLevel !== undefined) p.level = p._originalLevel; });
    }

    currentSchedule = { date, schedule, gameCounts, players: playersWork };
    _saveScheduleToServer();
    document.getElementById('sch-result').style.display = 'block';
    renderScheduleOutput();
}

// ── 설정 적용 버튼 ──
function applyTimeSlotSettings() {
    const rounds = _expandTimeSlotsToRounds();
    const el = document.getElementById('sch-settings-summary');
    const slotSummary = timeSlots.map((s,i) => `${s.start}~${s.end} ${s.courts}면`).join(' → ');
    el.innerHTML = `<span style="color:var(--win-color);font-weight:600;">✓ 적용됨</span> ${slotSummary} (총 ${rounds.length}라운드)`;
    updateSchSelectedCount();
    // 3초 후 체크 표시 제거
    setTimeout(() => {
        el.innerHTML = `${slotSummary} (총 ${rounds.length}라운드)`;
    }, 3000);
}

// ── 대진표 렌더링 (수동 편집 가능) ──
function _makePlayerSelect(roundIdx, courtIdx, pos, currentName) {
    if (!currentSchedule) return '';
    // players가 비어있으면 data.allPlayers 사용
    const playerSource = (currentSchedule.players && currentSchedule.players.length > 0)
        ? currentSchedule.players : data.allPlayers;
    const playerMap = {};
    playerSource.forEach(p => playerMap[p.name] = p);
    const allNames = playerSource.map(p => p.name);
    const opts = allNames.map(n => {
        const g = playerMap[n]?.gender || '남';
        const prefix = g === '여' ? '♀ ' : '';
        return `<option value="${n}" ${n === currentName ? 'selected' : ''}>${prefix}${n}</option>`;
    }).join('');
    const curGender = playerMap[currentName]?.gender || '남';
    const selColor = curGender === '여' ? '#ec4899' : '#3b82f6';
    const selBg = curGender === '여' ? 'rgba(236,72,153,0.08)' : 'rgba(59,130,246,0.08)';
    return `<select onchange="swapSchedulePlayer(${roundIdx},${courtIdx},'${pos}',this.value)"
        style="background:${selBg};color:${selColor};border:1px solid ${selColor}40;border-radius:6px;padding:3px 6px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;max-width:100px;">${opts}</select>`;
}

function _levelSup(name) {
    if (!currentSchedule) return '';
    const playerMap = {};
    currentSchedule.players.forEach(p => playerMap[p.name] = p);
    const p = playerMap[name] || {level:6};
    const c = p.level >= 7 ? 'var(--win-color)' : p.level <= 4 ? 'var(--loss-color)' : 'var(--wr-mid)';
    return `<sup style="color:${c};font-size:10px;">${p.level}</sup>`;
}

function _isPlayerAvailableForRound(playerName, roundIdx) {
    if (!currentSchedule) return true;
    const round = currentSchedule.schedule[roundIdx];
    const si = round.slotIndex;
    if (si == null || si < 0) return true;
    const playerObj = currentSchedule.players.find(p => p.name === playerName);
    if (!playerObj || !playerObj._availableSlots) return true;
    return playerObj._availableSlots[si] !== false;
}

function swapSchedulePlayer(roundIdx, courtIdx, pos, newName) {
    if (!currentSchedule) return;
    const schedule = currentSchedule.schedule;
    const court = schedule[roundIdx].courts[courtIdx];
    const oldName = court[pos];
    if (oldName === newName) return;

    // 시간 슬롯 가용 여부 확인
    if (!_isPlayerAvailableForRound(newName, roundIdx)) {
        const round = schedule[roundIdx];
        const si = round.slotIndex;
        const slotLabel = (window.timeSlots && si != null && timeSlots[si])
            ? `${timeSlots[si].start}~${timeSlots[si].end}`
            : `${round.timeStart}~${round.timeEnd}`;
        alert(`⚠️ ${newName} 님은 ${slotLabel} 시간대에 참여 불가로 설정되어 있어 배치할 수 없습니다.`);
        // select를 원래 값으로 되돌리기
        renderScheduleOutput();
        return;
    }

    // 같은 라운드 내에서 교체 대상 찾기 (다른 코트 또는 대기 중)
    const round = schedule[roundIdx];
    let swapped = false;

    // 같은 라운드의 다른 코트에 newName이 있으면 스왑
    for (let ci = 0; ci < round.courts.length; ci++) {
        const c = round.courts[ci];
        for (const p of ['a1','a2','b1','b2']) {
            if (c[p] === newName) {
                c[p] = oldName;
                court[pos] = newName;
                swapped = true;
                break;
            }
        }
        if (swapped) break;
    }

    // 대기 목록에 있으면 교체
    if (!swapped) {
        const waitIdx = round.waiting.indexOf(newName);
        if (waitIdx !== -1) {
            round.waiting[waitIdx] = oldName;
            court[pos] = newName;
            swapped = true;
        }
    }

    // 어디에도 없으면 단순 교체 (다른 라운드 선수)
    if (!swapped) {
        court[pos] = newName;
    }

    // gameCounts 재계산
    _recalcGameCounts();
    _scheduleSaveDebounced();
    renderScheduleOutput();
}

function _recalcGameCounts() {
    if (!currentSchedule) return;
    const gc = {};
    currentSchedule.players.forEach(p => gc[p.name] = 0);
    currentSchedule.schedule.forEach(round => {
        round.courts.forEach(c => {
            [c.a1, c.a2, c.b1, c.b2].forEach(n => { gc[n] = (gc[n]||0) + 1; });
        });
    });
    currentSchedule.gameCounts = gc;
}

function renderScheduleOutput() {
    if (!currentSchedule) return;
    const {schedule, gameCounts} = currentSchedule;
    // players가 비어있으면 data.allPlayers 사용
    const players = (currentSchedule.players && currentSchedule.players.length > 0)
        ? currentSchedule.players : data.allPlayers;
    const playerMap = {};
    players.forEach(p => playerMap[p.name] = p);

    let html = '';
    schedule.forEach((round, ri) => {
        html += `<div style="margin-bottom:20px;">`;
        html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <span style="background:var(--accent);color:var(--btn-text);padding:4px 14px;border-radius:20px;font-weight:700;font-size:13px;">제 ${round.round}경기</span>
            <span style="color:var(--text-muted);font-size:13px;">${round.timeStart} ~ ${round.timeEnd}</span>
            ${round.courtCount ? `<span style="color:var(--text-dimmed);font-size:11px;">${round.courtCount}면</span>` : ''}
        </div>`;

        round.courts.forEach((court, ci) => {
            const teamALevel = (playerMap[court.a1]?.level||6) + (playerMap[court.a2]?.level||6);
            const teamBLevel = (playerMap[court.b1]?.level||6) + (playerMap[court.b2]?.level||6);
            const diff = Math.abs(teamALevel - teamBLevel);
            const diffColor = diff === 0 ? 'var(--win-color)' : diff <= 2 ? 'var(--wr-mid)' : 'var(--loss-color)';

            // 코트 유형 판별: 여복/남복/혼복
            const courtGenders = [court.a1, court.a2, court.b1, court.b2].map(n => playerMap[n]?.gender || '남');
            const femaleCount = courtGenders.filter(g => g === '여').length;
            let courtTypeLabel = '', courtTypeBorder = 'var(--border-primary)';
            if (femaleCount === 4) { courtTypeLabel = '여복'; courtTypeBorder = '#ec4899'; }
            else if (femaleCount === 0) { courtTypeLabel = '남복'; courtTypeBorder = '#3b82f6'; }
            else { courtTypeLabel = '혼복'; courtTypeBorder = '#a855f7'; }

            html += `<div style="display:grid;grid-template-columns:50px 1fr 30px 44px 1fr;gap:6px;align-items:center;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-left:3px solid ${courtTypeBorder};border-radius:8px;margin-bottom:6px;">
                <span style="color:var(--text-muted);font-size:12px;font-weight:600;">코트${ci+1}<br><span style="color:${courtTypeBorder};font-size:10px;">${courtTypeLabel}</span></span>
                <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
                    ${_makePlayerSelect(ri, ci, 'a1', court.a1)}${_levelSup(court.a1)}
                    <span style="color:var(--text-dimmed);margin:0 2px;">/</span>
                    ${_makePlayerSelect(ri, ci, 'a2', court.a2)}${_levelSup(court.a2)}
                    <span style="color:var(--text-dimmed);font-size:11px;margin-left:2px;">(${teamALevel})</span>
                </div>
                <span style="color:var(--accent-text);font-weight:700;text-align:center;">vs</span>
                <span style="color:${diffColor};font-size:11px;text-align:center;">차이 ${diff}</span>
                <div style="display:flex;align-items:center;gap:4px;">
                    ${_makePlayerSelect(ri, ci, 'b1', court.b1)}${_levelSup(court.b1)}
                    <span style="color:var(--text-dimmed);margin:0 2px;">/</span>
                    ${_makePlayerSelect(ri, ci, 'b2', court.b2)}${_levelSup(court.b2)}
                    <span style="color:var(--text-dimmed);font-size:11px;margin-left:2px;">(${teamBLevel})</span>
                </div>
            </div>`;
        });

        if (round.waiting.length > 0) {
            const waitNames = round.waiting.map(n => {
                const wg = playerMap[n]?.gender || '남';
                const wc = wg === '여' ? '#ec4899' : '#3b82f6';
                return `<span style="color:${wc};font-weight:500;">${n}</span>`;
            }).join(', ');
            html += `<div style="padding:6px 16px;color:var(--text-muted);font-size:13px;">⏸ 대기: ${waitNames}</div>`;
        }
        html += `</div>`;
    });

    // ── 연속 2회 이상 대기 경고 계산 ──
    // gameCounts에 있는 실제 참가자만 체크
    const consecutiveWarnings = [];
    const scheduleParticipants = players.filter(p => gameCounts.hasOwnProperty(p.name));
    scheduleParticipants.forEach(p => {
        let maxConsec = 0;
        let curConsec = 0, curStart = -1;
        let bestStart = -1, bestEnd = -1;
        schedule.forEach((round, ri) => {
            const available = _isPlayerAvailableForRound(p.name, ri);
            if (!available) { curConsec = 0; curStart = -1; return; }
            const playing = round.courts.some(c => [c.a1, c.a2, c.b1, c.b2].includes(p.name));
            if (!playing) {
                if (curConsec === 0) curStart = ri;
                curConsec++;
                if (curConsec >= 2 && curConsec > maxConsec) {
                    maxConsec = curConsec;
                    bestStart = curStart;
                    bestEnd = ri;
                }
            } else {
                curConsec = 0;
                curStart = -1;
            }
        });
        if (maxConsec >= 2) {
            const startTime = schedule[bestStart]?.timeStart || '';
            const endTime = schedule[bestEnd]?.timeEnd || '';
            consecutiveWarnings.push({ name: p.name, maxConsec, startTime, endTime });
        }
    });

    if (consecutiveWarnings.length > 0) {
        const warnItems = consecutiveWarnings
            .sort((a, b) => b.maxConsec - a.maxConsec)
            .map(w => {
                const g = playerMap[w.name]?.gender || '남';
                const c = g === '여' ? '#ec4899' : '#3b82f6';
                const timeRange = w.startTime
                    ? `<span style="color:var(--text-dimmed);font-size:11px;margin-left:2px;">${w.startTime}~${w.endTime}</span>`
                    : '';
                return `<div style="display:flex;align-items:center;gap:4px;">
                    <span style="color:${c};font-weight:700;">${w.name}</span>
                    <span style="color:var(--text-muted);font-size:11px;">(${w.maxConsec}회 연속)</span>
                    ${timeRange}
                </div>`;
            }).join('');
        html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:8px;margin-top:4px;">
            <span style="font-size:16px;flex-shrink:0;">⚠️</span>
            <div>
                <div style="font-weight:700;color:#ef4444;font-size:13px;margin-bottom:4px;">연속 대기 경고</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${warnItems}</div>
            </div>
        </div>`;
    }

    document.getElementById('sch-schedule-output').innerHTML = html;

    // 복식 유형별 카운팅: 남복(남+남), 여복(여+여), 혼복(남+여)
    const typeCounts = {};
    players.forEach(p => typeCounts[p.name] = { total: 0, same: 0, mixed: 0 });
    schedule.forEach(round => {
        round.courts.forEach(c => {
            const names = [c.a1, c.a2, c.b1, c.b2];
            // 팀A: a1+a2, 팀B: b1+b2
            [[c.a1, c.a2], [c.b1, c.b2]].forEach(([p1, p2]) => {
                const g1 = playerMap[p1]?.gender || '남';
                const g2 = playerMap[p2]?.gender || '남';
                const isMixed = g1 !== g2;
                [p1, p2].forEach(n => {
                    if (typeCounts[n]) {
                        typeCounts[n].total++;
                        if (isMixed) typeCounts[n].mixed++;
                        else typeCounts[n].same++;
                    }
                });
            });
        });
    });

    // 대진에 실제 참여한 선수만 표시 (gameCounts에 있는 선수)
    const participantNames = new Set(Object.keys(gameCounts).filter(n => (gameCounts[n]||0) > 0));
    const sortedAll = [...players].filter(p => participantNames.has(p.name));
    // gameCounts에 있지만 players에 없는 경우 보완
    participantNames.forEach(name => {
        if (!sortedAll.find(p => p.name === name)) {
            sortedAll.push(playerMap[name] || { name, gender: '남', level: 6 });
        }
    });
    const sorted = sortedAll.sort((a,b) => (gameCounts[b.name]||0) - (gameCounts[a.name]||0));
    const maxCount = Math.max(...Object.values(gameCounts), 1);
    const countsHtml = sorted.map(p => {
        const count = gameCounts[p.name] || 0;
        const barPct = Math.round(count / maxCount * 100);
        const barColor = count >= maxCount ? 'var(--win-color)' : count === 0 ? 'var(--loss-color)' : 'var(--accent)';
        const tc = typeCounts[p.name] || { same: 0, mixed: 0 };
        const genderIcon = p.gender === '여' ? '♀' : '♂';
        const genderColor = p.gender === '여' ? '#ec4899' : '#3b82f6';
        const sameLabel = p.gender === '여' ? '여복' : '남복';
        return `<div style="padding:5px 0;font-size:12px;border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:${genderColor};font-size:11px;font-weight:700;width:14px;text-align:center;">${genderIcon}</span>
                <span style="min-width:42px;font-weight:600;color:var(--text-primary);white-space:nowrap;">${p.name}</span>
                <div style="flex:1;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                    <div style="width:${barPct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="min-width:20px;text-align:right;font-weight:700;color:${barColor};">${count}</span>
            </div>
            <div style="display:flex;gap:6px;margin-left:20px;margin-top:2px;">
                <span style="font-size:10px;color:var(--text-dimmed);"><span style="color:${genderColor};">${sameLabel}</span> ${tc.same}</span>
                <span style="font-size:10px;color:var(--text-dimmed);"><span style="color:#a855f7;">혼복</span> ${tc.mixed}</span>
            </div>
        </div>`;
    }).join('');
    document.getElementById('sch-game-counts').innerHTML = countsHtml;
}

function copyScheduleToClipboard() {
    if (!currentSchedule) return;
    const {date, schedule} = currentSchedule;
    const d = new Date(date);
    const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    const weekdays = ['일','월','화','수','목','금','토'];
    const dayStr = weekdays[d.getDay()];

    let text = `🎾 인앤아웃 테니스 ${dateStr}(${dayStr})\n\n`;

    schedule.forEach(round => {
        text += `📌 제 ${round.round}경기 (${round.timeStart}~${round.timeEnd})\n`;
        round.courts.forEach((court, ci) => {
            text += `🏸 코트${ci+1}: ${court.a1}/${court.a2} vs ${court.b1}/${court.b2}\n`;
        });
        if (round.waiting.length > 0) {
            text += `⏸ 대기: ${round.waiting.join(', ')}\n`;
        }
        text += '\n';
    });

    navigator.clipboard.writeText(text.trim()).then(() => {
        alert('대진표가 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text.trim();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('대진표가 클립보드에 복사되었습니다!');
    });
}

function printSchedule() {
    if (!currentSchedule) return;
    const {date, schedule, gameCounts, players} = currentSchedule;
    const playerMap = {};
    players.forEach(p => playerMap[p.name] = p);

    const d = new Date(date);
    const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    const weekdays = ['일','월','화','수','목','금','토'];
    const dayStr = weekdays[d.getDay()];

    let roundsHtml = '';
    schedule.forEach(round => {
        let courtsHtml = '';
        round.courts.forEach((court, ci) => {
            const tA = (playerMap[court.a1]?.level||0) + (playerMap[court.a2]?.level||0);
            const tB = (playerMap[court.b1]?.level||0) + (playerMap[court.b2]?.level||0);
            courtsHtml += `
            <tr>
                <td style="text-align:center;font-weight:700;color:#2e7d32;">코트${ci+1}</td>
                <td style="text-align:right;font-weight:600;">${court.a1} / ${court.a2} <span style="color:#888;font-size:11px;">(${tA})</span></td>
                <td style="text-align:center;font-weight:700;color:#2e7d32;">vs</td>
                <td style="font-weight:600;">${court.b1} / ${court.b2} <span style="color:#888;font-size:11px;">(${tB})</span></td>
                <td style="text-align:center;color:#888;">
                    <span style="display:inline-block;width:48px;border-bottom:1px solid #ccc;">&nbsp;</span>
                    :
                    <span style="display:inline-block;width:48px;border-bottom:1px solid #ccc;">&nbsp;</span>
                </td>
            </tr>`;
        });
        const waitHtml = round.waiting.length > 0
            ? `<div style="padding:4px 0 0 70px;color:#888;font-size:12px;">⏸ 대기: ${round.waiting.join(', ')}</div>`
            : '';
        roundsHtml += `
        <div style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                <span style="background:#2e7d32;color:white;padding:3px 12px;border-radius:14px;font-weight:700;font-size:12px;">제 ${round.round}경기</span>
                <span style="color:#666;font-size:13px;">${round.timeStart} ~ ${round.timeEnd}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <tbody>${courtsHtml}</tbody>
            </table>
            ${waitHtml}
        </div>`;
    });

    // 경기수 요약
    const sorted = [...players].sort((a,b) => (gameCounts[b.name]||0) - (gameCounts[a.name]||0));
    let countsHtml = sorted.map(p =>
        `<span style="font-size:11px;">${p.name}(${gameCounts[p.name]||0})</span>`
    ).join(' · ');

    const printHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>인앤아웃 대진표 ${dateStr}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#222; margin:0; padding:20px; }
  table { width:100%; }
  table td { padding:8px 10px; border-bottom:1px solid #e0e0e0; }
  table tr:last-child td { border-bottom:none; }
  @media print { .no-print { display:none; } }
</style>
</head><body>
<div style="text-align:center;margin-bottom:24px;">
    <div style="font-size:11px;letter-spacing:4px;color:#2e7d32;margin-bottom:4px;">IN & OUT TENNIS CLUB</div>
    <div style="font-size:22px;font-weight:800;margin-bottom:2px;">🎾 인앤아웃 대진표</div>
    <div style="font-size:14px;color:#666;">${dateStr} (${dayStr}) · ${players.length}명 참석</div>
</div>
<div style="border-top:2px solid #2e7d32;padding-top:16px;">
    ${roundsHtml}
</div>
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #ddd;">
    <div style="font-size:11px;color:#888;margin-bottom:4px;font-weight:600;">참석자 경기 수</div>
    <div style="line-height:1.8;">${countsHtml}</div>
</div>
<div style="margin-top:24px;text-align:center;color:#aaa;font-size:10px;">인앤아웃 테니스 클럽 · 더블스 분석 앱</div>
<scr` + `ipt>window.onload=function(){window.print();}<\/scr` + `ipt>
</body></html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
}

function sendScheduleToRecorder() {
    if (!currentSchedule) return;
    const {date, schedule} = currentSchedule;

    switchTab(null, 'recorder', true);
    document.getElementById('rec-date').value = date;
    const container = document.getElementById('rec-match-forms');
    container.innerHTML = '';

    schedule.forEach(round => {
        round.courts.forEach(court => {
            addRecordRow(court.a1, court.a2, court.b1, court.b2);
        });
    });
}

function initScheduler() {
    const today = _localDateStr();
    const dateEl = document.getElementById('sch-date');
    if (dateEl) dateEl.value = today;

    data.members.forEach(m => { if (m._selected === undefined) m._selected = false; });
    renderTimeSlots();
    renderSchPlayerList();
}

// ── 참석자 설정 저장/불러오기 ──
function saveSchPreset() {
    const allPlayers = [...data.members];
    const preset = {
        version: 1,
        savedAt: new Date().toISOString(),
        date: document.getElementById('sch-date')?.value || '',
        timeSlots: JSON.parse(JSON.stringify(timeSlots)),
        guests: data.members.filter(m => m.type === '게스트').map(g => ({
            name: g.name, gender: g.gender, level: g.level, type: '게스트'
        })),
        players: allPlayers.map(p => ({
            name: p.name,
            selected: p._selected !== false,
            maxGames: p._maxGames || 0,
            availableSlots: p._availableSlots ? [...p._availableSlots] : null,
            level: p.level,
            gender: p.gender
        }))
    };
    const json = JSON.stringify(preset, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = preset.date || _localDateStr();
    a.href = url; a.download = `참석자설정_${dateStr}.json`; a.click();
    URL.revokeObjectURL(url);
}

function loadSchPreset(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const preset = JSON.parse(e.target.result);
            if (!preset.players || !Array.isArray(preset.players)) {
                alert('올바른 참석자 설정 파일이 아닙니다.'); return;
            }

            // 시간대 설정 복원
            if (preset.timeSlots && Array.isArray(preset.timeSlots)) {
                timeSlots.length = 0;
                preset.timeSlots.forEach(s => timeSlots.push({...s}));
                renderTimeSlots();
            }

            // 날짜 복원
            if (preset.date) {
                const dateEl = document.getElementById('sch-date');
                if (dateEl) dateEl.value = preset.date;
            }

            // 게스트 복원
            if (preset.guests && Array.isArray(preset.guests)) {
                preset.guests.forEach(pg => {
                    if (!data.members.some(m => m.name === pg.name)) {
                        data.members.push({
                            name: pg.name, gender: pg.gender || '남',
                            level: pg.level || 6, type: pg.type || '게스트',
                            _selected: false
                        });
                    }
                });
            }

            // 선수 설정 복원
            const presetMap = {};
            preset.players.forEach(p => presetMap[p.name] = p);

            const allPlayers = [...data.members];
            allPlayers.forEach(p => {
                const saved = presetMap[p.name];
                if (saved) {
                    p._selected = saved.selected;
                    p._maxGames = saved.maxGames || 0;
                    if (saved.availableSlots) p._availableSlots = [...saved.availableSlots];
                    if (saved.level !== undefined) p.level = saved.level;
                } else {
                    p._selected = false;
                }
            });

            renderSchPlayerList();
            updateSchSelectedCount();

            const loadedCount = preset.players.filter(p => p.selected).length;
            const guestCount = (preset.guests || []).length;
            alert(`설정을 불러왔습니다.\n선택 ${loadedCount}명` + (guestCount > 0 ? ` (게스트 ${guestCount}명 포함)` : ''));
        } catch (err) {
            alert('파일 읽기 오류: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// ═══════════════════════════════════════════════
// Match Recorder (경기 기록)
// ═══════════════════════════════════════════════
let recRowId = 0;

function addRecordRow(a1, a2, b1, b2) {
    const container = document.getElementById('rec-match-forms');
    const id = recRowId++;
    const allNames = [...new Set([...data.members.map(m=>m.name), ...data.allPlayers.map(p=>p.name)])];
    const options = allNames.map(n => `<option value="${n}">${n}</option>`).join('');

    const selectStyle = 'background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:8px;padding:8px;font-size:13px;font-family:inherit;width:100%;';
    const inputStyle = 'background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:8px;padding:8px;font-size:13px;font-family:inherit;width:60px;text-align:center;';

    const div = document.createElement('div');
    div.id = `rec-row-${id}`;
    div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto 40px auto 1fr 1fr auto;gap:6px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-subtle);';
    div.innerHTML = `
        <select class="rec-a1" style="${selectStyle}">${options}</select>
        <select class="rec-a2" style="${selectStyle}">${options}</select>
        <input type="number" class="rec-ls" min="0" max="9" placeholder="0" style="${inputStyle}">
        <span style="text-align:center;color:var(--accent-text);font-weight:700;">vs</span>
        <input type="number" class="rec-rs" min="0" max="9" placeholder="0" style="${inputStyle}">
        <select class="rec-b1" style="${selectStyle}">${options}</select>
        <select class="rec-b2" style="${selectStyle}">${options}</select>
        <button onclick="this.parentElement.remove()" style="background:none;border:1px solid var(--border-secondary);color:var(--loss-color);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;">✕</button>
    `;

    if (a1) { div.querySelector('.rec-a1').value = a1; }
    if (a2) { div.querySelector('.rec-a2').value = a2; }
    if (b1) { div.querySelector('.rec-b1').value = b1; }
    if (b2) { div.querySelector('.rec-b2').value = b2; }

    container.appendChild(div);
}

async function saveAllRecords() {
    const date = document.getElementById('rec-date').value;
    if (!date) { alert('날짜를 입력하세요.'); return; }

    const rows = document.querySelectorAll('[id^="rec-row-"]');
    let saved = 0;
    const newMatches = [];

    rows.forEach(row => {
        const a1 = row.querySelector('.rec-a1').value;
        const a2 = row.querySelector('.rec-a2').value;
        const b1 = row.querySelector('.rec-b1').value;
        const b2 = row.querySelector('.rec-b2').value;
        const ls = parseInt(row.querySelector('.rec-ls').value);
        const rs = parseInt(row.querySelector('.rec-rs').value);

        if (!a1 || !a2 || !b1 || !b2 || isNaN(ls) || isNaN(rs)) return;
        if (a1===a2 || b1===b2 || [a1,a2].some(x=>[b1,b2].includes(x))) return;

        const match = {d: date, a1, a2, b1, b2, ls, rs};
        data.matches.push(match);
        newMatches.push(match);
        saved++;
    });

    if (saved > 0) {
        matches = JSON.parse(JSON.stringify(data.matches));
        recalculate();
        document.getElementById('rec-match-forms').innerHTML = '';
        renderRecordHistory();

        // DB 저장 — 각 경기 개별 추가
        let dbSaved = 0;
        for (const m of newMatches) {
            try {
                const res = await fetch(`${SCHEDULE_SERVER}/api/matches/add`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(m)
                });
                if (res.ok) {
                    const r = await res.json();
                    m.id = r.id; // ID 저장
                    dbSaved++;
                }
            } catch(e) { console.warn('[DB] 경기 추가 실패:', e.message); }
        }
        alert(`${saved}경기가 저장되었습니다.${dbSaved > 0 ? ' (DB 저장 완료)' : ''}`);
    } else {
        alert('저장할 경기가 없습니다. 모든 필드를 입력해주세요.');
    }
}

function renderRecordHistory() {
    const container = document.getElementById('rec-history');
    const filterEl = document.getElementById('rec-date-filter');
    const prevVal = filterEl.value || 'all';

    // 날짜 목록 갱신
    const dates = [...new Set(data.matches.map(m => m.d))].sort().reverse();
    filterEl.innerHTML = '<option value="all">전체 날짜</option>' + dates.map(d => `<option value="${d}">${d}</option>`).join('');
    // 이전 선택값이 옵션에 있으면 복원, 없으면 'all'
    filterEl.value = dates.includes(prevVal) ? prevVal : 'all';

    const filterDate = filterEl.value;
    const filtered = filterDate === 'all' ? [...data.matches] : data.matches.filter(m => m.d === filterDate);
    const sorted = [...filtered].sort((a, b) => b.d.localeCompare(a.d));

    const grouped = {};
    sorted.forEach(m => {
        if (!grouped[m.d]) grouped[m.d] = [];
        grouped[m.d].push(m);
    });

    let html = '';
    Object.entries(grouped).forEach(([date, games]) => {
        html += `<div style="margin-bottom:20px;">`;
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 0;border-bottom:1px solid var(--border-primary);">
            <span style="font-weight:700;color:var(--accent-text);font-size:14px;">${date}</span>
            <span style="color:var(--text-muted);font-size:12px;">(${games.length}경기)</span>
        </div>`;

        games.forEach((m, idx) => {
            const matchIdx = data.matches.indexOf(m);
            const result = m.ls > m.rs ? 'win' : (m.ls === m.rs ? 'draw' : 'loss');
            const resultClass = result === 'win' ? 'match-win' : (result === 'draw' ? 'match-draw' : 'match-loss');

            html += `<div id="rec-match-${matchIdx}" style="display:grid;grid-template-columns:1fr auto 40px auto 1fr 60px;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border-subtle);font-size:13px;">
                <div style="text-align:right;"><strong>${m.a1}</strong> / ${m.a2}</div>
                <span class="match-score ${resultClass}" style="padding:3px 10px;border-radius:4px;font-size:13px;">${m.ls}</span>
                <span style="text-align:center;color:var(--text-dimmed);">vs</span>
                <span class="match-score ${m.rs > m.ls ? 'match-win' : (m.rs === m.ls ? 'match-draw' : 'match-loss')}" style="padding:3px 10px;border-radius:4px;font-size:13px;">${m.rs}</span>
                <div><strong>${m.b1}</strong> / ${m.b2}</div>
                <div style="display:flex;gap:4px;">
                    <button onclick="editRecord(${matchIdx})" style="background:none;border:1px solid var(--border-secondary);color:var(--wr-mid);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">수정</button>
                    <button onclick="deleteRecord(${matchIdx})" style="background:none;border:1px solid var(--border-secondary);color:var(--loss-color);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    });

    container.innerHTML = html || '<p style="color:var(--text-dimmed);text-align:center;padding:20px;">경기 기록이 없습니다.</p>';
    document.getElementById('rec-stats').textContent = `총 ${data.matches.length}경기`;
}

function editRecord(idx) {
    const m = data.matches[idx];
    if (!m) return;

    const el = document.getElementById(`rec-match-${idx}`);
    if (!el) return;

    const allNames = [...new Set([...data.members.map(m=>m.name), ...data.allPlayers.map(p=>p.name)])];
    const opts = (selected) => allNames.map(n => `<option value="${n}" ${n===selected?'selected':''}>${n}</option>`).join('');
    const style = 'background:var(--input-bg);color:var(--input-color);border:1px solid var(--border-secondary);border-radius:6px;padding:4px;font-size:12px;font-family:inherit;';

    el.innerHTML = `
        <div style="display:flex;gap:4px;justify-content:flex-end;">
            <select class="edit-a1" style="${style}">${opts(m.a1)}</select>
            <select class="edit-a2" style="${style}">${opts(m.a2)}</select>
        </div>
        <input type="number" class="edit-ls" value="${m.ls}" min="0" max="9" style="${style}width:40px;text-align:center;">
        <span style="text-align:center;color:var(--text-dimmed);">vs</span>
        <input type="number" class="edit-rs" value="${m.rs}" min="0" max="9" style="${style}width:40px;text-align:center;">
        <div style="display:flex;gap:4px;">
            <select class="edit-b1" style="${style}">${opts(m.b1)}</select>
            <select class="edit-b2" style="${style}">${opts(m.b2)}</select>
        </div>
        <div style="display:flex;gap:4px;">
            <button onclick="saveEdit(${idx})" style="background:var(--accent);color:var(--btn-text);border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;font-weight:600;">저장</button>
            <button onclick="renderRecordHistory()" style="background:none;border:1px solid var(--border-secondary);color:var(--text-muted);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">취소</button>
        </div>
    `;
}

async function pushMatchesToGSheet() {
    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    const btn = document.getElementById('gsheet-push-btn');
    const status = document.getElementById('gsheet-push-status');

    if (!scriptUrl) {
        alert('구글시트 Apps Script URL이 설정되지 않았습니다.\n상단 설정(⚙️) 버튼에서 연동 설정을 먼저 해주세요.');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ 반영 중...';
    status.style.display = 'inline';
    status.style.color = 'var(--text-muted)';
    status.textContent = '';

    try {
        const res = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'overwriteMatches', matches: data.matches })
        });
        // no-cors라 응답 확인 불가 → 성공으로 간주
        btn.textContent = '✅ 반영 완료';
        btn.style.color = '#4ade80';
        status.style.color = '#4ade80';
        status.textContent = `${data.matches.length}경기 전송됨`;
        _saveMatchesToLocal();
    } catch (e) {
        btn.textContent = '❌ 반영 실패';
        btn.style.color = '#f87171';
        status.style.color = '#f87171';
        status.textContent = e.message;
    }

    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '☁️ 구글시트 반영';
        btn.style.color = '#4ade80';
        status.style.display = 'none';
    }, 3000);
}

const INOUT_MATCHES_KEY = 'inout_edited_matches';

function _saveMatchesToLocal() {
    try {
        localStorage.setItem(INOUT_MATCHES_KEY, JSON.stringify(data.matches));
    } catch(e) {
        console.warn('[Local] 저장 실패:', e.message);
    }
}

// 회원 전체를 DB에 저장
async function syncMembersToGSheet() {
    try {
        await fetch(`${SCHEDULE_SERVER}/api/members`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ members: data.members })
        });
    } catch(e) { console.warn('[DB] 회원 저장 실패:', e.message); }
}

async function autoSyncMembers() {
    await syncMembersToGSheet();
}

async function _syncAllMatchesToGSheet(label) {
    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (!scriptUrl) return;
    try {
        await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'overwriteMatches', matches: data.matches })
        });
        console.log(`[GSheet] ${label} 동기화 완료`);
    } catch (e) {
        console.warn('[GSheet] 동기화 실패:', e.message);
    }
}

function saveEdit(idx) {
    const el = document.getElementById(`rec-match-${idx}`);
    const m = data.matches[idx];
    m.a1 = el.querySelector('.edit-a1').value;
    m.a2 = el.querySelector('.edit-a2').value;
    m.b1 = el.querySelector('.edit-b1').value;
    m.b2 = el.querySelector('.edit-b2').value;
    m.ls = parseInt(el.querySelector('.edit-ls').value);
    m.rs = parseInt(el.querySelector('.edit-rs').value);
    matches = JSON.parse(JSON.stringify(data.matches));
    recalculate();
    renderRecordHistory();
    // DB 수정
    if (m.id) {
        fetch(`${SCHEDULE_SERVER}/api/matches/${m.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(m)
        }).catch(e => console.warn('[DB] 경기 수정 실패:', e.message));
    }
}

function deleteRecord(idx) {
    if (!confirm('이 경기 기록을 삭제하시겠습니까?')) return;
    const m = data.matches[idx];
    data.matches.splice(idx, 1);
    matches = JSON.parse(JSON.stringify(data.matches));
    recalculate();
    renderRecordHistory();
    // DB 삭제
    if (m.id) {
        fetch(`${SCHEDULE_SERVER}/api/matches/${m.id}`, {
            method: 'DELETE'
        }).catch(e => console.warn('[DB] 경기 삭제 실패:', e.message));
    }
}

function downloadMatchData(format) {
    if (data.matches.length === 0) { alert('저장할 경기 기록이 없습니다.'); return; }
    const dateStr = _localDateStr();

    if (format === 'json') {
        const json = JSON.stringify(data.matches, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `인앤아웃_경기기록_${dateStr}.json`; a.click();
        URL.revokeObjectURL(url);
    } else if (format === 'xlsx') {
        const ensureXLSX = (cb) => {
            if (typeof XLSX !== 'undefined') return cb();
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            s.onload = cb;
            s.onerror = () => alert('엑셀 라이브러리 로드 실패');
            document.head.appendChild(s);
        };
        ensureXLSX(() => {
            const rows = [['날짜', 'A팀1', 'A팀2', 'A점수', 'B점수', 'B팀1', 'B팀2']];
            data.matches.forEach(m => {
                rows.push([m.d, m.a1, m.a2, m.ls, m.rs, m.b1, m.b2]);
            });
            const ws = XLSX.utils.aoa_to_sheet(rows);
            // 열 너비 설정
            ws['!cols'] = [{wch:12},{wch:10},{wch:10},{wch:6},{wch:6},{wch:10},{wch:10}];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '경기기록');
            XLSX.writeFile(wb, `인앤아웃_경기기록_${dateStr}.xlsx`);
        });
    }
}

function importMatchData(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = ''; // reset for re-upload

    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) { alert('올바른 경기 기록 JSON 형식이 아닙니다.'); return; }
                _mergeImportedMatches(imported, file.name);
            } catch (err) { alert('JSON 파싱 오류: ' + err.message); }
        };
        reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx')) {
        const ensureXLSX = (cb) => {
            if (typeof XLSX !== 'undefined') return cb();
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            s.onload = cb;
            s.onerror = () => alert('엑셀 라이브러리 로드 실패');
            document.head.appendChild(s);
        };
        reader.onload = (e) => {
            ensureXLSX(() => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const sheetName = wb.SheetNames.find(n => n === '경기기록') || wb.SheetNames[0];
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
                    if (rows.length < 2) { alert('데이터가 비어있습니다.'); return; }

                    // 헤더 자동 감지: 날짜,A팀1,A팀2,A점수,B점수,B팀1,B팀2 형식
                    const header = rows[0].map(h => String(h || '').trim());
                    let colMap = { d: 0, a1: 1, a2: 2, ls: 3, rs: 4, b1: 5, b2: 6 };

                    // 헤더명으로 매핑 시도
                    const hIdx = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));
                    const iDate = hIdx(['날짜','Date','date']);
                    if (iDate >= 0) {
                        colMap.d = iDate;
                        const iA1 = hIdx(['A팀1','A1','팀A1']); if (iA1>=0) colMap.a1 = iA1;
                        const iA2 = hIdx(['A팀2','A2','팀A2']); if (iA2>=0) colMap.a2 = iA2;
                        const iLS = hIdx(['A점수','점수A','LS','ScoreA']); if (iLS>=0) colMap.ls = iLS;
                        const iRS = hIdx(['B점수','점수B','RS','ScoreB']); if (iRS>=0) colMap.rs = iRS;
                        const iB1 = hIdx(['B팀1','B1','팀B1']); if (iB1>=0) colMap.b1 = iB1;
                        const iB2 = hIdx(['B팀2','B2','팀B2']); if (iB2>=0) colMap.b2 = iB2;
                    }

                    const imported = [];
                    for (let i = 1; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || !r[colMap.d]) continue;
                        let dateVal = r[colMap.d];
                        // 날짜 형식 처리
                        if (dateVal instanceof Date) {
                            dateVal = dateVal.toISOString().split('T')[0];
                        } else if (typeof dateVal === 'number') {
                            // Excel serial date
                            const d = new Date((dateVal - 25569) * 86400000);
                            dateVal = d.toISOString().split('T')[0];
                        } else {
                            dateVal = String(dateVal).trim();
                        }
                        const a1 = String(r[colMap.a1] || '').trim();
                        const a2 = String(r[colMap.a2] || '').trim();
                        const b1 = String(r[colMap.b1] || '').trim();
                        const b2 = String(r[colMap.b2] || '').trim();
                        const ls = parseInt(r[colMap.ls]) || 0;
                        const rs = parseInt(r[colMap.rs]) || 0;
                        if (a1 && a2 && b1 && b2) {
                            imported.push({ d: dateVal, a1, a2, ls, rs, b1, b2 });
                        }
                    }
                    _mergeImportedMatches(imported, file.name);
                } catch (err) { alert('엑셀 파싱 오류: ' + err.message); }
            });
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert('.xlsx 또는 .json 파일만 지원합니다.');
    }
}

function _mergeImportedMatches(imported, fileName) {
    if (imported.length === 0) { alert('불러올 경기 기록이 없습니다.'); return; }

    // 중복 제거: 같은 날짜+선수 조합 제거
    const existKey = new Set(data.matches.map(m => `${m.d}|${[m.a1,m.a2,m.b1,m.b2].sort().join('|')}|${m.ls}|${m.rs}`));
    const newMatches = imported.filter(m => {
        const key = `${m.d}|${[m.a1,m.a2,m.b1,m.b2].sort().join('|')}|${m.ls}|${m.rs}`;
        return !existKey.has(key);
    });

    if (newMatches.length === 0) {
        alert(`${fileName}에서 ${imported.length}경기를 읽었으나, 모두 이미 존재하는 기록입니다.`);
        return;
    }

    const msg = newMatches.length === imported.length
        ? `${fileName}에서 ${newMatches.length}경기를 불러옵니다.\n기존 ${data.matches.length}경기에 추가됩니다.`
        : `${fileName}에서 ${imported.length}경기 중 ${newMatches.length}경기가 새 기록입니다. (${imported.length - newMatches.length}경기 중복 제외)\n기존 ${data.matches.length}경기에 추가됩니다.`;

    if (!confirm(msg + '\n\n진행하시겠습니까?')) return;

    data.matches.push(...newMatches);
    matches = JSON.parse(JSON.stringify(data.matches));
    recalculate();
    renderRecordHistory();

    // Google Sheets 자동 저장
    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (scriptUrl) {
        sendMatchesToGSheet(newMatches).then(result => {
            if (result.ok) {
                alert(`${newMatches.length}경기가 추가되었습니다. (총 ${data.matches.length}경기, 구글 시트에도 기록됨)`);
            } else {
                alert(`${newMatches.length}경기가 로컬에 추가되었습니다. (총 ${data.matches.length}경기)\n구글 시트 저장은 실패했습니다.`);
            }
        });
    } else {
        alert(`${newMatches.length}경기가 추가되었습니다. (총 ${data.matches.length}경기)`);
    }
}

function initRecorder() {
    const today = _localDateStr();
    document.getElementById('rec-date').value = today;
    renderRecordHistory();
}

// ═══════════════════════════════════════════════════════
// Today's Match-up 탭
// ═══════════════════════════════════════════════════════

// 저장된 코트 상태 추적: "R{ri}_C{ci}" → match object
const _tmuSavedMap = {};

function initTodayMatchup() {
    const today = _localDateStr();
    const inp = document.getElementById('tmu-date-input');
    if (inp) inp.value = today;
    tmuRefreshSchedule(today);
}

function tmuChangeDate(date) {
    const today = _localDateStr();
    const todayBtn = document.getElementById('tmu-today-btn');
    if (todayBtn) todayBtn.style.display = date !== today ? 'inline-block' : 'none';
    tmuRefreshSchedule(date);
}

function tmuGoToday() {
    const today = _localDateStr();
    const inp = document.getElementById('tmu-date-input');
    if (inp) inp.value = today;
    document.getElementById('tmu-today-btn').style.display = 'none';
    tmuRefreshSchedule(today);
}

async function tmuRefreshSchedule(targetDate) {
    const today = _localDateStr();
    const date = targetDate || document.getElementById('tmu-date-input')?.value || today;
    const isToday = date === today;

    const dateObj = new Date(date + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
    document.getElementById('tmu-date-label').textContent = dateLabel + (isToday ? ' · 인앤아웃 테니스' : '');

    document.getElementById('tmu-loading').style.display = 'block';
    document.getElementById('tmu-empty').style.display = 'none';
    document.getElementById('tmu-rounds-container').innerHTML = '';
    document.getElementById('tmu-saved-section').style.display = 'none';
    document.getElementById('tmu-status-badge').textContent = '';

    // 캐시 활용: 같은 날짜 대진이 이미 로드된 경우
    if (window.currentSchedule && window.currentSchedule.date === date) {
        document.getElementById('tmu-loading').style.display = 'none';
        _tmuRender(date);
        return;
    }

    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/schedules/${date}`);
        if (!resp.ok) throw new Error('not found');
        const result = await resp.json();
        window.currentSchedule = result;
        document.getElementById('tmu-loading').style.display = 'none';
        _tmuRender(date);
    } catch (e) {
        document.getElementById('tmu-loading').style.display = 'none';
        document.getElementById('tmu-empty').style.display = 'block';
        const emptyMsg = document.getElementById('tmu-empty-msg');
        if (emptyMsg) emptyMsg.textContent = isToday ? '오늘 날짜의 대진표가 없습니다.' : '해당 날짜의 대진표가 없습니다.';
        const badge = document.getElementById('tmu-status-badge');
        badge.textContent = '대진 없음';
        badge.className = 'tmu-status-badge-none';
    }
}

function _tmuRender(today) {
    const badge = document.getElementById('tmu-status-badge');
    badge.textContent = '✅ 대진 있음';
    badge.className = 'tmu-status-badge-ok';

    const container = document.getElementById('tmu-rounds-container');
    const schedule = window.currentSchedule.schedule || [];

    // 저장 맵 초기화 후 오늘 날짜 matches와 대조
    Object.keys(_tmuSavedMap).forEach(k => delete _tmuSavedMap[k]);
    const todayMatches = (data.matches || []).filter(m => m.d === today);
    schedule.forEach((round, ri) => {
        (round.courts || []).forEach((court, ci) => {
            const fourSorted = [court.a1, court.a2, court.b1, court.b2].sort().join('|');
            const found = todayMatches.find(m =>
                [m.a1, m.a2, m.b1, m.b2].sort().join('|') === fourSorted
            );
            if (found) _tmuSavedMap[`R${ri}_C${ci}`] = found;
        });
    });

    container.innerHTML = schedule.map((round, ri) => _tmuRenderRound(round, ri, today)).join('');
    _tmuUpdateProgress(schedule);
    tmuRenderSavedMatches(today);
}

function _tmuRenderRound(round, ri, today) {
    const courts = round.courts || [];
    const waiting = round.waiting || [];
    const savedCount = courts.filter((_, ci) => _tmuSavedMap[`R${ri}_C${ci}`]).length;

    const dots = courts.map((_, ci) =>
        `<div class="tmu-dot${_tmuSavedMap[`R${ri}_C${ci}`] ? ' saved' : ''}"></div>`
    ).join('');

    const waitingHeaderBadge = waiting.length > 0
        ? `<span class="tmu-waiting-header-badge">⏸ ${waiting.join(' · ')}</span>`
        : '';

    const courtsHtml = courts.map((court, ci) => _tmuRenderCourt(court, ri, ci, today)).join('');

    const waitingHtml = waiting.length > 0
        ? `<div class="tmu-waiting">
            <span class="tmu-waiting-label">⏸ 대기</span>
            ${waiting.map(w => `<span class="tmu-waiting-chip">${w}</span>`).join('')}
           </div>`
        : '';

    return `
    <div class="tmu-round" id="tmu-round-${ri}">
        <div class="tmu-round-header" onclick="tmuToggleRound(${ri})">
            <div class="tmu-round-header-left">
                <span class="tmu-round-badge">제 ${round.round}경기</span>
                <span class="tmu-round-time">${round.timeStart} ~ ${round.timeEnd}</span>
                <span class="tmu-round-courts-count">${courts.length}면</span>
                <div class="tmu-round-progress">${dots}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                ${waitingHeaderBadge}
                <span class="tmu-round-toggle">▾</span>
            </div>
        </div>
        <div class="tmu-round-body" id="tmu-round-body-${ri}">
            ${courtsHtml}
            ${waitingHtml}
        </div>
    </div>`;
}

function _tmuRenderCourt(court, ri, ci, today) {
    const players = window.currentSchedule.players || [];
    const pMap = {};
    players.forEach(p => { pMap[p.name] = p; });

    // 코트 유형 판별
    const genders = [court.a1, court.a2, court.b1, court.b2].map(n => (pMap[n] || {}).gender);
    const femaleCount = genders.filter(g => g === '여').length;
    let courtTypeClass = 'mixed', courtTypeLabel = '혼복';
    if (femaleCount === 0) { courtTypeClass = 'male';   courtTypeLabel = '남복'; }
    if (femaleCount === 4) { courtTypeClass = 'female'; courtTypeLabel = '여복'; }

    function playerHtml(name, isRight) {
        const g = (pMap[name] || {}).gender;
        const dotClass = g === '여' ? 'f' : 'm';
        const dot = `<span class="tmu-gender-dot ${dotClass}"></span>`;
        return `<div class="tmu-player">${isRight ? name + dot : dot + name}</div>`;
    }

    const saved = _tmuSavedMap[`R${ri}_C${ci}`];

    const headerBadge = saved ? `<span class="tmu-saved-badge">✅ 저장됨</span>` : '';

    let bodyHtml;
    if (saved) {
        const ls = saved.ls, rs = saved.rs;
        const lClass = ls >= rs ? 'win' : 'loss';
        const rClass = rs >= ls ? 'win' : 'loss';
        bodyHtml = `
        <div class="tmu-match-row">
            <div class="tmu-team">
                ${playerHtml(court.a1, false)}${playerHtml(court.a2, false)}
            </div>
            <div class="tmu-score-section">
                <div class="tmu-saved-result">
                    <span class="tmu-saved-score ${lClass}">${ls}</span>
                    <span class="tmu-saved-score-sep">:</span>
                    <span class="tmu-saved-score ${rClass}">${rs}</span>
                </div>
            </div>
            <div class="tmu-team right">
                ${playerHtml(court.b1, true)}${playerHtml(court.b2, true)}
            </div>
        </div>
        <button class="tmu-edit-btn" onclick="tmuEditCourt(${ri},${ci},'${today}')">✏️ 수정하기</button>`;
    } else {
        bodyHtml = `
        <div class="tmu-match-row">
            <div class="tmu-team">
                ${playerHtml(court.a1, false)}${playerHtml(court.a2, false)}
            </div>
            <div class="tmu-score-section">
                <div class="tmu-score-inputs">
                    <div class="tmu-score-box">
                        <input type="number" class="tmu-score-input" id="tmu-ls-${ri}-${ci}"
                               value="0" min="0" max="9" inputmode="numeric" pattern="[0-9]*">
                        <div class="tmu-score-btns">
                            <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-ls-${ri}-${ci}',-1)">−</button>
                            <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-ls-${ri}-${ci}',+1)">+</button>
                        </div>
                    </div>
                    <span class="tmu-vs">vs</span>
                    <div class="tmu-score-box">
                        <input type="number" class="tmu-score-input" id="tmu-rs-${ri}-${ci}"
                               value="0" min="0" max="9" inputmode="numeric" pattern="[0-9]*">
                        <div class="tmu-score-btns">
                            <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-rs-${ri}-${ci}',-1)">−</button>
                            <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-rs-${ri}-${ci}',+1)">+</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tmu-team right">
                ${playerHtml(court.b1, true)}${playerHtml(court.b2, true)}
            </div>
        </div>
        <button class="tmu-save-btn" id="tmu-savebtn-${ri}-${ci}"
                onclick="tmuSaveCourtScore(${ri},${ci},'${court.a1}','${court.a2}','${court.b1}','${court.b2}','${today}')">
            💾 이 경기 저장
        </button>`;
    }

    return `
    <div class="tmu-court-card${saved ? ' tmu-saved' : ''}" id="tmu-court-${ri}-${ci}">
        <div class="tmu-court-card-header">
            <div class="tmu-court-label">
                <span class="tmu-court-num">코트 ${ci + 1}</span>
                <span class="tmu-court-type ${courtTypeClass}">${courtTypeLabel}</span>
            </div>
            ${headerBadge}
        </div>
        ${bodyHtml}
    </div>`;
}

function tmuChangeScore(inputId, delta) {
    const el = document.getElementById(inputId);
    if (!el) return;
    let val = parseInt(el.value || 0) + delta;
    if (val < 0) val = 0;
    if (val > 9) val = 9;
    el.value = val;
}

async function tmuSaveCourtScore(ri, ci, a1, a2, b1, b2, date) {
    const lsEl = document.getElementById(`tmu-ls-${ri}-${ci}`);
    const rsEl = document.getElementById(`tmu-rs-${ri}-${ci}`);
    if (!lsEl || !rsEl) return;

    const ls = parseInt(lsEl.value);
    const rs = parseInt(rsEl.value);

    if (isNaN(ls) || isNaN(rs)) {
        alert('스코어를 입력해주세요.');
        return;
    }

    const btn = document.getElementById(`tmu-savebtn-${ri}-${ci}`);
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    const matchObj = { d: date, a1, a2, b1, b2, ls, rs };
    const result = await _saveOneMatch(matchObj);

    if (result.ok) {
        _tmuSavedMap[`R${ri}_C${ci}`] = result.match;
        // 카드를 저장됨 상태로 재렌더링
        const card = document.getElementById(`tmu-court-${ri}-${ci}`);
        if (card) {
            const ls2 = result.match.ls, rs2 = result.match.rs;
            const lClass = ls2 >= rs2 ? 'win' : 'loss';
            const rClass = rs2 >= ls2 ? 'win' : 'loss';
            card.classList.add('tmu-saved');
            card.querySelector('.tmu-court-card-header').insertAdjacentHTML('beforeend',
                `<span class="tmu-saved-badge">✅ 저장됨</span>`);
            card.querySelector('.tmu-score-section').outerHTML = `
                <div class="tmu-score-section">
                    <div class="tmu-saved-result">
                        <span class="tmu-saved-score ${lClass}">${ls2}</span>
                        <span class="tmu-saved-score-sep">:</span>
                        <span class="tmu-saved-score ${rClass}">${rs2}</span>
                    </div>
                </div>`;
            if (btn) btn.outerHTML =
                `<button class="tmu-edit-btn" onclick="tmuEditCourt(${ri},${ci},'${date}')">✏️ 수정하기</button>`;
        }
        // 라운드 헤더 점 업데이트
        const schedule = window.currentSchedule.schedule || [];
        const dots = document.querySelectorAll(`#tmu-round-${ri} .tmu-round-progress .tmu-dot`);
        if (dots[ci]) dots[ci].classList.add('saved');
        _tmuUpdateProgress(schedule);
        tmuRenderSavedMatches(date);
    } else {
        if (btn) { btn.disabled = false; btn.textContent = '💾 이 경기 저장'; }
        alert('저장 실패: ' + (result.reason || '알 수 없는 오류'));
    }
}

function tmuEditCourt(ri, ci, date) {
    const schedule = window.currentSchedule && window.currentSchedule.schedule;
    if (!schedule) return;
    const court = schedule[ri].courts[ci];
    delete _tmuSavedMap[`R${ri}_C${ci}`];

    const card = document.getElementById(`tmu-court-${ri}-${ci}`);
    if (!card) return;
    card.classList.remove('tmu-saved');
    // 헤더 배지 제거
    const savedBadge = card.querySelector('.tmu-saved-badge');
    if (savedBadge) savedBadge.remove();

    // 저장됨 결과 영역 → 입력 폼으로 교체
    const existing = _tmuSavedMap[`R${ri}_C${ci}_prev`] || {};
    const prevLs = existing.ls ?? 0;
    const prevRs = existing.rs ?? 0;

    // 저장됨 뷰 → 입력 뷰로 통째로 교체
    const bodyContent = card.querySelector('.tmu-match-row');
    if (bodyContent) {
        const scoreSection = card.querySelector('.tmu-score-section');
        if (scoreSection) {
            scoreSection.innerHTML = `
            <div class="tmu-score-inputs">
                <div class="tmu-score-box">
                    <input type="number" class="tmu-score-input" id="tmu-ls-${ri}-${ci}"
                           value="${prevLs}" min="0" max="9" inputmode="numeric" pattern="[0-9]*">
                    <div class="tmu-score-btns">
                        <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-ls-${ri}-${ci}',-1)">−</button>
                        <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-ls-${ri}-${ci}',+1)">+</button>
                    </div>
                </div>
                <span class="tmu-vs">vs</span>
                <div class="tmu-score-box">
                    <input type="number" class="tmu-score-input" id="tmu-rs-${ri}-${ci}"
                           value="${prevRs}" min="0" max="9" inputmode="numeric" pattern="[0-9]*">
                    <div class="tmu-score-btns">
                        <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-rs-${ri}-${ci}',-1)">−</button>
                        <button class="tmu-score-btn" onclick="tmuChangeScore('tmu-rs-${ri}-${ci}',+1)">+</button>
                    </div>
                </div>
            </div>`;
        }
    }
    const editBtn = card.querySelector('.tmu-edit-btn');
    if (editBtn) editBtn.outerHTML =
        `<button class="tmu-save-btn" id="tmu-savebtn-${ri}-${ci}"
            onclick="tmuSaveCourtScore(${ri},${ci},'${court.a1}','${court.a2}','${court.b1}','${court.b2}','${date}')">
            💾 이 경기 저장
        </button>`;
}

async function _saveOneMatch(matchObj) {
    const { d, a1, a2, b1, b2, ls, rs } = matchObj;
    if (!a1 || !a2 || !b1 || !b2 || isNaN(ls) || isNaN(rs)) {
        return { ok: false, reason: '필드 누락' };
    }
    if (a1 === a2 || b1 === b2 || [a1, a2].some(x => [b1, b2].includes(x))) {
        return { ok: false, reason: '선수 중복' };
    }

    // 이미 같은 경기가 저장된 경우 → 수정
    const existKey = `${d}|${[a1, a2, b1, b2].sort().join('|')}`;
    const existIdx = data.matches.findIndex(m =>
        `${m.d}|${[m.a1, m.a2, m.b1, m.b2].sort().join('|')}` === existKey
    );

    if (existIdx >= 0) {
        // 수정
        const existing = data.matches[existIdx];
        existing.ls = ls; existing.rs = rs;
        matches = JSON.parse(JSON.stringify(data.matches));
        recalculate();
        renderRecordHistory();
        if (existing.id) {
            try {
                await fetch(`${SCHEDULE_SERVER}/api/matches/${existing.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(existing)
                });
            } catch (e) { console.warn('[TMU] DB 수정 실패', e); }
        }
        return { ok: true, match: existing };
    }

    // 신규 저장
    data.matches.push(matchObj);
    matches = JSON.parse(JSON.stringify(data.matches));
    recalculate();
    renderRecordHistory();

    try {
        const res = await fetch(`${SCHEDULE_SERVER}/api/matches/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(matchObj)
        });
        if (res.ok) {
            const r = await res.json();
            matchObj.id = r.id;
        }
    } catch (e) { console.warn('[TMU] DB 저장 실패', e); }

    // GSheet 동기화 (연동된 경우)
    try {
        const scriptUrl = localStorage.getItem('inout_gsheet_script_url');
        if (scriptUrl) sendMatchesToGSheet([matchObj]);
    } catch (e) { /* 무시 */ }

    return { ok: true, match: matchObj };
}

function tmuRenderSavedMatches(today) {
    const todayMatches = (data.matches || []).filter(m => m.d === today);
    const section = document.getElementById('tmu-saved-section');
    const list = document.getElementById('tmu-saved-list');
    const countEl = document.getElementById('tmu-saved-count');

    if (!todayMatches.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    countEl.textContent = `${todayMatches.length}경기`;
    list.innerHTML = todayMatches.map(m => `
        <div class="tmu-saved-game">
            <div class="tmu-saved-game-teams">
                <div class="tmu-saved-game-a">${m.a1} · ${m.a2}</div>
                <div class="tmu-saved-game-b">vs ${m.b1} · ${m.b2}</div>
            </div>
            <div class="tmu-saved-game-score">${m.ls} : ${m.rs}</div>
        </div>`).join('');
}

function _tmuUpdateProgress(schedule) {
    const total = schedule.reduce((s, r) => s + (r.courts || []).length, 0);
    const saved = Object.keys(_tmuSavedMap).length;
    const bar = document.getElementById('tmu-progress-bar');
    const fill = document.getElementById('tmu-progress-fill');
    const label = document.getElementById('tmu-progress-label');
    if (!bar) return;
    bar.style.display = total > 0 ? 'block' : 'none';
    fill.style.width = total > 0 ? `${Math.round(saved / total * 100)}%` : '0%';
    label.textContent = total > 0 ? `저장됨 ${saved} / ${total}경기` : '';
}

function tmuToggleRound(ri) {
    const el = document.getElementById(`tmu-round-${ri}`);
    if (el) el.classList.toggle('tmu-collapsed');
}

function tmuGoToScheduler() {
    switchTab(null, 'scheduler', true);
}

// PDF Report Generation — Minimal Gold Style
async function captureHtmlToImage(htmlStr, width) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;`;
    wrap.innerHTML = htmlStr;
    document.body.appendChild(wrap);
    await new Promise(r => setTimeout(r, 80));
    const canvas = await html2canvas(wrap, { backgroundColor: '#0a0a0a', scale: 2, logging: false });
    document.body.removeChild(wrap);
    return canvas;
}

async function addImageToPdf(pdf, canvas, margin, currentY, contentW, pageH) {
    const imgW = contentW;
    const imgH = (canvas.height / canvas.width) * imgW;
    if (currentY + imgH > pageH - margin - 12) {
        pdf.addPage();
        pdf.setFillColor(11, 26, 16);
        pdf.rect(0, 0, 210, pageH, 'F');
        currentY = margin;
    }
    let finalH = imgH, finalW = imgW;
    if (imgH > pageH - margin * 2) {
        finalH = pageH - margin * 2;
        finalW = (canvas.width / canvas.height) * finalH;
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, currentY, finalW, finalH);
    return currentY + finalH + 6;
}

async function generatePDF() {
    const btn = document.getElementById('pdf-download-btn');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">⏳ PDF 생성 중...</span>';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = 210, pageH = 297, margin = 16;
        const contentW = pageW - margin * 2;
        const pxWidth = 760;

        const now = new Date();
        const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
        const totalMatches = data.matches.length;
        const memberCount = memberMode === 'members' ? data.members.length : data.allPlayers.length;
        const modeLabel = memberMode === 'members' ? '회원' : '전체 참여자';

        // ============================================
        // PAGE 1: Cover — Minimal Gold
        // ============================================
        const coverHtml = `
        <div style="background:#0b1a10;min-height:760px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 50px;position:relative;">
            <div style="width:100%;max-width:500px;">
                <!-- Top gold line -->
                <div style="width:100%;height:1px;background:#4caf50;margin-bottom:50px;"></div>

                <!-- Club English name -->
                <div style="font-size:12px;color:#4caf50;letter-spacing:8px;text-transform:uppercase;margin-bottom:24px;">IN & OUT TENNIS CLUB</div>

                <!-- Main title -->
                <div style="font-size:36px;font-weight:800;color:#ffffff;margin-bottom:8px;">인앤아웃 테니스 클럽</div>

                <!-- Subtitle -->
                <div style="font-size:16px;color:#999;margin-bottom:40px;">더블스 경기 분석 리포트</div>

                <!-- Gold divider dot -->
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:40px;">
                    <div style="width:60px;height:1px;background:rgba(76,175,80,0.4);"></div>
                    <div style="width:6px;height:6px;border-radius:50%;background:#4caf50;"></div>
                    <div style="width:60px;height:1px;background:rgba(76,175,80,0.4);"></div>
                </div>

                <!-- Stats summary -->
                <div style="display:flex;justify-content:center;gap:40px;margin-bottom:40px;">
                    <div style="text-align:center;">
                        <div style="font-size:28px;font-weight:800;color:#4caf50;">${totalMatches}</div>
                        <div style="font-size:10px;color:#666;letter-spacing:2px;margin-top:4px;">MATCHES</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:28px;font-weight:800;color:#4caf50;">${memberCount}</div>
                        <div style="font-size:10px;color:#666;letter-spacing:2px;margin-top:4px;">PLAYERS</div>
                    </div>
                </div>

                <!-- Date & mode -->
                <div style="font-size:12px;color:#666;">${dateStr}</div>
                <div style="font-size:11px;color:#555;margin-top:6px;">${modeLabel} ${memberCount}명 기준 분석</div>

                <!-- Bottom gold line -->
                <div style="width:100%;height:1px;background:#4caf50;margin-top:50px;"></div>
            </div>
        </div>`;
        const coverCanvas = await captureHtmlToImage(coverHtml, pxWidth);
        const coverH = (coverCanvas.height / coverCanvas.width) * contentW;
        pdf.setFillColor(11, 26, 16);
        pdf.rect(0, 0, pageW, pageH, 'F');
        pdf.addImage(coverCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, (pageH - coverH) / 2, contentW, coverH);

        // ============================================
        // CONTENT SECTIONS
        // ============================================
        const sections = [
            { id: 'summary', num: '01', title: '회원 요약', desc: '전체 회원 경기 성적 총괄' },
            { id: 'mvp', num: '02', title: 'MVP 랭킹', desc: '종합 점수 기반 MVP 순위' },
            { id: 'opponents', num: '03', title: '상대 전적', desc: '선수 간 맞대결 히트맵' },
            { id: 'deep', num: '04', title: '심층 분석', desc: '클러치·연승·참여도 분석' }
        ];

        const allTabs = document.querySelectorAll('.tab-content');
        const origDisplay = [];
        allTabs.forEach(t => { origDisplay.push(t.style.display); t.style.display = 'none'; });

        for (const section of sections) {
            const el = document.getElementById(section.id);
            if (!el) continue;
            el.style.display = 'block';
            el.classList.add('active');
            await new Promise(r => setTimeout(r, 300));

            const cards = el.querySelectorAll('.card');
            if (cards.length === 0) { el.style.display = 'none'; el.classList.remove('active'); continue; }

            pdf.addPage();
            let currentY = margin;
            pdf.setFillColor(11, 26, 16);
            pdf.rect(0, 0, pageW, pageH, 'F');

            // Section header — Minimal Gold style with numbering
            const headerHtml = `
            <div style="background:#0b1a10;padding:14px 0 18px;">
                <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:10px;">
                    <span style="font-size:42px;font-weight:200;color:rgba(76,175,80,0.3);letter-spacing:2px;">${section.num}</span>
                    <span style="font-size:22px;color:#4caf50;letter-spacing:3px;text-transform:uppercase;font-weight:700;">${section.title}</span>
                </div>
                <div style="height:1px;background:linear-gradient(90deg,#4caf50 30%,rgba(76,175,80,0.1));"></div>
                <div style="font-size:12px;color:#555;margin-top:9px;">${section.desc}</div>
            </div>`;
            const headerCanvas = await captureHtmlToImage(headerHtml, pxWidth);
            const headerH = (headerCanvas.height / headerCanvas.width) * contentW;
            pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, currentY, contentW, headerH);
            currentY += headerH + 5;

            // Capture each card
            for (const card of cards) {
                try {
                    const canvas = await html2canvas(card, {
                        backgroundColor: '#0a0a0a', scale: 2, useCORS: true, logging: false,
                        width: card.scrollWidth, height: card.scrollHeight
                    });
                    currentY = await addImageToPdf(pdf, canvas, margin, currentY, contentW, pageH);
                } catch (e) { console.warn('Card capture failed:', e); }
            }

            el.style.display = 'none';
            el.classList.remove('active');
        }

        // Restore tabs
        allTabs.forEach((t, i) => { t.style.display = origDisplay[i]; });
        const activeBtn = document.querySelector('.tab-button.active');
        if (activeBtn) activeBtn.click();

        // ============================================
        // FOOTER on every content page
        // ============================================
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 2; i <= totalPages; i++) {
            pdf.setPage(i);
            const footerHtml = `
            <div style="background:#0b1a10;padding:6px 0;display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:16px;height:1px;background:#4caf50;"></div>
                    <span style="font-size:9px;color:#555;letter-spacing:1px;">IN&OUT TENNIS CLUB</span>
                </div>
                <span style="font-size:9px;color:#444;">${dateStr}  ·  ${i} / ${totalPages}</span>
            </div>`;
            const fCanvas = await captureHtmlToImage(footerHtml, pxWidth);
            const fH = (fCanvas.height / fCanvas.width) * contentW;
            pdf.addImage(fCanvas.toDataURL('image/png'), 'PNG', margin, pageH - margin - fH, contentW, fH);
        }

        pdf.save(`인앤아웃_분석리포트_${dateStr.replace(/\./g, '')}.pdf`);

    } catch (err) {
        console.error('PDF generation error:', err);
        alert('PDF 생성에 실패했습니다. 인터넷 연결을 확인해주세요.\n(html2canvas, jsPDF CDN 필요)');
    } finally {
        btn.innerHTML = origHTML;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load: ' + url));
        document.head.appendChild(s);
    });
}

// Floating tooltip system (avoids overflow clipping)
(function() {
    let floatingTip = null;
    document.addEventListener('mouseover', function(e) {
        const icon = e.target.closest('.tip-icon[data-tip]');
        if (!icon) return;
        if (floatingTip) floatingTip.remove();
        floatingTip = document.createElement('div');
        floatingTip.className = 'floating-tip';
        floatingTip.textContent = icon.getAttribute('data-tip');
        document.body.appendChild(floatingTip);
        const rect = icon.getBoundingClientRect();
        let top = rect.top - floatingTip.offsetHeight - 10;
        let left = rect.left + rect.width / 2 - floatingTip.offsetWidth / 2;
        if (top < 5) { top = rect.bottom + 10; floatingTip.style.cssText += ';'; floatingTip.querySelector('::after') }
        if (left < 5) left = 5;
        if (left + floatingTip.offsetWidth > window.innerWidth - 5) left = window.innerWidth - floatingTip.offsetWidth - 5;
        floatingTip.style.top = top + 'px';
        floatingTip.style.left = left + 'px';
    });
    document.addEventListener('mouseout', function(e) {
        const icon = e.target.closest('.tip-icon[data-tip]');
        if (!icon) return;
        if (floatingTip) { floatingTip.remove(); floatingTip = null; }
    });
})();

// ===== 회원 관리 =====
function initMemberManager() {
    renderMemberList();
}

function renderMemberList() {
    const search = (document.getElementById('mem-search').value || '').trim().toLowerCase();
    const filterType = document.getElementById('mem-filter-type').value;
    const filterGender = document.getElementById('mem-filter-gender').value;

    let list = [...data.members];
    if (search) list = list.filter(m => m.name.toLowerCase().includes(search));
    if (filterType !== 'all') list = list.filter(m => m.type === filterType);
    if (filterGender !== 'all') list = list.filter(m => m.gender === filterGender);

    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    function makeRows(group) {
        return group.map((m, i) => {
            const genderBadge = m.gender === '남'
                ? '<span style="background:var(--gender-m-bg);color:var(--gender-m-color);padding:2px 6px;border-radius:8px;font-size:11px;">남</span>'
                : '<span style="background:var(--gender-f-bg);color:var(--gender-f-color);padding:2px 6px;border-radius:8px;font-size:11px;">여</span>';
            return `<tr>
                <td style="color:var(--text-dimmed);">${i+1}</td>
                <td style="font-weight:600;">${m.name}</td>
                <td>${genderBadge}</td>
                <td>${m.level}</td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button onclick="editMember('${m.name}')" style="background:rgba(102,187,106,0.15);color:var(--accent-text);border:1px solid rgba(102,187,106,0.3);padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;">수정</button>
                        <select onchange="changeMemberType('${m.name}',this.value);this.selectedIndex=0;" style="background:var(--input-bg);color:var(--text-secondary);border:1px solid var(--border-secondary);border-radius:6px;padding:3px 4px;font-size:11px;cursor:pointer;">
                            <option value="">유형▾</option>
                            <option value="회원"${m.type==='회원'?' disabled':''}>→ 회원</option>
                            <option value="비회원"${m.type==='비회원'?' disabled':''}>→ 비회원</option>
                            <option value="게스트"${m.type==='게스트'?' disabled':''}>→ 게스트</option>
                        </select>
                        <button onclick="deleteMember('${m.name}')" style="background:rgba(248,113,113,0.15);color:var(--loss-color);border:1px solid rgba(248,113,113,0.3);padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;">삭제</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    const tbody = document.getElementById('mem-table-body');

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">검색 결과가 없습니다</td></tr>';
    } else {
        const memberGroup    = list.filter(m => m.type === '회원');
        const nonMemberGroup = list.filter(m => m.type === '비회원');
        const guestGroup     = list.filter(m => m.type === '게스트');

        let html = '';

        const sectionHeader = (label, color, count) =>
            `<tr><td colspan="5" style="background:${color};padding:6px 12px;font-weight:700;font-size:12px;color:#fff;letter-spacing:1px;">${label} (${count}명)</td></tr>`;

        if (memberGroup.length > 0) {
            html += sectionHeader('🟢 회원', '#2d6a4f', memberGroup.length);
            html += makeRows(memberGroup);
        }
        if (nonMemberGroup.length > 0) {
            html += sectionHeader('⚪ 비회원', '#4a4a6a', nonMemberGroup.length);
            html += makeRows(nonMemberGroup);
        }
        if (guestGroup.length > 0) {
            html += sectionHeader('🔴 게스트', '#7a3030', guestGroup.length);
            html += makeRows(guestGroup);
        }
        tbody.innerHTML = html;
    }

    // 통계
    const total = data.members.length;
    const members = data.members.filter(m => m.type === '회원').length;
    const nonMembers = data.members.filter(m => m.type === '비회원').length;
    const guests = data.members.filter(m => m.type === '게스트').length;
    const males = data.members.filter(m => m.gender === '남').length;
    const females = data.members.filter(m => m.gender === '여').length;
    document.getElementById('mem-stats').innerHTML =
        `전체 <b>${total}명</b> (회원 ${members} / 비회원 ${nonMembers} / 게스트 ${guests}) · 남 ${males} / 여 ${females}` +
        (list.length !== total ? ` · <span style="color:var(--accent-text);">필터 결과: ${list.length}명</span>` : '');
}

function saveMember() {
    const originalName = document.getElementById('mem-edit-original-name').value;
    const name = document.getElementById('mem-name').value.trim();
    const gender = document.getElementById('mem-gender').value;
    const level = Math.max(1, Math.min(10, parseInt(document.getElementById('mem-level').value) || 6));
    const type = document.getElementById('mem-type').value;

    if (!name) { alert('이름을 입력하세요.'); return; }

    if (originalName) {
        // 수정 모드
        const idx = data.members.findIndex(m => m.name === originalName);
        if (idx === -1) { alert('회원을 찾을 수 없습니다.'); return; }
        // 이름 변경 시 중복 체크
        if (name !== originalName && data.members.some(m => m.name === name)) {
            alert('이미 같은 이름이 있습니다.'); return;
        }
        // 경기 기록의 이름도 업데이트
        if (name !== originalName) {
            data.matches.forEach(match => {
                if (match.a1 === originalName) match.a1 = name;
                if (match.a2 === originalName) match.a2 = name;
                if (match.b1 === originalName) match.b1 = name;
                if (match.b2 === originalName) match.b2 = name;
            });
            // allPlayers도 업데이트
            const ap = data.allPlayers.find(p => p.name === originalName);
            if (ap) ap.name = name;
        }
        data.members[idx] = { name, gender, level, type };
        const ap = data.allPlayers.find(p => p.name === name);
        if (ap) { ap.gender = gender; ap.level = level; ap.type = type; }
    } else {
        // 추가 모드
        if (data.members.some(m => m.name === name)) {
            alert('이미 같은 이름이 있습니다.'); return;
        }
        data.members.push({ name, gender, level, type });
        // allPlayers에도 추가
        if (!data.allPlayers.find(p => p.name === name)) {
            data.allPlayers.push({ name, gender, level, type });
            data.allPlayers.sort((a,b) => a.name.localeCompare(b.name,'ko'));
        }
    }

    cancelMemberEdit();
    renderMemberList();
    // 다른 UI도 갱신
    initializeDropdowns();
    applyFilter();
    renderDataStats();
    if (typeof renderSchPlayerList === 'function') renderSchPlayerList();
    // Google Sheets 자동 동기화
    autoSyncMembers();
}

function editMember(name) {
    const m = data.members.find(p => p.name === name);
    if (!m) return;
    document.getElementById('mem-edit-original-name').value = name;
    document.getElementById('mem-name').value = m.name;
    document.getElementById('mem-gender').value = m.gender;
    document.getElementById('mem-level').value = m.level;
    document.getElementById('mem-type').value = m.type;
    document.getElementById('mem-form-title').textContent = `"${name}" 수정`;
    document.getElementById('mem-save-btn').textContent = '수정 저장';
    document.getElementById('mem-cancel-btn').style.display = '';
    // 폼으로 스크롤
    document.getElementById('mem-form-title').scrollIntoView({ behavior:'smooth', block:'center' });
}

function cancelMemberEdit() {
    document.getElementById('mem-edit-original-name').value = '';
    document.getElementById('mem-name').value = '';
    document.getElementById('mem-gender').value = '남';
    document.getElementById('mem-level').value = '6';
    document.getElementById('mem-type').value = '회원';
    document.getElementById('mem-form-title').textContent = '회원 추가';
    document.getElementById('mem-save-btn').textContent = '추가';
    document.getElementById('mem-cancel-btn').style.display = 'none';
}

function changeMemberType(name, newType) {
    if (!newType) return;
    const m = data.members.find(p => p.name === name);
    if (!m) return;
    m.type = newType;
    const ap = data.allPlayers.find(p => p.name === name);
    if (ap) ap.type = newType;
    renderMemberList();
    applyFilter();
    renderDataStats();
    if (typeof renderSchPlayerList === 'function') renderSchPlayerList();
    autoSyncMembers();
}

function deleteMember(name) {
    if (!confirm(`"${name}" 님을 삭제하시겠습니까?\n\n삭제해도 기존 경기 기록은 유지됩니다.`)) return;
    const idx = data.members.findIndex(m => m.name === name);
    if (idx === -1) return;
    data.members.splice(idx, 1);
    const apIdx = data.allPlayers.findIndex(p => p.name === name);
    if (apIdx >= 0) data.allPlayers.splice(apIdx, 1);
    renderMemberList();
    initializeDropdowns();
    applyFilter();
    renderDataStats();
    if (typeof renderSchPlayerList === 'function') renderSchPlayerList();
    autoSyncMembers();
}

// 로컬 회원 변경분 백업 (Google Sheets 동기화 실패 시 영속성 보장)
function _saveLocalMemberEdits() {
    try {
        const members = data.members.map(m => ({
            name: m.name, gender: m.gender, level: m.level, type: m.type
        }));
        localStorage.setItem('inout_local_member_edits', JSON.stringify(members));
    } catch (e) { console.warn('[회원관리] 로컬 백업 실패:', e); }
}

function _getLocalMemberEdits() {
    try {
        const raw = localStorage.getItem('inout_local_member_edits');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

// Google Sheets 자동 동기화 (변경 시 자동 push + 로컬 백업)
async function autoSyncMembers() {
    // 항상 로컬 백업 먼저 저장 (새로고침 시 유실 방지)
    _saveLocalMemberEdits();

    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (!scriptUrl) {
        console.log('[회원관리] Apps Script URL 미설정 → 로컬에만 저장됨');
        return;
    }
    try {
        await syncMembersToGSheet();
        // 동기화 성공 시 로컬 백업 클리어
        localStorage.removeItem('inout_local_member_edits');
        console.log('[회원관리] Google Sheets 동기화 완료');
    } catch (e) {
        console.warn('[회원관리] 동기화 실패 (로컬 백업 유지):', e.message);
    }
}

// DB에 회원 목록 전체 저장
async function saveMembersToDB() {
    const btn = document.getElementById('mem-save-db-btn');
    const status = document.getElementById('mem-save-db-status');
    btn.disabled = true;
    btn.textContent = '⏳ 저장 중...';
    status.style.display = 'inline';
    status.style.color = 'var(--text-muted)';
    status.textContent = '';
    try {
        const resp = await fetch(`${SCHEDULE_SERVER}/api/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members: data.members })
        });
        if (resp.ok) {
            const r = await resp.json();
            btn.textContent = '✅ 저장 완료';
            status.style.color = '#4ade80';
            status.textContent = `${r.count}명`;
        } else {
            throw new Error(`서버 오류 ${resp.status}`);
        }
    } catch(e) {
        btn.textContent = '❌ 저장 실패';
        status.style.color = '#f87171';
        status.textContent = e.message;
    }
    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '💾 DB 저장';
        status.style.display = 'none';
    }, 3000);
}

// ===== Google Sheets 연동 =====
// 기본 구글 시트 (pub URL 키) — 누구나 열면 자동으로 최신 데이터 로드
const DEFAULT_GSHEET_PUB_KEY = '2PACX-1vR7FsLhoDZXwPIZ1tBshx4ySIv_RIkhR08s6iuA6SrpRt1aIHTcN5N4IyM1cxgXQ84IjaekM9MVO1im';

const GSHEET_STORAGE_KEY = 'inout_gsheet_id';
const GSHEET_LAST_SYNC_KEY = 'inout_gsheet_last_sync';
const GSHEET_SCRIPT_KEY = 'inout_gsheet_script_url';

// 시트 ID 추출: 일반 URL과 게시 URL 모두 지원
let _gsheetPubKey = null; // 게시 URL의 경우 /d/e/KEY 형태 저장

function extractSheetId(urlOrId) {
    if (!urlOrId) return null;
    _gsheetPubKey = null;
    // 게시 URL: /d/e/2PACX-.../pubhtml
    const pubMatch = urlOrId.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
    if (pubMatch) {
        _gsheetPubKey = pubMatch[1];
        return _gsheetPubKey;
    }
    // 일반 URL: /d/SHEET_ID/edit
    const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // 순수 ID 입력
    if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId.trim())) return urlOrId.trim();
    return null;
}

function getGSheetCsvUrl(sheetId, gid) {
    // 게시 URL 키인 경우 /d/e/KEY 형식 사용
    const path = _gsheetPubKey ? `d/e/${sheetId}` : `d/${sheetId}`;
    const base = `https://docs.google.com/spreadsheets/${path}/pub?output=csv`;
    return gid !== undefined ? base + `&gid=${gid}` : base;
}

function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { current += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { row.push(current.trim()); current = ''; }
            else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
                row.push(current.trim()); current = '';
                if (row.some(c => c !== '')) rows.push(row);
                row = [];
                if (ch === '\r') i++;
            } else { current += ch; }
        }
    }
    if (current || row.length) { row.push(current.trim()); if (row.some(c => c !== '')) rows.push(row); }
    return rows;
}

function parseMatchesFromCSV(csvText) {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return [];
    // 헤더 자동 감지
    const header = rows[0].map(h => h.replace(/"/g, '').trim());
    const colMap = {};
    const aliases = {
        '날짜': 'd', 'date': 'd', '일자': 'd',
        'a팀1': 'a1', 'a1': 'a1', '팀a1': 'a1',
        'a팀2': 'a2', 'a2': 'a2', '팀a2': 'a2',
        'a점수': 'ls', 'a스코어': 'ls', 'a_score': 'ls',
        'b점수': 'rs', 'b스코어': 'rs', 'b_score': 'rs',
        'b팀1': 'b1', 'b1': 'b1', '팀b1': 'b1',
        'b팀2': 'b2', 'b2': 'b2', '팀b2': 'b2'
    };
    header.forEach((h, i) => {
        const key = aliases[h.toLowerCase()];
        if (key) colMap[key] = i;
    });
    // 필수 컬럼 확인
    if (!('d' in colMap) || !('a1' in colMap)) {
        // 위치 기반 fallback: 날짜, A팀1, A팀2, A점수, B점수, B팀1, B팀2
        if (header.length >= 7) {
            colMap.d = 0; colMap.a1 = 1; colMap.a2 = 2;
            colMap.ls = 3; colMap.rs = 4; colMap.b1 = 5; colMap.b2 = 6;
        } else return [];
    }
    const matches = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[colMap.d] || !r[colMap.a1]) continue;
        let dateVal = r[colMap.d];
        // 날짜 형식 정리
        if (/^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}/.test(dateVal)) {
            dateVal = dateVal.replace(/\.\s?/g, '-').replace(/-$/, '');
        }
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateVal)) {
            const parts = dateVal.split('-');
            dateVal = parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
        }
        matches.push({
            d: dateVal,
            a1: r[colMap.a1], a2: r[colMap.a2],
            ls: parseInt(r[colMap.ls]) || 0, rs: parseInt(r[colMap.rs]) || 0,
            b1: r[colMap.b1], b2: r[colMap.b2]
        });
    }
    return matches;
}

function parseMembersFromCSV(csvText) {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return null;
    const header = rows[0].map(h => h.replace(/"/g, '').trim().toLowerCase());
    const colMap = {};
    const aliases = {
        '이름': 'name', 'name': 'name', '선수': 'name',
        '성별': 'gender', 'gender': 'gender',
        '레벨': 'level', 'level': 'level', '수준': 'level',
        '유형': 'type', 'type': 'type', '구분': 'type'
    };
    header.forEach((h, i) => {
        const key = aliases[h];
        if (key) colMap[key] = i;
    });
    if (!('name' in colMap)) return null;
    const members = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[colMap.name]) continue;
        members.push({
            name: r[colMap.name],
            gender: (colMap.gender !== undefined ? r[colMap.gender] : '남') || '남',
            level: colMap.level !== undefined ? (parseInt(r[colMap.level]) || 6) : 6,
            type: (colMap.type !== undefined ? r[colMap.type] : '비회원') || '비회원'
        });
    }
    return members.length > 0 ? members : null;
}

async function fetchGSheetData(sheetId) {
    const result = { matches: null, members: null, error: null };

    // 경기기록과 회원목록을 독립적으로 병렬 요청
    const [matchResult, memberResult] = await Promise.allSettled([
        // 경기기록 (gid=0)
        (async () => {
            const url = getGSheetCsvUrl(sheetId, 0);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`경기기록 시트 접근 실패 (${resp.status})`);
            const csv = await resp.text();
            const parsed = parseMatchesFromCSV(csv);
            if (!parsed || parsed.length === 0) throw new Error('경기기록 파싱 실패');
            return parsed;
        })(),
        // 회원목록 — 실제 gid 먼저, 그 다음 순서대로 시도
        (async () => {
            const memberGids = [1279258323, 1, 2, 3];
            for (const gid of memberGids) {
                try {
                    const url = getGSheetCsvUrl(sheetId, gid);
                    const resp = await fetch(url);
                    if (!resp.ok) continue;
                    const csv = await resp.text();
                    const parsed = parseMembersFromCSV(csv);
                    if (parsed && parsed.length > 0) return parsed;
                } catch (e) { continue; }
            }
            return null;
        })()
    ]);

    if (matchResult.status === 'fulfilled') {
        result.matches = matchResult.value;
    } else {
        result.error = matchResult.reason?.message || '경기기록 로드 실패';
    }

    if (memberResult.status === 'fulfilled' && memberResult.value) {
        result.members = memberResult.value;
    }

    return result;
}

function applyGSheetData(result) {
    if (result.matches && result.matches.length > 0) {
        data.matches = result.matches;
        // 구글시트에서 받은 최신 데이터를 로컬에도 저장
        try { localStorage.setItem('inout_edited_matches', JSON.stringify(data.matches)); } catch(e) {}
    }
    if (result.members && result.members.length > 0) {
        // localStorage에 로컬 추가분이 있으면 병합
        const localAdded = _getLocalMemberEdits();
        if (localAdded.length > 0) {
            const sheetNames = new Set(result.members.map(m => m.name));
            localAdded.forEach(lm => {
                if (!sheetNames.has(lm.name)) {
                    result.members.push(lm);
                }
            });
            // 병합 완료 후 로컬 백업 클리어
            localStorage.removeItem('inout_local_member_edits');
        }
        data.members = result.members;
    }
    // allPlayers 재구성
    const playerSet = new Set();
    const memberMap = {};
    data.members.forEach(m => { memberMap[m.name] = m; });
    data.matches.forEach(m => { [m.a1, m.a2, m.b1, m.b2].forEach(n => playerSet.add(n)); });
    data.allPlayers = [];
    playerSet.forEach(name => {
        const mi = memberMap[name];
        data.allPlayers.push({
            name,
            gender: mi ? mi.gender : '남',
            type: mi ? mi.type : '비회원',
            level: mi ? mi.level : 6
        });
    });
    data.allPlayers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    // UI 전체 새로고침
    buildPeriodButtons();
    initializeDropdowns();
    applyFilter();
    renderDataStats();
    if (typeof renderMemberList === 'function') renderMemberList();
    if (typeof initScheduler === 'function') initScheduler();
    const info = document.getElementById('member-mode-info');
    const memberCount = data.allPlayers.filter(p => p.type === '회원').length;
    if (memberMode === 'members') {
        info.textContent = `회원 ${memberCount}명`;
    } else {
        const nonMemberCount = data.allPlayers.filter(p => p.type !== '회원').length;
        info.textContent = `전체 ${data.allPlayers.length}명 (회원 ${memberCount}명 + 비회원 ${nonMemberCount}명)`;
    }
}

async function syncFromGoogleSheet() {
    let sheetId = localStorage.getItem(GSHEET_STORAGE_KEY);
    if (!sheetId && DEFAULT_GSHEET_PUB_KEY) {
        sheetId = DEFAULT_GSHEET_PUB_KEY;
        _gsheetPubKey = DEFAULT_GSHEET_PUB_KEY;
    }
    if (!sheetId) { openGSheetSettings(); return; }
    const syncBtn = document.getElementById('gsheet-sync-btn');
    const origText = syncBtn.innerHTML;
    syncBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> 동기화 중...';
    syncBtn.disabled = true;
    try {
        const result = await fetchGSheetData(sheetId);
        if (result.error) {
            alert('동기화 실패: ' + result.error);
            return;
        }
        applyGSheetData(result);
        localStorage.setItem(GSHEET_LAST_SYNC_KEY, new Date().toISOString());
        syncBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 완료!';
        setTimeout(() => { syncBtn.innerHTML = origText; }, 2000);
    } catch (e) {
        alert('동기화 오류: ' + e.message);
    } finally {
        syncBtn.disabled = false;
        if (!syncBtn.innerHTML.includes('완료')) syncBtn.innerHTML = origText;
    }
}

// Google Sheets에 경기 결과 저장
async function sendMatchesToGSheet(matches) {
    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (!scriptUrl) return { ok: false, reason: 'no_script' };
    try {
        await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'addMatches', matches })
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

// Google Sheets에 회원 목록 동기화
async function syncMembersToGSheet() {
    const scriptUrl = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (!scriptUrl) return { ok: false, reason: 'no_script' };
    try {
        const members = data.members.map(m => ({
            name: m.name, gender: m.gender,
            level: m.level, type: m.type
        }));
        await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'syncMembers', members })
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

function openGSheetSettings() {
    const modal = document.getElementById('gsheet-modal');
    modal.style.display = 'flex';
    const saved = localStorage.getItem(GSHEET_STORAGE_KEY);
    const savedPubKey = localStorage.getItem('inout_gsheet_pub_key');
    if (saved) {
        if (savedPubKey) {
            document.getElementById('gsheet-url-input').value = `https://docs.google.com/spreadsheets/d/e/${saved}/pubhtml`;
        } else {
            document.getElementById('gsheet-url-input').value = `https://docs.google.com/spreadsheets/d/${saved}/edit`;
        }
    }
    const savedScript = localStorage.getItem(GSHEET_SCRIPT_KEY);
    if (savedScript) {
        document.getElementById('gsheet-script-input').value = savedScript;
    }
    const statusEl = document.getElementById('gsheet-status');
    statusEl.style.display = 'none';
}

function closeGSheetSettings() {
    document.getElementById('gsheet-modal').style.display = 'none';
}

async function testGSheetConnection() {
    const url = document.getElementById('gsheet-url-input').value;
    const sheetId = extractSheetId(url);
    const statusEl = document.getElementById('gsheet-status');
    if (!sheetId) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(248,113,113,0.1)';
        statusEl.style.color = 'var(--loss-color)';
        statusEl.textContent = '올바른 Google Sheets URL을 입력하세요.';
        return;
    }
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(102,187,106,0.1)';
    statusEl.style.color = 'var(--accent-text)';
    statusEl.textContent = '연결 테스트 중...';
    const result = await fetchGSheetData(sheetId);
    if (result.error) {
        statusEl.style.background = 'rgba(248,113,113,0.1)';
        statusEl.style.color = 'var(--loss-color)';
        statusEl.textContent = '오류: ' + result.error;
    } else {
        statusEl.style.background = 'rgba(102,187,106,0.1)';
        statusEl.style.color = 'var(--accent-text)';
        let msg = `연결 성공! 경기기록 ${result.matches.length}건`;
        if (result.members) msg += `, 회원 ${result.members.length}명`;
        statusEl.textContent = msg;
    }
}

async function saveGSheetConfig() {
    const url = document.getElementById('gsheet-url-input').value;
    const sheetId = extractSheetId(url);
    if (!sheetId) {
        alert('올바른 Google Sheets URL을 입력하세요.');
        return;
    }
    const statusEl = document.getElementById('gsheet-status');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(102,187,106,0.1)';
    statusEl.style.color = 'var(--accent-text)';
    statusEl.textContent = '데이터 가져오는 중...';
    const result = await fetchGSheetData(sheetId);
    if (result.error) {
        statusEl.style.background = 'rgba(248,113,113,0.1)';
        statusEl.style.color = 'var(--loss-color)';
        statusEl.textContent = '오류: ' + result.error;
        return;
    }
    localStorage.setItem(GSHEET_STORAGE_KEY, sheetId);
    localStorage.setItem(GSHEET_LAST_SYNC_KEY, new Date().toISOString());
    // pub URL 키 저장
    if (_gsheetPubKey) {
        localStorage.setItem('inout_gsheet_pub_key', _gsheetPubKey);
    } else {
        localStorage.removeItem('inout_gsheet_pub_key');
    }
    // Apps Script URL 저장
    const scriptUrl = document.getElementById('gsheet-script-input').value.trim();
    if (scriptUrl) {
        localStorage.setItem(GSHEET_SCRIPT_KEY, scriptUrl);
    } else {
        localStorage.removeItem(GSHEET_SCRIPT_KEY);
    }
    applyGSheetData(result);
    // 동기화 버튼 표시
    document.getElementById('gsheet-sync-btn').style.display = 'flex';
    let msg = `저장 완료! 경기기록 ${result.matches.length}건 동기화됨`;
    if (scriptUrl) msg += ' (쓰기 연동 활성화)';
    statusEl.textContent = msg;
    setTimeout(() => closeGSheetSettings(), 1500);
}

function removeGSheetConfig() {
    localStorage.removeItem(GSHEET_STORAGE_KEY);
    localStorage.removeItem(GSHEET_LAST_SYNC_KEY);
    localStorage.removeItem(GSHEET_SCRIPT_KEY);
    localStorage.removeItem('inout_gsheet_pub_key');
    _gsheetPubKey = null;
    document.getElementById('gsheet-sync-btn').style.display = 'none';
    document.getElementById('gsheet-url-input').value = '';
    document.getElementById('gsheet-script-input').value = '';
    const statusEl = document.getElementById('gsheet-status');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,0.1)';
    statusEl.style.color = 'var(--loss-color)';
    statusEl.textContent = '연동이 해제되었습니다. 내장 데이터로 복원하려면 페이지를 새로고침하세요.';
}

// spin 애니메이션
if (!document.getElementById('gsheet-spin-style')) {
    const style = document.createElement('style');
    style.id = 'gsheet-spin-style';
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
}

function _rebuildAllPlayers() {
    const playerSet = new Set();
    const memberMap = {};
    data.members.forEach(m => { memberMap[m.name] = m; });
    data.matches.forEach(m => { [m.a1, m.a2, m.b1, m.b2].forEach(n => playerSet.add(n)); });
    data.allPlayers = [];
    playerSet.forEach(name => {
        const mi = memberMap[name];
        data.allPlayers.push({ name, gender: mi?.gender || '남', type: mi?.type || '비회원', level: mi?.level || 6 });
    });
    data.allPlayers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function _initUI() {
    _rebuildAllPlayers();
    matches = JSON.parse(JSON.stringify(data.matches));
    buildPeriodButtons();
    initializeDropdowns();
    recalculate();
    setupUpload();
    renderDataStats();
    initScheduler();
    _loadLatestScheduleFromServer();
    _populateScheduleDateSelect();
    initRecorder();
    initTodayMatchup();
    initMemberManager();
    const info = document.getElementById('member-mode-info');
    if (info) info.textContent = `회원 ${data.members.filter(m => m.type === '회원').length}명`;
}

async function _initFromDB() {
    setLoadingLabel('데이터 불러오는 중...', '서버에 연결하고 있습니다');
    try {
        setLoadingLabel('회원 / 경기 기록 로드 중...');
        const [membersRes, matchesRes] = await Promise.allSettled([
            fetch(`${SCHEDULE_SERVER}/api/members`),
            fetch(`${SCHEDULE_SERVER}/api/matches`)
        ]);

        let memberCount = 0, matchCount = 0;

        if (membersRes.status === 'fulfilled' && membersRes.value.ok) {
            data.members = await membersRes.value.json();
            memberCount = data.members.length;
            console.log('[DB] 회원 로드:', memberCount, '명');
        } else {
            console.warn('[DB] 회원 로드 실패 — 기존 데이터 사용');
        }

        if (matchesRes.status === 'fulfilled' && matchesRes.value.ok) {
            data.matches = await matchesRes.value.json();
            matchCount = data.matches.length;
            console.log('[DB] 경기 로드:', matchCount, '경기');
        } else {
            console.warn('[DB] 경기 로드 실패 — 기존 데이터 사용');
        }

        setLoadingLabel('준비 완료', `회원 ${memberCount}명 · 경기 ${matchCount}건`);
    } catch(e) {
        console.warn('[DB] 로드 실패:', e.message);
        setLoadingLabel('오프라인 모드', '서버에 연결할 수 없어 저장된 데이터를 사용합니다');
        await new Promise(r => setTimeout(r, 900));
    }

    await new Promise(r => setTimeout(r, 300));
    hideAppOverlay();
    _initUI();
}

window.addEventListener('load', () => {
    _initFromDB();
});

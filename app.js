// app.js — Player × Machine heatmap (cell text = TOTAL POINTS, color = AVG POINTS)

/**
 * Map avg points (0..5) to a red→green HSL background.
 * Returns { bg, fg } (background and an optional foreground color).
 */

/** ===== Helpers injected by UI updates ===== **/


// app.js (top of file)
window.setStickyStyles = function () { /* ... */ };
window.pickTextColorForHsl = function (bgHsl) { /* ... */ };
window.renderLegend = function (mode, domain) { /* ... */ };


function pickTextColorForHsl(bgHsl) {
  // Parse "hsl(H, S%, L%)", choose white text for darker backgrounds.
  const m = /hsl\(\s*([0-9.]+),\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)/i.exec(bgHsl);
  const L = m ? parseFloat(m[3]) : 50;
  return L < 55 ? '#f8fafc' : '#0b1220';
}

function setStickyStyles() {
  // Injects a small, scoped CSS block once.
  const styleId = 'heatmap-sticky-style';
  if (document.getElementById(styleId)) return;
  const css = `
    #heatmap { border-collapse: separate; border-spacing: 1px; table-layout: fixed; width: max-content; margin-top: 8px; }
    #heatmap th, #heatmap td { padding: 4px 6px; font-size: 12px; text-align: center; white-space: nowrap; }
    #heatmap thead th { position: sticky; top: 0; z-index: 2; background: #0b1220; color: #e5e7eb; }
    #heatmap th.sticky-left { position: sticky; left: 0; z-index: 3; background: #0b1220; color: #e5e7eb; text-align: left; }
    #heatmap td.sticky-left { position: sticky; left: 0; z-index: 2; background: #0b1220; color: #e5e7eb; text-align: left; }
    #heatmap td { border-radius: 3px; }
    #heatmap tr:hover td { outline: 1px solid rgba(255,255,255,0.15); }
    #heatmap td.dim { opacity: 0.25; }
    .colhdr { display: inline-block; white-space: nowrap; transform: rotate(-35deg); transform-origin: left bottom; height: 48px; }
    #legend { margin-top: 6px; }
    #legend .legend { display:flex; align-items:center; gap:8px; color:#cbd5e1; font-size:12px; }
    #legend .swatch { height: 10px; width: 18px; border-radius: 2px; }
  `;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

function renderLegend(mode, domain) {
  const el = document.getElementById('legend');
  if (!el) return;
  const [a, b] = domain || [0, 1];
  const label = mode === 'avg' ? 'Avg points (0–5)'
    : mode === 'total' || mode?.startsWith('total-') ? `Total points` 
    : 'Per‑machine normalized (0–1)';
  const colors = Array.from({ length: 10 }, (_, i) => {
    const hue = (i / 9) * 120; // red->green
    return `hsl(${hue}, 75%, 45%)`;
  });
  el.innerHTML = `
    <div class="legend">
      <span>${label}</span>
      <span>${typeof a === 'number' ? Math.round(a) : a}</span>
      ${colors.map(c => `<div class="swatch" style="background:${c}"></div>`).join('')}
      <span>${typeof b === 'number' ? Math.round(b) : b}</span>
    </div>
  `;
}


function colorForAvgPoints(ap) {
  const val = ap == null ? 0 : Math.max(0, Math.min(5, Number(ap)));
  const hue = (val / 5) * 120; // 0=red, 120=green
  const bg = `hsl(${hue}, 75%, 45%)`;
  const fg = '#0d1117';
  return { bg, fg };
}

/**
 * Optionally color by TOTAL POINTS instead of avgPoints.
 * If you want that, compute maxTotal in renderHeatmap() and use this:
 *   const { bg, fg } = colorForTotalPoints(cell.totalPoints, maxTotal);
 */
function colorForTotalPoints(total, maxTotal) {
  const pct = maxTotal > 0 ? Math.max(0, Math.min(1, Number(total) / maxTotal)) : 0;
  const hue = pct * 120;
  const bg = `hsl(${hue}, 75%, 45%)`;
  const fg = '#0d1117';
  return { bg, fg };
}

/**
 * Fetch heatmap data.
 * If seriesIdOrList contains a comma, we call the multi-series endpoint.
 */
async function fetchHeatmap(base, seriesIdOrList, status) {
  const cleanBase = base.replace(/\/+$/, '');
  let url;
  if ((seriesIdOrList || '').includes(',')) {
    const qs = new URLSearchParams();
    qs.set('series', seriesIdOrList);
    if (status) qs.set('status', status);
    url = `${cleanBase}/insights/series-multi/heatmap/winrate?${qs.toString()}`;
  } else {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    url = `${cleanBase}/insights/series/${encodeURIComponent(seriesIdOrList)}/heatmap/winrate${suffix}`;
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Heatmap request failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- Robust stats helpers ---
function percentile(sortedNumericAsc, p /* 0..1 */) {
  const arr = sortedNumericAsc;
  if (!arr.length) return NaN;
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const t = idx - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

function getTotalsArray(matrix) {
  // Collect all finite totalPoints from matrix
  const vals = [];
  for (const r of (matrix || [])) {
    const v = Number(r.totalPoints);
    if (Number.isFinite(v)) vals.push(v);
  }
  return vals;
}

function buildWinsorizer(vals, lowerP = 0.01, upperP = 0.99) {
  const sorted = vals.slice().sort((a, b) => a - b);
  const lo = percentile(sorted, lowerP);
  const hi = percentile(sorted, upperP);
  const loClamped = Number.isFinite(lo) ? lo : 0;
  const hiClamped = Number.isFinite(hi) ? hi : 1;
  return {
    domain: [loClamped, hiClamped],
    map: (x) => {
      const v = Math.max(loClamped, Math.min(hiClamped, Number(x) || 0));
      const t = (v - loClamped) / Math.max(1e-9, hiClamped - loClamped);
      return Math.max(0, Math.min(1, t));
    }
  };
}

function buildQuantileMapper(vals, steps = 9) {
  // returns a mapper that puts x into [0..1] by quantile bin
  const sorted = vals.slice().sort((a, b) => a - b);
  if (!sorted.length) {
    return { thresholds: [], map: () => 0, domain: [0, 1] };
  }
  const thresholds = [];
  for (let i = 1; i < steps; i++) {
    thresholds.push(percentile(sorted, i / steps));
  }
  const min = sorted[0], max = sorted[sorted.length - 1];
  return {
    thresholds,
    domain: [min, max],
    map: (x) => {
      const v = Number(x) || 0;
      let idx = 0;
      while (idx < thresholds.length && v > thresholds[idx]) idx++;
      return idx / (steps - 1); // 0..1 across buckets
    }
  };
}

function buildLogMapper(vals) {
  if (!vals.length) return { domain: [0, 1], map: () => 0 };
  const min = Math.max(1e-6, Math.min(...vals));
  const max = Math.max(min * 10, Math.max(...vals)); // ensure span
  const logMin = Math.log(min), logMax = Math.log(max);
  return {
    domain: [min, max],
    map: (x) => {
      const v = Math.max(min, Math.min(max, Number(x) || 0));
      const t = (Math.log(v) - logMin) / Math.max(1e-9, (logMax - logMin));
      return Math.max(0, Math.min(1, t));
    }
  };
}

function colorFromUnit(unit /* 0..1 */) {
  const hue = unit * 120; // red->green
  const bg = `hsl(${hue}, 75%, 45%)`;
  return { bg, fg: pickTextColorForHsl(bg) };
}

/**
 * Render the heatmap table.
 * - Cell text: totalPoints (sum of 5/3/2/1 league points for that Player×Machine)
 * - Cell color: avgPoints (0..5) → red→green
 */

function renderHeatmap(data) {
  setStickyStyles();

  const tbl = document.getElementById('heatmap');
  tbl.innerHTML = '';

  const machines = data.machines || [];
  const players  = data.players  || [];
  const matrix   = data.matrix   || [];

  // Lookup: playerId -> (machineId -> cell)
  const M = new Map();
  for (const row of matrix) {
    let perPlayer = M.get(row.playerId);
    if (!perPlayer) { perPlayer = new Map(); M.set(row.playerId, perPlayer); }
    perPlayer.set(row.machineId, row);
  }

  // Precompute: global totals array, global maxTotal, per-column min/max
  const totals = getTotalsArray(matrix);
  let maxTotal = 0;
  const colStats = new Map(); // machineId -> {min,max}
  for (const m of machines) colStats.set(m.machineId, { min: Infinity, max: -Infinity });

  for (const r of matrix) {
    const t = Number(r.totalPoints) || 0;
    maxTotal = Math.max(maxTotal, t);
    const st = colStats.get(r.machineId);
    if (st) { st.min = Math.min(st.min, t); st.max = Math.max(st.max, t); }
  }
  for (const [k, st] of colStats) {
    if (!Number.isFinite(st.min)) st.min = 0;
    if (!Number.isFinite(st.max)) st.max = 1;
  }

  // Read UI
  const mode = document.getElementById('scale')?.value || 'total-winz';
  const showValues = document.getElementById('showValues')?.checked !== false;

  // Build color mappers
  let mapper, legendDomain;
  if (mode === 'avg') {
    mapper = { map: (ap) => Math.max(0, Math.min(1, (Number(ap) || 0) / 5)) };
    legendDomain = [0, 5];
  } else if (mode === 'colNorm') {
    mapper = { // per-column min-max; pass machineId to map
      mapCol: (machineId, t) => {
        const st = colStats.get(machineId) || { min: 0, max: 1 };
        const span = Math.max(1e-9, st.max - st.min);
        return Math.max(0, Math.min(1, ((Number(t) || 0) - st.min) / span));
      }
    };
    legendDomain = [0, 1];
  } else if (mode === 'total-quant') {
    const q = buildQuantileMapper(totals, 10);
    mapper = q;
    legendDomain = q.domain;
  } else if (mode === 'total-log') {
    const lg = buildLogMapper(totals);
    mapper = lg;
    legendDomain = lg.domain;
  } else { // 'total-winz' default
    const wz = buildWinsorizer(totals, 0.05, 0.95);
    mapper = wz;
    legendDomain = wz.domain;
  }

  // THEAD: names row
  const thead = document.createElement('thead');
  const trNames = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = '';
  corner.className  = 'sticky-left';
  trNames.appendChild(corner);

  machines.forEach(m => {
    const th = document.createElement('th');
    th.innerHTML = `<div class="colhdr">${m.machineName || m.machineId}</div>`;
    trNames.appendChild(th);
  });
  thead.appendChild(trNames);

  // THEAD: medians row (fixed corner)
  const trMedians = document.createElement('tr');
  const medianLabel = document.createElement('th');
  medianLabel.textContent = 'Median';
  medianLabel.className = 'sticky-left';
  medianLabel.style.textAlign = 'left';
  medianLabel.style.paddingRight = '8px';
  trMedians.appendChild(medianLabel);

  machines.forEach(m => {
    const th = document.createElement('th');
    if (m.medianScore != null && Number.isFinite(Number(m.medianScore))) {
      th.textContent = Math.round(Number(m.medianScore)).toLocaleString();
      th.title = `Median raw score on ${m.machineName || m.machineId}`;
    } else {
      th.textContent = '—';
    }
    trMedians.appendChild(th);
  });
  thead.appendChild(trMedians);
  tbl.appendChild(thead);

  // TBODY
  const tbody = document.createElement('tbody');
  players.forEach((p, iRow) => {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.textContent = p.playerName || p.playerId;
    th.className = 'sticky-left';
    tr.appendChild(th);

    machines.forEach((m, jCol) => {
      const cell = M.get(p.playerId)?.get(m.machineId) || { wins: 0, games: 0, totalPoints: 0, avgPoints: null };

      let text = '–', bg = '', fg = '', title = `${p.playerName || p.playerId} on ${m.machineName || m.machineId}`;

      if (cell.games > 0) {
        const total = Number(cell.totalPoints) || 0;
        const avg   = Number(cell.avgPoints);
        const valueForText = Math.round(total * 100) / 100;

        // Choose unit value 0..1 for color based on mode
        let unit;
        if (mode === 'avg') {
          unit = mapper.map(avg);
          // keep text as TOTAL unless you want to show avg
        } else if (mode === 'colNorm') {
          unit = mapper.mapCol(m.machineId, total);
        } else {
          unit = mapper.map(total);
        }

        const c = colorFromUnit(unit);
        bg = c.bg; fg = c.fg;
        text = showValues ? String(valueForText) : '';

        title += `: ${valueForText} total points across ${cell.games} game(s)`;
        if (Number.isFinite(avg)) title += `, avg ${Math.round(avg * 100) / 100} pts/game`;
        if (Number.isFinite(Number(cell.wins))) title += `, wins ${cell.wins}`;
      }

      const td = document.createElement('td');
      td.dataset.col = String(jCol);
      td.style.background = bg || '';
      td.style.color = fg || '';
      td.textContent = text;
      td.title = title;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);

  // Hover highlight
  tbl.addEventListener('mousemove', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    const col = td.dataset.col;
    tbl.querySelectorAll('td').forEach(el => el.classList.add('dim'));
    td.parentElement.querySelectorAll('td').forEach(el => el.classList.remove('dim'));
    tbl.querySelectorAll(`td[data-col="${col}"]`).forEach(el => el.classList.remove('dim'));
  });
  tbl.addEventListener('mouseleave', () => {
    tbl.querySelectorAll('td.dim').forEach(el => el.classList.remove('dim'));
  });

  // Legend
  renderLegend(mode, legendDomain);
}


/**
 * Main load handler: grabs inputs, fetches data, renders heatmap.
 */
async function load() {
  try {
    const base = document.getElementById('apiBase').value.trim();
    const series = document.getElementById('seriesId').value.trim();
    if (!base || !series) {
      alert('Please enter API Base and Series ID(s).');
      return;
    }

    // Optional status filter support (add a <select id="status"> if you want)
    const statusEl = document.getElementById('status');
    const status = statusEl ? statusEl.value.trim() : '';

    const data = await fetchHeatmap(base, series, status);
    renderHeatmap(data);
  } catch (err) {
    console.error(err);
    alert(`Failed to load heatmap: ${err.message || err}`);
  }
}

// Wire up events
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('load');
  if (btn) btn.addEventListener('click', load);
  // Auto-load once if fields are prefilled
  load().catch(console.warn);
});

// app.js — Player × Machine heatmap (cell text = TOTAL POINTS, color = AVG POINTS)

/**
 * Map avg points (0..5) to a red→green HSL background.
 * Returns { bg, fg } (background and an optional foreground color).
 */
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

function buildWinsorizer(vals, lowerP = 0.05, upperP = 0.95) {
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
  const tbl = document.getElementById('heatmap');
  tbl.innerHTML = '';

  // Build a fast lookup: M[playerId].get(machineId) -> { wins, games, totalPoints, avgPoints }
  const M = new Map();
  for (const row of (data.matrix || [])) {
    let perPlayer = M.get(row.playerId);
    if (!perPlayer) {
      perPlayer = new Map();
      M.set(row.playerId, perPlayer);
    }
    perPlayer.set(row.machineId, row);
  }

  // Optional: if you want to color by TOTAL POINTS, compute the max once:
  const maxTotal = (data.matrix || []).reduce((mx, r) => Math.max(mx, r.totalPoints || 0), 0);

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // ---- Header Row 1: machine names
  const trNames = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = ''; // top-left corner
  trNames.appendChild(corner);

  (data.machines || []).forEach(m => {
    const th = document.createElement('th');
    th.textContent = m.machineName || m.machineId;
    trNames.appendChild(th);
  });

  thead.appendChild(trNames);

  // ---- Header Row 2: machine median scores (if available)
  const trMedians = document.createElement('tr');
  const medianLabel = document.createElement('th');
  medianLabel.textContent = 'Median';
  medianLabel.style.textAlign = 'right';
  medianLabel.style.paddingRight = '8px';
  // trMedians.appendChild(medianLabel);

  (data.machines || []).forEach(m => {
    const th = document.createElement('th');
    if (m.medianScore != null) {
      const rounded = Math.round(Number(m.medianScore));
      th.textContent = Number.isFinite(rounded) ? rounded.toLocaleString() : '—';
      th.title = `Median raw score on ${m.machineName || m.machineId}`;
    } else {
      th.textContent = '—';
    }
    trMedians.appendChild(th);
  });

  thead.appendChild(trMedians);
  tbl.appendChild(thead);
  
  // ---- Body: rows by player, columns by machine
  (data.players || []).forEach(p => {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.textContent = p.playerName || p.playerId;
    th.style.textAlign = 'left';
    tr.appendChild(th);

    (data.machines || []).forEach(m => {
      const cell =
        (M.get(p.playerId)?.get(m.machineId)) ||
        { wins: 0, games: 0, totalPoints: 0, avgPoints: null };

      let txt = '–';
      let bg = '';
      let fg = '';
      let title = `${p.playerName || p.playerId} on ${m.machineName || m.machineId}`;

      if (cell.games > 0) {
        // Text = TOTAL POINTS (sum of 5/3/2/1)
        const pts = Math.round(Number(cell.totalPoints) * 100) / 100;
        txt = String(pts);

        // Color = AVG POINTS (0..5)
        // const { bg: cBg, fg: cFg } = colorForAvgPoints(cell.avgPoints);
        // If you want color by total instead, use:
        const { bg: cBg, fg: cFg } = colorForTotalPoints(cell.totalPoints, maxTotal);
        bg = cBg; fg = cFg;

        title += `: ${pts} total points across ${cell.games} game(s)`;
        if (cell.avgPoints != null) {
          title += `, avg ${Math.round(Number(cell.avgPoints) * 100) / 100} pts/game`;
        }
      }

      const td = document.createElement('td');
      if (bg) td.style.background = bg;
      if (fg) td.style.color = fg;
      td.textContent = txt;
      td.title = title;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
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

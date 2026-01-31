async function load() {
  const base = document.getElementById('apiBase').value;
  const series = document.getElementById('seriesId').value;

  const r = await fetch(`${base}/insights/series/${series}/heatmap/winrate`);
  if (!r.ok) {
    throw new Error(`Request failed ${r.status}`);
  }
  const d = await r.json();

  const tbl = document.getElementById('heatmap');
  tbl.innerHTML = '';

  // Build a fast lookup: M[playerId].get(machineId) -> cell
  const M = new Map();
  d.matrix.forEach(row => {
    let perPlayer = M.get(row.playerId);
    if (!perPlayer) {
      perPlayer = new Map();
      M.set(row.playerId, perPlayer);
    }
    perPlayer.set(row.machineId, row); // { wins, games, totalPoints, avgPoints }
  });

  // ----- Header row (machine names)
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');

  const corner = document.createElement('th');
  corner.textContent = ''; // top-left empty corner
  trHead.appendChild(corner);

  d.machines.forEach(m => {
    const th = document.createElement('th');
    th.textContent = m.machineName || m.machineId;
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  tbl.appendChild(thead);

  // ----- Body rows (players × machines)
  const tbody = document.createElement('tbody');

  d.players.forEach(p => {
    const rowEl = document.createElement('tr');

    // Player name in first column
    const th = document.createElement('th');
    th.textContent = p.playerName || p.playerId;
    th.style.textAlign = 'left';
    rowEl.appendChild(th);

    // One cell per machine
    d.machines.forEach(m => {
      // cell object now has: { wins, games, totalPoints, avgPoints }
      const cell =
        (M.get(p.playerId)?.get(m.machineId)) ||
        { wins: 0, games: 0, totalPoints: 0, avgPoints: null };

      let txt = '–';
      let bg = '';
      let title = `${p.playerName || p.playerId} on ${m.machineName || m.machineId}`;

      if (cell.games > 0) {
        // Text: total points (sum of 5/3/2/1 results)
        const pts = Math.round(cell.totalPoints * 100) / 100; // keep 2 decimals
        txt = String(pts);

        // Color: by avgPoints (0..5) for readability
        const ap = (cell.avgPoints == null) ? 0 : Math.max(0, Math.min(5, cell.avgPoints));
        const hue = (ap / 5) * 120; // 0=red, 120=green
        bg = `hsl(${hue}, 75%, 45%)`;

        title += `: ${pts} total points across ${cell.games} game(s), avg ${cell.avgPoints ?? '—'} pts/game`;
      }

      const td = document.createElement('td');
      td.style.background = bg;
      td.textContent = txt;
      td.title = title;
      rowEl.appendChild(td);
    });

    tbody.appendChild(rowEl);
  });

  tbl.appendChild(tbody);
}

// Hooks
document.getElementById('load').onclick = load;
window.onload = load;

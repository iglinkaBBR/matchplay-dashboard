async function load(){
 const base=document.getElementById('apiBase').value;
 const series=document.getElementById('seriesId').value;
 const r=await fetch(`${base}/insights/series/${series}/heatmap/winrate`);
 const d=await r.json();
 const tbl=document.getElementById('heatmap');
 tbl.innerHTML='';
 const tr=document.createElement('tr');
 tr.innerHTML='<th></th>'+d.machines.map(m=>`<th>${m.machineName}</th>`).join('');
 tbl.appendChild(tr);
 d.players.forEach(p=>{
  const row=document.createElement('tr');
  row.innerHTML=`<th>${p.playerName}</th>`;
  d.machines.forEach(m=>{
    // cell object now has: { wins, games, totalPoints, avgPoints }
const cell = (M.get(p.playerId)?.get(m.machineId)) || { wins:0, games:0, totalPoints:0, avgPoints:null };

let txt = '–';
let bg  = '';
let title = `${p.playerName || p.playerId} on ${m.machineName || m.machineId}`;

if (cell.games > 0) {
  // Show total points as the text
  const pts = Math.round(cell.totalPoints * 100) / 100; // keep 2 decimals
  txt = String(pts);

  // Color by avgPoints for readability (0..5 range in your format)
  const ap = (cell.avgPoints == null) ? 0 : Math.max(0, Math.min(5, cell.avgPoints));
  // map [0..5] to hue 0..120
  const hue = (ap / 5) * 120;
  bg = `hsl(${hue}, 75%, 45%)`;

  title += `: ${pts} total points across ${cell.games} game(s), avg ${cell.avgPoints ?? '—'} pts/game`;
});
}
document.getElementById('load').onclick=load;window.onload=load;



td.style.background = bg;
td.textContent = txt;
td.title = title;

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
    const cell=d.matrix.find(x=>x.playerId===p.playerId && x.machineId===m.machineId);
    let txt='–'; let bg='';
    if(cell && cell.games>0){const pct=Math.round(cell.winRate*100);txt=pct+'%';bg=`hsl(${pct},70%,45%)`;}
    row.innerHTML+=`<td style="background:${bg}">${txt}</td>`;
  });
  tbl.appendChild(row);
 });
}
document.getElementById('load').onclick=load;window.onload=load;
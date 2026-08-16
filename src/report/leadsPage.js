/**
 * Internal "Leads" page — a self-contained, GBX-branded admin view that reads
 * /api/leads, offers the four sort modes and lets you mark leads contacted.
 */
export function renderLeadsPage() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GBX SiteEval — Leads</title>
<style>
  :root{--teal:#2E8B6E;--teal-deep:#1A5C4A;--teal-glow:rgba(46,139,110,.16);--void:#0A0A0A;--charcoal:#1A1A1A;--charcoal2:#151515;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--ink:#EDEDED;--dim:#A7ABA9;--faint:#6E7370;--serif:Georgia,'Times New Roman',serif;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--good:#2E8B6E;--warn:#C9A24A;--bad:#C7594B;}
  *{box-sizing:border-box;} body{margin:0;background:radial-gradient(1000px 500px at 85% -10%,rgba(46,139,110,.10),transparent 60%),var(--void);color:var(--ink);font-family:var(--sans);}
  a{color:var(--teal);text-decoration:none;} a:hover{text-decoration:underline;}
  .wrap{max-width:1180px;margin:0 auto;padding:0 24px;}
  .topbar{border-bottom:1px solid var(--line);background:rgba(10,10,10,.72);position:sticky;top:0;z-index:10;}
  .topbar .wrap{display:flex;align-items:center;justify-content:space-between;height:66px;}
  .logo{display:inline-flex;align-items:center;gap:11px;border:1px solid var(--line2);padding:8px 13px;border-radius:8px;}
  .logo .mark{font-family:var(--serif);font-weight:700;font-size:23px;letter-spacing:1px;color:#fff;line-height:1;}
  .logo .mark .x{color:var(--teal);} .logo .div{width:1px;height:22px;background:var(--line2);}
  .logo .sub{font-size:9px;letter-spacing:2.2px;color:var(--dim);text-transform:uppercase;line-height:1.25;}
  .topbar .nav a{color:var(--dim);font-size:13px;margin-left:18px;} .topbar .nav a.active{color:#fff;}
  h1{font-family:var(--serif);font-weight:400;font-size:34px;margin:40px 0 4px;color:#fff;}
  .sub{color:var(--dim);margin:0 0 22px;}
  .stats{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;}
  .stat{background:var(--charcoal2);border:1px solid var(--line);border-radius:10px;padding:12px 18px;}
  .stat b{font-family:var(--serif);font-size:24px;color:#fff;display:block;} .stat span{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--faint);}
  .tabs{display:inline-flex;gap:4px;background:var(--charcoal2);border:1px solid var(--line);border-radius:10px;padding:4px;margin-bottom:20px;flex-wrap:wrap;}
  .tab{background:transparent;border:0;color:var(--dim);font-size:13.5px;font-family:var(--sans);padding:9px 15px;border-radius:7px;cursor:pointer;}
  .tab.active{background:var(--charcoal);color:#fff;box-shadow:inset 0 0 0 1px var(--line2);}
  .tab small{color:var(--faint);}
  .list{display:flex;flex-direction:column;gap:10px;padding-bottom:70px;}
  .lead{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;background:var(--charcoal2);border:1px solid var(--line);border-radius:12px;padding:15px 18px;}
  .lead.contacted{opacity:.62;}
  .ease{width:52px;height:52px;border-radius:10px;border:1px solid var(--line2);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;}
  .ease b{font-family:var(--serif);font-size:19px;line-height:1;color:#fff;} .ease span{font-size:8px;letter-spacing:.5px;color:var(--faint);text-transform:uppercase;margin-top:2px;}
  .who .host{color:#fff;font-size:16px;font-weight:600;word-break:break-all;} .who .host .g{font-size:12px;color:var(--faint);margin-left:8px;}
  .who .contact{color:var(--dim);font-size:13px;margin-top:3px;}
  .who .win{color:var(--teal);font-size:13px;margin-top:6px;}
  .who .flags{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;}
  .flag{font-size:10.5px;letter-spacing:.4px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);color:var(--dim);}
  .flag.single{border-color:var(--teal-deep);color:var(--teal);} .flag.mobile{border-color:#5a2a24;color:#E58A7D;background:rgba(199,89,75,.08);}
  .flag.score-bad{color:#E58A7D;} .flag.score-warn{color:#D9BC77;} .flag.score-good{color:var(--teal);}
  .actions{display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex:none;}
  .when{color:var(--faint);font-size:11.5px;}
  .btn{background:var(--teal);color:#04140E;font-weight:700;font-size:12.5px;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;white-space:nowrap;}
  .btn.ghost{background:transparent;border:1px solid var(--line2);color:var(--dim);}
  .btn.ghost:hover{border-color:var(--teal);color:var(--ink);}
  .empty{color:var(--faint);padding:50px 0;text-align:center;}
  .empty a{font-weight:600;}
</style></head><body>
<header class="topbar"><div class="wrap">
  <span class="logo"><span class="mark">GB<span class="x">X</span></span><span class="div"></span><span class="sub">Professional<br>Services</span></span>
  <span class="nav"><a href="/">Evaluator</a><a href="/leads" class="active">Leads</a></span>
</div></header>
<main class="wrap">
  <h1>Leads</h1>
  <p class="sub">Prospects who unlocked their report. Ranked so you always know who to call next.</p>
  <div class="stats" id="stats"></div>
  <div class="tabs" id="tabs">
    <button class="tab" data-sort="recent">Most recent</button>
    <button class="tab active" data-sort="score">Lowest score</button>
    <button class="tab" data-sort="uncontacted">Uncontacted</button>
    <button class="tab" data-sort="ease">Easiest fix</button>
  </div>
  <div class="list" id="list"></div>
</main>
<script>
const $=s=>document.querySelector(s);
let sort='score';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const scoreCls=s=>s>=80?'good':s>=60?'warn':'bad';
const gradeCol=g=>({A:'#2E8B6E',B:'#3FA184',C:'#C9A24A',D:'#C9A24A',E:'#C7594B',F:'#C7594B'}[g]||'#2E8B6E');

async function load(){
  const r=await fetch('/api/leads?sort='+sort); const d=await r.json();
  $('#stats').innerHTML=[['Total',d.total],['Uncontacted',d.uncontacted],['Contacted',d.contacted]]
    .map(([k,v])=>'<div class="stat"><b>'+v+'</b><span>'+k+'</span></div>').join('');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.sort===sort));
  if(!d.leads.length){ $('#list').innerHTML='<div class="empty">No leads yet.<br>Leads appear here once a visitor unlocks their report in lead-gen mode (<code>LEADGEN_MODE=on</code>). <a href="/">Open the evaluator →</a></div>'; return; }
  $('#list').innerHTML=d.leads.map(row).join('');
  document.querySelectorAll('[data-contact]').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.contact,b.dataset.state!=='true')));
}
function row(l){
  const ease=l.easeScore==null?'–':l.easeScore;
  const flags=[
    '<span class="flag score-'+scoreCls(l.score)+'">'+l.score+'/100 · '+l.grade+'</span>',
    l.isSinglePage?'<span class="flag single">Single-page</span>':'',
    l.mobileBroken?'<span class="flag mobile">✕ Mobile-broken</span>':'',
    l.weakest?'<span class="flag">Weakest: '+esc(l.weakest)+'</span>':''
  ].join('');
  return '<div class="lead'+(l.contacted?' contacted':'')+'">'
    +'<div class="ease" title="Ease of win"><b style="color:'+gradeCol(l.grade)+'">'+ease+'</b><span>ease</span></div>'
    +'<div class="who"><div class="host">'+esc(l.host)+'<span class="g">'+esc(l.company||'')+'</span></div>'
    +'<div class="contact">'+esc(l.name||'—')+' · <a href="mailto:'+esc(l.email)+'">'+esc(l.email)+'</a> · <a href="'+esc(l.url)+'" target="_blank" rel="noopener">visit</a></div>'
    +(l.fastWin?'<div class="win">→ '+esc(l.fastWin)+'</div>':'')
    +'<div class="flags">'+flags+'</div></div>'
    +'<div class="actions"><span class="when">'+new Date(l.at).toLocaleDateString()+(l.contacted&&l.contactedAt?' · contacted '+new Date(l.contactedAt).toLocaleDateString():'')+'</span>'
    +'<button class="btn '+(l.contacted?'ghost':'')+'" data-contact="'+l.id+'" data-state="'+l.contacted+'">'+(l.contacted?'Mark uncontacted':'Mark contacted')+'</button></div>'
    +'</div>';
}
async function toggle(id,state){ await fetch('/api/leads/'+id+'/contacted',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contacted:state})}); load(); }
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{sort=t.dataset.sort;load();}));
load();
</script>
</body></html>`;
}

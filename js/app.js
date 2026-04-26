const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const sessionKey = 'ti_user_session';
const getUser = () => JSON.parse(localStorage.getItem(sessionKey) || 'null');
const setUser = (u) => localStorage.setItem(sessionKey, JSON.stringify(u));
const toast = (msg) => { const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); };

async function api(path, opts={}){
  const res = await fetch(path,{headers:{'Content-Type':'application/json'},...opts});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

const loginForm = $('#loginForm');
if(loginForm){
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#loginMsg'); msg.classList.add('d-none');
    try{
      const login = $('#login').value.trim();
      const senha = $('#senha').value;
      const data = await api('/api/login',{method:'POST',body:JSON.stringify({login,senha})});
      setUser(data.user); location.href='dashboard.html';
    }catch(err){ msg.textContent=err.message; msg.classList.remove('d-none'); }
  });
}

if(location.pathname.endsWith('dashboard.html') || location.pathname === '/dashboard'){
  const user = getUser();
  if(!user) location.href='index.html';
  $('#profileName').textContent = user?.nome || 'Usuário';
  $('#profileRole').textContent = user?.cargo || 'TI';
  $('#avatar').textContent = (user?.nome || 'U').slice(0,1).toUpperCase();
  $('#logoutBtn').addEventListener('click',()=>{localStorage.removeItem(sessionKey);location.href='index.html'});

  $$('.side-link').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.side-link').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    $$('.content-section').forEach(s=>s.classList.remove('active')); $('#'+btn.dataset.section).classList.add('active');
  }));
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.open).classList.add('active')));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).classList.remove('active')));

  async function loadAll(){ await Promise.all([loadChamados(), loadInventario()]); }

  async function loadChamados(){
    const chamados = await api('/api/chamados');
    $('#mAbertos').textContent = chamados.filter(c=>c.status==='aberto').length;
    $('#mResolvidos').textContent = chamados.filter(c=>c.status==='concluido').length;
    const concluidos = chamados.filter(c=>c.fechado_em);
    if(concluidos.length){
      const media = concluidos.reduce((acc,c)=> acc + ((new Date(c.fechado_em)-new Date(c.criado_em))/60000),0)/concluidos.length;
      $('#mTempo').textContent = Math.round(media)+'min';
    }
    renderRecent(chamados.slice(0,5));
    renderKanban(chamados);
  }

  function renderRecent(items){
    const box=$('#recentList');
    if(!items.length){box.className='list-clean empty-state'; box.textContent='Nenhum chamado cadastrado.'; return;}
    box.className='list-clean';
    box.innerHTML = items.map(c=>`<div class="ticket"><h6>${c.titulo}</h6><div class="ticket-meta">Setor: ${c.setor||'—'} · Solicitante: ${c.solicitante||'—'} · Status: ${label(c.status)}</div></div>`).join('');
  }

  function renderKanban(chamados){
    const map={aberto:'#colAberto',andamento:'#colAndamento',concluido:'#colConcluido'};
    Object.values(map).forEach(id=>$(id).innerHTML='');
    chamados.forEach(c=>{
      const el=document.createElement('div'); el.className='ticket';
      el.innerHTML=`<h6>${c.titulo}</h6><div class="ticket-meta">Setor: ${c.setor||'—'}<br>Solicitante: ${c.solicitante||'—'}<br>Criado por: ${c.criado?.nome||'—'}</div><div class="ticket-actions">${actions(c)}</div>`;
      $(map[c.status]||'#colAberto').appendChild(el);
    });
    $$('[data-status]').forEach(b=>b.onclick=()=>updateStatus(b.dataset.id,b.dataset.status));
    $$('[data-delete]').forEach(b=>b.onclick=()=>deleteChamado(b.dataset.delete));
  }
  const label=s=>({aberto:'Aberto',andamento:'Em andamento',concluido:'Concluído'}[s]||s);
  const actions=c=>`${c.status!=='andamento'?`<button class="btn btn-outline-light btn-mini" data-id="${c.id}" data-status="andamento">Em andamento</button>`:''}${c.status!=='concluido'?`<button class="btn btn-primary btn-mini" data-id="${c.id}" data-status="concluido">Concluir</button>`:''}<button class="btn btn-outline-light btn-mini" data-delete="${c.id}">Excluir</button>`;

  async function updateStatus(id,status){ await api('/api/chamados',{method:'PATCH',body:JSON.stringify({id,status,user_id:user.id})}); toast('Chamado atualizado.'); loadChamados(); }
  async function deleteChamado(id){ if(!confirmModal('Excluir este chamado?')) return; await api('/api/chamados',{method:'DELETE',body:JSON.stringify({id,user_id:user.id})}); toast('Chamado excluído.'); loadChamados(); }
  function confirmModal(msg){ return window.confirm(msg); }

  $('#chamadoForm').addEventListener('submit',async e=>{
    e.preventDefault(); const f=new FormData(e.target); const body=Object.fromEntries(f.entries()); body.user_id=user.id;
    await api('/api/chamados',{method:'POST',body:JSON.stringify(body)}); e.target.reset(); $('#modalChamado').classList.remove('active'); toast('Chamado criado.'); loadChamados();
  });

  async function loadInventario(){
    const inv = await api('/api/inventario'); $('#mEquipamentos').textContent = inv.length;
    const box=$('#inventoryList');
    if(!inv.length){box.className='panel glass empty-state'; box.textContent='Nenhum equipamento cadastrado.'; return;}
    box.className='panel glass';
    box.innerHTML=inv.map(e=>`<div class="inventory-card"><strong>${e.etiqueta||'Sem etiqueta'}</strong> · ${e.modelo||'Modelo não informado'}<div class="ticket-meta">Setor: ${e.setor||'—'} · Usuário/local: ${e.usuario_responsavel||'—'}</div><div class="ticket-meta">Periféricos: ${(e.perifericos||[]).filter(p=>!p.deletado).map(p=>`${p.tipo}: ${p.etiqueta}`).join(' · ')||'—'}</div><button class="btn btn-outline-light btn-mini mt-2" data-equip-del="${e.id}">Excluir</button></div>`).join('');
    $$('[data-equip-del]').forEach(b=>b.onclick=()=>deleteEquip(b.dataset.equipDel));
  }
  async function deleteEquip(id){ if(!confirmModal('Excluir este equipamento?')) return; await api('/api/inventario',{method:'DELETE',body:JSON.stringify({id,user_id:user.id})}); toast('Equipamento excluído.'); loadInventario(); }
  $('#equipForm').addEventListener('submit',async e=>{e.preventDefault(); const body=Object.fromEntries(new FormData(e.target).entries()); body.user_id=user.id; await api('/api/inventario',{method:'POST',body:JSON.stringify(body)}); e.target.reset(); toast('Equipamento salvo.'); loadInventario();});
  loadAll().catch(err=>toast(err.message));
}

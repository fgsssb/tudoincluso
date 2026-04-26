const user = JSON.parse(localStorage.getItem('ti_user') || 'null');
if (!user) location.href = '/';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
let inventarioState = { perfis: [], itens: [], perfilSelecionado: '' };

const api = (url, opt = {}) =>
  fetch(url, {
    ...opt,
    headers: {
      'content-type': 'application/json',
      'x-user-id': user.id,
      ...(opt.headers || {})
    }
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Erro');
    return d;
  });

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function modal(html) {
  $('#modalRoot').innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  $$('[data-close]').forEach((b) => (b.onclick = () => ($('#modalRoot').innerHTML = '')));
}

function confirmBox(text, onYes, label = 'Excluir') {
  modal(`
    <div class="modal-head">
      <h2>Confirmar ação</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>
    <p class="subtitle">${esc(text)}</p>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancelar</button>
      <button id="yes" class="btn danger">${esc(label)}</button>
    </div>
  `);

  $('#yes').onclick = async () => {
    await onYes();
    $('#modalRoot').innerHTML = '';
  };
}

$('#profileName').textContent = user.nome;
$('#profileRole').textContent = user.cargo || 'TI';
$('#avatar').textContent = user.nome[0].toUpperCase();
$('#logout').onclick = () => {
  localStorage.removeItem('ti_user');
  location.href = '/';
};

$$('.nav').forEach((b) => {
  b.onclick = () => {
    $$('.nav,.page').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    $('#' + b.dataset.page).classList.add('active');
    render(b.dataset.page);
  };
});

$('#novoChamado').onclick = () => openChamadoModal();

async function render(page = 'dashboard') {
  if (page === 'dashboard') return renderDashboard();
  if (page === 'chamados') return renderChamados();
  if (page === 'inventario') return renderInventario();
}

async function renderDashboard() {
  let d = { abertos: 0, resolvidos: 0, equipamentos: 0, tempo_medio: 0 };

  try {
    d = await api('/api/dashboard');
  } catch (e) {
    toast(e.message);
  }

  $('#dashboard').innerHTML = `
    <h1>Dashboard</h1>
    <p class="subtitle">Resumo geral do suporte interno.</p>

    <div class="grid4">
      <div class="card stat"><small>Abertos</small><strong>${esc(d.abertos)}</strong></div>
      <div class="card stat"><small>Resolvidos</small><strong>${esc(d.resolvidos)}</strong></div>
      <div class="card stat"><small>Itens no inventário</small><strong>${esc(d.equipamentos)}</strong></div>
      <div class="card stat"><small>Tempo médio</small><strong>${esc(d.tempo_medio || 0)}min</strong></div>
    </div>

    <div class="form-section" style="margin-top:14px">
      <h2>Resumo da semana</h2>
      <p class="subtitle">Preparado para filtrar por técnico conforme os chamados forem concluídos.</p>
      <div class="empty">Gráfico será exibido quando houver chamados concluídos.</div>
    </div>
  `;
}

function badge(v, cls) {
  const classe = cls || String(v).toLowerCase().replace(' ', '');
  return `<span class="badge ${esc(classe)}">${esc(v)}</span>`;
}

async function renderChamados() {
  let rows = [];

  try {
    rows = (await api('/api/chamados')).data;
  } catch (e) {
    toast(e.message);
  }

  $('#chamados').innerHTML = `
    <div class="toolbar">
      <div>
        <h1>Chamados</h1>
        <p class="subtitle">Controle estilo Trello, com status e histórico.</p>
      </div>
      <input id="filtroChamado" placeholder="Filtrar chamado...">
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Setor</th>
            <th>Solicitante</th>
            <th>Problema</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Técnico</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody id="chamadosBody">
          ${renderChamadosRows(rows)}
        </tbody>
      </table>
    </div>
  `;

  $('#filtroChamado').oninput = (e) => {
    const termo = e.target.value.toLowerCase();
    const filtrados = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(termo));
    $('#chamadosBody').innerHTML = renderChamadosRows(filtrados);
  };
}

function renderChamadosRows(rows) {
  if (!rows.length) return `<tr><td colspan="8" class="empty">Nenhum chamado cadastrado.</td></tr>`;

  return rows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.codigo || '')}</td>
        <td>${esc(r.setor || '')}</td>
        <td>${esc(r.solicitante || '—')}</td>
        <td>${esc(r.titulo || '')}</td>
        <td>${badge(r.prioridade || 'Média', (r.prioridade || 'media').toLowerCase())}</td>
        <td>${badge(r.status_label || r.status, r.status === 'em_andamento' ? 'andamento' : r.status)}</td>
        <td>${esc(r.tecnico_nome || '')}</td>
        <td><button class="btn tiny" onclick="detalheChamado('${esc(r.id)}')">Detalhes</button></td>
      </tr>
    `
    )
    .join('');
}

function openChamadoModal() {
  modal(`
    <div class="modal-head">
      <h2>Novo chamado</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>

    <form id="chamadoForm">
      <div class="form-grid two">
        <label>Título<input name="titulo" required></label>
        <label>Setor<input name="setor"></label>
        <label>Solicitante<input name="solicitante" placeholder="Opcional"></label>
        <label>Prioridade
          <select name="prioridade">
            <option>Baixa</option>
            <option selected>Média</option>
            <option>Alta</option>
          </select>
        </label>
        <label class="span-all">Descrição<textarea name="descricao"></textarea></label>
        <label class="span-all">Links de prints<textarea name="print_links" placeholder="Cole um link por linha"></textarea></label>
      </div>
      <button class="btn primary">Salvar chamado</button>
    </form>
  `);

  $('#chamadoForm').onsubmit = async (e) => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(e.target));

    try {
      await api('/api/chamados', { method: 'POST', body: JSON.stringify(o) });
      toast('Chamado criado');
      $('#modalRoot').innerHTML = '';
      renderChamados();
      renderDashboard();
    } catch (err) {
      toast(err.message);
    }
  };
}

window.detalheChamado = async (id) => {
  try {
    const r = (await api('/api/chamados?id=' + id)).data;

    modal(`
      <div class="modal-head">
        <h2>${esc(r.titulo)}</h2>
        <button class="btn ghost tiny" data-close>Fechar</button>
      </div>
      <p>
        <b>Status:</b> ${badge(r.status_label || r.status, r.status === 'em_andamento' ? 'andamento' : r.status)}
        &nbsp;
        <b>Prioridade:</b> ${badge(r.prioridade, (r.prioridade || 'media').toLowerCase())}
      </p>
      <p class="subtitle">${esc(r.descricao || 'Sem descrição.')}</p>
      <div class="modal-actions left">
        <button class="btn" id="and">Mover para em andamento</button>
        <button class="btn primary" id="con">Concluir chamado</button>
        <button class="btn danger" id="del">Excluir</button>
      </div>
    `);

    $('#and').onclick = () => updateStatus(id, 'em_andamento');
    $('#con').onclick = () => updateStatus(id, 'concluido');
    $('#del').onclick = () => confirmBox('Esse chamado será removido da tela, mas ficará marcado como excluído no banco.', () => delChamado(id));
  } catch (e) {
    toast(e.message);
  }
};

async function updateStatus(id, status) {
  await api('/api/chamados', { method: 'PATCH', body: JSON.stringify({ id, status }) });
  toast('Status atualizado');
  $('#modalRoot').innerHTML = '';
  renderChamados();
  renderDashboard();
}

async function delChamado(id) {
  await api('/api/chamados', { method: 'DELETE', body: JSON.stringify({ id }) });
  toast('Chamado excluído');
  renderChamados();
  renderDashboard();
}

async function carregarInventario() {
  const [perfis, itens] = await Promise.all([
    api('/api/inventario?tipo=perfis'),
    api('/api/inventario?tipo=itens')
  ]);

  inventarioState.perfis = perfis.data || [];
  inventarioState.itens = itens.data || [];

  if (!inventarioState.perfilSelecionado && inventarioState.perfis.length) {
    inventarioState.perfilSelecionado = inventarioState.perfis[0].id;
  }
}

async function renderInventario() {
  try {
    await carregarInventario();
  } catch (e) {
    toast(e.message);
  }

  const perfis = inventarioState.perfis;
  const perfilAtual = perfis.find((p) => p.id === inventarioState.perfilSelecionado) || perfis[0];
  const itensFiltrados = perfilAtual
    ? inventarioState.itens.filter((i) => i.perfil_id === perfilAtual.id)
    : inventarioState.itens;

  $('#inventario').innerHTML = `
    <div class="toolbar">
      <div>
        <h1>Inventário</h1>
        <p class="subtitle">Crie perfis como computador, impressora, toner ou qualquer outro tipo de item.</p>
      </div>
      <div class="toolbar-actions">
        <button class="btn" id="btnCsvInventario">Importar CSV</button>
        <button class="btn" id="btnNovoPerfil">+ Novo perfil</button>
      </div>
    </div>

    <div class="inventory-layout">
      <aside class="inventory-side">
        <div class="panel-title">Perfis</div>
        <div class="profile-list">
          ${renderPerfilList(perfis, perfilAtual)}
        </div>
      </aside>

      <section class="inventory-main">
        ${perfilAtual ? renderItemForm(perfilAtual) : renderSemPerfil()}
        ${perfilAtual ? renderItensTable(perfilAtual, itensFiltrados) : ''}
      </section>
    </div>
  `;

  $$('.profile-option').forEach((btn) => {
    btn.onclick = () => {
      inventarioState.perfilSelecionado = btn.dataset.id;
      renderInventario();
    };
  });

  $('#btnNovoPerfil').onclick = () => openPerfilModal();
  $('#btnCsvInventario').onclick = () => openCsvModal();

  const form = $('#inventarioItemForm');
  if (form && perfilAtual) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const valores = {};
      (perfilAtual.campos || []).forEach((c) => (valores[c.nome] = fd.get(c.nome) || ''));

      try {
        await api('/api/inventario', {
          method: 'POST',
          body: JSON.stringify({ action: 'create_item', perfil_id: perfilAtual.id, valores })
        });
        toast('Item salvo no inventário');
        renderInventario();
        renderDashboard();
      } catch (err) {
        toast(err.message);
      }
    };
  }
}

function renderPerfilList(perfis, perfilAtual) {
  if (!perfis.length) return `<div class="empty compact">Nenhum perfil criado.</div>`;

  return perfis
    .map(
      (p) => `
      <button class="profile-option ${perfilAtual?.id === p.id ? 'active' : ''}" data-id="${esc(p.id)}">
        <strong>${esc(p.nome)}</strong>
        <span>${esc((p.campos || []).length)} campos</span>
      </button>
    `
    )
    .join('');
}

function renderSemPerfil() {
  return `
    <div class="form-section">
      <h2>Nenhum perfil criado</h2>
      <p class="subtitle">Crie um perfil de inventário para começar. Exemplo: Computador, Impressora, Toner, Roteador.</p>
      <button class="btn primary" onclick="openPerfilModal()">Criar primeiro perfil</button>
    </div>
  `;
}

function renderItemForm(perfil) {
  const campos = perfil.campos || [];

  return `
    <form id="inventarioItemForm">
      <div class="form-section inventory-form-section">
        <div class="section-head">
          <div>
            <h2>Cadastrar ${esc(perfil.nome)}</h2>
            <p class="subtitle small-margin">${esc(perfil.descricao || 'Preencha os campos deste perfil.')}</p>
          </div>
          <button type="button" class="btn ghost tiny" onclick="openPerfilInfo('${esc(perfil.id)}')">Ver campos</button>
        </div>

        <div class="form-grid inventory-grid">
          ${campos.map(renderCampoInput).join('')}
        </div>

        <div class="form-actions">
          <button class="btn primary">Salvar item</button>
          <button type="reset" class="btn ghost">Limpar campos</button>
        </div>
      </div>
    </form>
  `;
}

function renderCampoInput(c) {
  const required = c.obrigatorio ? 'required' : '';
  const label = `${esc(c.label)}${c.obrigatorio ? ' *' : ''}`;

  if (c.tipo === 'textarea') {
    return `<label class="span-all">${label}<textarea name="${esc(c.nome)}" ${required}></textarea></label>`;
  }

  if (c.tipo === 'numero') {
    return `<label>${label}<input name="${esc(c.nome)}" type="number" ${required}></label>`;
  }

  if (c.tipo === 'data') {
    return `<label>${label}<input name="${esc(c.nome)}" type="date" ${required}></label>`;
  }

  return `<label>${label}<input name="${esc(c.nome)}" ${required}></label>`;
}

function renderItensTable(perfil, itens) {
  const campos = (perfil.campos || []).slice(0, 5);

  return `
    <div class="table-wrap inventory-table">
      <table>
        <thead>
          <tr>
            ${campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}
            <th>Cadastrado por</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${
            itens.length
              ? itens.map((item) => renderInventarioRow(item, campos)).join('')
              : `<tr><td colspan="${campos.length + 2}" class="empty">Nenhum item cadastrado nesse perfil.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderInventarioRow(item, campos) {
  return `
    <tr>
      ${campos.map((c) => `<td>${esc(item.valores?.[c.nome] || '')}</td>`).join('')}
      <td>${esc(item.criado_por_nome || '')}</td>
      <td>
        <button class="btn tiny" onclick="detalheItem('${esc(item.id)}')">Detalhes</button>
        <button class="btn danger tiny" onclick="delInventarioItem('${esc(item.id)}')">Excluir</button>
      </td>
    </tr>
  `;
}

window.openPerfilInfo = (id) => {
  const perfil = inventarioState.perfis.find((p) => p.id === id);
  if (!perfil) return;

  modal(`
    <div class="modal-head">
      <h2>Perfil: ${esc(perfil.nome)}</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>

    <p class="subtitle">${esc(perfil.descricao || 'Sem descrição.')}</p>

    <div class="field-list">
      ${(perfil.campos || [])
        .map(
          (c) => `
          <div class="field-row">
            <strong>${esc(c.label)}</strong>
            <span>${esc(c.nome)} • ${esc(c.tipo)}${c.obrigatorio ? ' • obrigatório' : ''}</span>
          </div>
        `
        )
        .join('')}
    </div>
  `);
};

window.detalheItem = (id) => {
  const item = inventarioState.itens.find((i) => i.id === id);
  if (!item) return;

  const perfil = inventarioState.perfis.find((p) => p.id === item.perfil_id);
  const campos = perfil?.campos || [];

  modal(`
    <div class="modal-head">
      <h2>${esc(item.titulo || 'Item de inventário')}</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>

    <p class="subtitle">Tipo: ${esc(perfil?.nome || '')}</p>

    <div class="detail-grid">
      ${campos
        .map(
          (c) => `
          <div class="detail-item">
            <small>${esc(c.label)}</small>
            <strong>${esc(item.valores?.[c.nome] || '—')}</strong>
          </div>
        `
        )
        .join('')}
    </div>
  `);
};

window.delInventarioItem = (id) => {
  confirmBox('Esse item será removido da tela e marcado como excluído no banco.', async () => {
    await api('/api/inventario', { method: 'DELETE', body: JSON.stringify({ id, tipo: 'item' }) });
    toast('Item excluído');
    renderInventario();
    renderDashboard();
  });
};

function openPerfilModal() {
  modal(`
    <div class="modal-head">
      <h2>Novo perfil de inventário</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>

    <p class="subtitle">Use isso para criar tipos novos: Impressora, Toner, Roteador, Nobreak, Celular, Licença, etc.</p>

    <form id="perfilForm">
      <div class="form-grid two">
        <label>Nome do perfil<input name="nome" placeholder="Ex: Impressora" required></label>
        <label>Descrição<input name="descricao" placeholder="Opcional"></label>
      </div>

      <div class="field-builder-head">
        <h3>Campos do perfil</h3>
        <button type="button" class="btn small" id="addCampo">+ Campo</button>
      </div>

      <div id="camposBuilder" class="field-builder"></div>

      <div class="modal-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button class="btn primary">Criar perfil</button>
      </div>
    </form>
  `);

  const addCampo = (label = '', tipo = 'texto', obrigatorio = false) => {
    const wrap = document.createElement('div');
    wrap.className = 'builder-row';
    wrap.innerHTML = `
      <input data-campo="label" placeholder="Nome do campo" value="${esc(label)}">
      <select data-campo="tipo">
        <option value="texto" ${tipo === 'texto' ? 'selected' : ''}>Texto</option>
        <option value="numero" ${tipo === 'numero' ? 'selected' : ''}>Número</option>
        <option value="data" ${tipo === 'data' ? 'selected' : ''}>Data</option>
        <option value="textarea" ${tipo === 'textarea' ? 'selected' : ''}>Texto grande</option>
      </select>
      <label class="check"><input data-campo="obrigatorio" type="checkbox" ${obrigatorio ? 'checked' : ''}> Obrigatório</label>
      <button type="button" class="btn danger tiny">Remover</button>
    `;
    wrap.querySelector('button').onclick = () => wrap.remove();
    $('#camposBuilder').appendChild(wrap);
  };

  addCampo('Etiqueta / patrimônio', 'texto', true);
  addCampo('Setor', 'texto', false);
  addCampo('Observações', 'textarea', false);

  $('#addCampo').onclick = () => addCampo();

  $('#perfilForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const campos = [...document.querySelectorAll('.builder-row')]
      .map((row, i) => {
        const label = row.querySelector('[data-campo="label"]').value.trim();
        const tipo = row.querySelector('[data-campo="tipo"]').value;
        const obrigatorio = row.querySelector('[data-campo="obrigatorio"]').checked;
        return { label, nome: norm(label), tipo, obrigatorio, ordem: i + 1 };
      })
      .filter((c) => c.label && c.nome);

    if (!campos.length) return toast('Crie pelo menos um campo');

    try {
      await api('/api/inventario', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_profile',
          nome: fd.get('nome'),
          descricao: fd.get('descricao'),
          campos
        })
      });

      toast('Perfil criado');
      $('#modalRoot').innerHTML = '';
      inventarioState.perfilSelecionado = '';
      renderInventario();
    } catch (err) {
      toast(err.message);
    }
  };
}

function parseCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let quote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && quote && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      quote = !quote;
      continue;
    }

    if (ch === sep && !quote) {
      out.push(cur.trim());
      cur = '';
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function parseCsv(txt) {
  const lines = txt.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { head: [], rows: [] };

  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = parseCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => parseCsvLine(l, sep));

  return { head, rows };
}

function openCsvModal() {
  const perfis = inventarioState.perfis;

  modal(`
    <div class="modal-head">
      <h2>Importar CSV para inventário</h2>
      <button class="btn ghost tiny" data-close>Fechar</button>
    </div>

    <p class="subtitle">Agora a importação fica dentro do inventário. Escolha o perfil, carregue a planilha e confira o mapeamento antes de gravar.</p>

    <div class="csv-steps">
      <div class="form-section">
        <h2>1. Perfil e arquivo</h2>
        <div class="form-grid two">
          <label>Perfil
            <select id="csvPerfil">
              ${perfis.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}
            </select>
          </label>
          <label>Arquivo CSV<input id="csvFile" type="file" accept=".csv"></label>
        </div>
      </div>

      <div class="form-section">
        <h2>2. Mapeamento</h2>
        <div id="csvMap" class="mapping"><div class="empty compact">Selecione um arquivo CSV.</div></div>
      </div>

      <div class="form-section">
        <h2>3. Pré-visualização</h2>
        <div id="csvPreview" class="empty compact">Nenhum CSV selecionado.</div>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" data-close>Cancelar</button>
        <button id="importBtn" class="btn primary">Importar</button>
      </div>
    </div>
  `);

  let parsed = { head: [], rows: [] };

  const montarMap = () => {
    const perfil = inventarioState.perfis.find((p) => p.id === $('#csvPerfil').value);
    const campos = perfil?.campos || [];
    const head = parsed.head || [];

    if (!head.length) return;

    $('#csvMap').innerHTML = campos
      .map((c) => {
        const auto = head.findIndex((h) => norm(h) === c.nome || norm(h) === norm(c.label));
        return `
          <label>${esc(c.label)}
            <select data-field="${esc(c.nome)}">
              <option value="">Ignorar</option>
              ${head.map((h, i) => `<option value="${i}" ${i === auto ? 'selected' : ''}>${esc(h)}</option>`).join('')}
            </select>
          </label>
        `;
      })
      .join('');
  };

  $('#csvPerfil').onchange = montarMap;

  $('#csvFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const txt = await file.text();
    parsed = parseCsv(txt);

    if (!parsed.head.length) {
      toast('CSV vazio ou inválido');
      return;
    }

    $('#csvPreview').innerHTML = `
      <div class="preview">
        <table>
          <thead><tr>${parsed.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${parsed.rows.slice(0, 6).map((r) => `<tr>${parsed.head.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="subtitle small-margin">Mostrando até 6 linhas. Total detectado: ${parsed.rows.length}.</p>
    `;

    montarMap();
  };

  $('#importBtn').onclick = async () => {
    const perfil_id = $('#csvPerfil').value;
    const selects = [...document.querySelectorAll('#csvMap select[data-field]')];

    if (!parsed.rows.length) return toast('Selecione um CSV primeiro');

    let total = 0;

    try {
      for (const row of parsed.rows) {
        const valores = {};
        selects.forEach((sel) => {
          if (sel.value !== '') valores[sel.dataset.field] = row[Number(sel.value)] || '';
        });

        await api('/api/inventario', {
          method: 'POST',
          body: JSON.stringify({ action: 'create_item', perfil_id, valores })
        });

        total++;
      }

      toast(`${total} itens importados`);
      $('#modalRoot').innerHTML = '';
      renderInventario();
      renderDashboard();
    } catch (err) {
      toast(err.message);
    }
  };
}

render('dashboard');

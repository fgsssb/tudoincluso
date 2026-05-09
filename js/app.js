'use strict';

const APP_VERSION = '1.0.08.05.26';
const STORAGE_KEY = 'pj1_tickets_v1';
const CLIENT_ID_KEY = 'pj1_client_id_v1';
const LOGIN_URL = '/index.html';

const LIMITS = Object.freeze({ title: 90, requester: 60, description: 800 });
const ALLOWED_STATUSES = Object.freeze(['concluido', 'andamento', 'suporte']);
const statusMap = Object.freeze({
  concluido: { text: 'Concluído', className: 'done' },
  andamento: { text: 'Em andamento', className: 'progress' },
  suporte: { text: 'Aguardando suporte', className: 'support' }
});

const seedTickets = [
  { id: crypto.randomUUID(), titulo: 'Microfone do CallCenter', descricao: 'Corrigido problema com microfone no computador do CallCenter conforme solicitado por Larissa.', solicitante: 'Larissa', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Telefone do Ambulatório', descricao: 'Reiniciado telefone do Ambulatório para correção de chamadas que não estavam sendo completadas conforme solicitado por Raquel.', solicitante: 'Raquel', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Códigos CIR0409 e CIR0404', descricao: 'Criados os códigos CIR0409 e CIR0404, parametrizados conforme solicitado por Bruna, da Administração.', solicitante: 'Bruna', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'CIR0135 na sala 2', descricao: 'Incluído CIR0135 à sala 2 conforme solicitado por Daniele.', solicitante: 'Daniele', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Driver da impressora - Silvania', descricao: 'Instalado driver da impressora no notebook da Silvania conforme solicitado.', solicitante: 'Silvania', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Impressora do consultório 7', descricao: 'Corrigido problema com impressora que não funcionava a impressão no consultório 7 conforme solicitado por Jéssica.', solicitante: 'Jéssica', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Notebook do Centro Diagnóstico Laser', descricao: 'Verificado erro no notebook dos equipamentos no Centro Diagnóstico Laser, já está operando normalmente.', solicitante: 'Não informado', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Códigos PCT0174 e PCT0173', descricao: 'Inseridos códigos PCT0174 e PCT0173 na sala 2 conforme solicitado por Daniele.', solicitante: 'Daniele', data: '08/05/2026', status: 'concluido' },
  { id: crypto.randomUUID(), titulo: 'Procedimento SALA DE REUNIÕES', descricao: 'Corrigido problema com procedimento “SALA DE REUNIÕES”, que não aparecia ao tentar realizar agendamento para o dia 11, conforme solicitado por Bruna da Administração.', solicitante: 'Bruna', data: '08/05/2026', status: 'concluido' }
];

let tickets = [];
let selectedTicketId = null;
let detailCloseTimer = null;
let toastTimer = null;
let realtimeClient = null;
let realtimeChannel = null;
let currentUser = null;

const clientId = getClientId();

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function getStatusInfo(status) { return statusMap[status] || statusMap.concluido; }
function isValidStatus(status) { return ALLOWED_STATUSES.includes(status); }
function sanitizeText(value, maxLength) { return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength); }
function sanitizeDescription(value) { return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.description); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function normalizeTicket(raw) {
  return {
    id: sanitizeText(raw.id, 80) || crypto.randomUUID(),
    titulo: sanitizeText(raw.titulo, LIMITS.title) || 'Sem título',
    descricao: sanitizeDescription(raw.descricao) || 'Sem descrição informada.',
    solicitante: sanitizeText(raw.solicitante, LIMITS.requester) || 'Não informado',
    data: sanitizeText(raw.data, 10) || new Date().toLocaleDateString('pt-BR'),
    status: isValidStatus(raw.status) ? raw.status : 'concluido',
    isNew: Boolean(raw.isNew)
  };
}

function loadTickets() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(stored)) return stored.map(normalizeTicket);
  } catch {}
  const seeded = seedTickets.map(normalizeTicket);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveTickets() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets.map(({ isNew, ...ticket }) => ticket))); }
function getTicketById(id) { return tickets.find((ticket) => ticket.id === id) || null; }

function buildCardHtml(item, index) {
  const ticket = normalizeTicket(item);
  const statusInfo = getStatusInfo(ticket.status);
  return [
    '<article class="card ', ticket.isNew ? 'new-card' : '', '" style="animation-delay: ', Math.min(index * 35, 240), 'ms" data-id="', escapeHtml(ticket.id), '" title="Clique para ver o chamado completo">',
      '<div class="card-head"><h3 class="card-title">', escapeHtml(ticket.titulo), '</h3><span class="card-date">', escapeHtml(ticket.data), '</span></div>',
      '<div class="meta"><span class="requester"><strong class="requester-name">', escapeHtml(ticket.solicitante), '</strong><span class="meta-separator">,</span></span><span class="status ', statusInfo.className, '">', statusInfo.text, '</span></div>',
      '<span class="card-open-hint" aria-hidden="true"></span>',
    '</article>'
  ].join('');
}

function render() {
  const container = document.getElementById('doneCards');
  container.innerHTML = tickets.length ? tickets.map(buildCardHtml).join('') : '<div class="empty">Nenhum chamado encontrado.</div>';
}

function notify(text) {
  const toast = document.getElementById('toast');
  toast.textContent = sanitizeText(text, 120);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openBackdrop(id) { const el = document.getElementById(id); if (el) el.classList.add('is-open'); }
function closeBackdrop(id) { const el = document.getElementById(id); if (el) el.classList.remove('is-open'); }

function openModal() { openBackdrop('modalBackdrop'); setTimeout(() => document.getElementById('newTitle').focus(), 120); }
function closeModal() { closeBackdrop('modalBackdrop'); document.getElementById('newTitle').value = ''; document.getElementById('newDesc').value = ''; document.getElementById('newPerson').value = ''; document.getElementById('newStatus').value = 'concluido'; }

function applyAction(action, options = {}) {
  const payload = action.payload || {};
  const type = action.type;
  let changed = false;

  if (type === 'ticket:create') {
    const ticket = normalizeTicket(payload.ticket || {});
    if (!getTicketById(ticket.id)) {
      tickets.unshift({ ...ticket, isNew: true });
      changed = true;
    }
  }

  if (type === 'ticket:update-title') {
    const ticket = getTicketById(payload.id);
    const value = sanitizeText(payload.titulo, LIMITS.title);
    if (ticket && value) { ticket.titulo = value; ticket.isNew = true; changed = true; }
  }

  if (type === 'ticket:update-requester') {
    const ticket = getTicketById(payload.id);
    const value = sanitizeText(payload.solicitante, LIMITS.requester);
    if (ticket && value) { ticket.solicitante = value; ticket.isNew = true; changed = true; }
  }

  if (type === 'ticket:update-description') {
    const ticket = getTicketById(payload.id);
    const value = sanitizeDescription(payload.descricao);
    if (ticket && value) { ticket.descricao = value; ticket.isNew = true; changed = true; }
  }

  if (type === 'ticket:update-status') {
    const ticket = getTicketById(payload.id);
    if (ticket && isValidStatus(payload.status)) { ticket.status = payload.status; ticket.isNew = true; changed = true; }
  }

  if (type === 'ticket:delete') {
    const before = tickets.length;
    tickets = tickets.filter((ticket) => ticket.id !== payload.id);
    changed = before !== tickets.length;
  }

  if (changed) {
    saveTickets();
    render();
    setTimeout(() => { tickets.forEach((ticket) => { ticket.isNew = false; }); render(); }, 1400);
  }

  if (options.broadcast) sendAction(action);
}

async function sendAction(action) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ clientId, action })
    });
  } catch {
    notify('Ação salva localmente. Falha ao sincronizar.');
  }
}

function addTicket() {
  const titulo = sanitizeText(document.getElementById('newTitle').value, LIMITS.title);
  const descricao = sanitizeDescription(document.getElementById('newDesc').value);
  const solicitante = sanitizeText(document.getElementById('newPerson').value, LIMITS.requester) || 'Não informado';
  const status = document.getElementById('newStatus').value;
  if (!titulo || !descricao) return notify('Preencha título e descrição.');
  if (!isValidStatus(status)) return notify('Status inválido.');
  const ticket = normalizeTicket({ id: crypto.randomUUID(), titulo, descricao, solicitante, status, data: new Date().toLocaleDateString('pt-BR') });
  applyAction({ type: 'ticket:create', payload: { ticket } }, { broadcast: true });
  closeModal();
  notify('Chamado adicionado.');
}

function openDetail(id) {
  const ticket = getTicketById(id);
  if (!ticket) return;
  selectedTicketId = id;
  const statusInfo = getStatusInfo(ticket.status);
  const finishButton = ticket.status === 'andamento' || ticket.status === 'suporte' ? '<button class="finish-btn" id="finishTicketBtn" type="button" title="Finalizar chamado" aria-label="Finalizar chamado"></button>' : '';
  document.getElementById('detailContent').innerHTML = [
    '<div class="detail-top"><h2 class="detail-title">', escapeHtml(ticket.titulo), '</h2><span class="detail-date">', escapeHtml(ticket.data), '</span></div>',
    '<div class="detail-desc">', escapeHtml(ticket.descricao), '</div>',
    '<div class="detail-meta"><span class="requester">Solicitado por: <strong class="requester-name">', escapeHtml(ticket.solicitante), '</strong></span><span class="detail-status-wrap"><span class="status ', statusInfo.className, '">', statusInfo.text, '</span>', finishButton, '</span></div>'
  ].join('');
  const finishTicketBtn = document.getElementById('finishTicketBtn');
  if (finishTicketBtn) finishTicketBtn.addEventListener('click', (event) => finishTicket(event, id));
  const detailBackdrop = document.getElementById('detailBackdrop');
  detailBackdrop.classList.remove('is-closing');
  detailBackdrop.classList.add('is-open');
}

function closeDetail() {
  const detailBackdrop = document.getElementById('detailBackdrop');
  if (!detailBackdrop.classList.contains('is-open')) return;
  detailBackdrop.classList.remove('is-open');
  detailBackdrop.classList.add('is-closing');
  clearTimeout(detailCloseTimer);
  detailCloseTimer = setTimeout(() => detailBackdrop.classList.remove('is-closing'), 250);
}

function finishTicket(event, id) { event.stopPropagation(); applyAction({ type: 'ticket:update-status', payload: { id, status: 'concluido' } }, { broadcast: true }); closeDetail(); notify('Chamado finalizado como concluído.'); }

function openContextMenu(event, id) {
  event.preventDefault(); event.stopPropagation();
  const ticket = getTicketById(id); if (!ticket) return;
  selectedTicketId = id;
  document.getElementById('moveSupportBtn').classList.toggle('is-hidden', ticket.status !== 'andamento');
  const menu = document.getElementById('contextMenu');
  menu.style.left = event.clientX + 'px'; menu.style.top = event.clientY + 'px'; menu.classList.add('is-open');
  const rect = menu.getBoundingClientRect(); const padding = 10;
  if (rect.right > window.innerWidth - padding) menu.style.left = (window.innerWidth - rect.width - padding) + 'px';
  if (rect.bottom > window.innerHeight - padding) menu.style.top = (window.innerHeight - rect.height - padding) + 'px';
}

function closeContextMenu() { document.getElementById('contextMenu').classList.remove('is-open'); }
function getSelectedTicket() { return selectedTicketId ? getTicketById(selectedTicketId) : null; }
function deleteSelectedTicket() { if (!getSelectedTicket()) return; closeContextMenu(); openBackdrop('deleteConfirmBackdrop'); }
function closeDeleteConfirm() { closeBackdrop('deleteConfirmBackdrop'); }
function confirmDeleteTicket() { if (!getSelectedTicket()) return; applyAction({ type: 'ticket:delete', payload: { id: selectedTicketId } }, { broadcast: true }); selectedTicketId = null; closeDeleteConfirm(); closeDetail(); notify('Chamado excluído.'); }
function moveSelectedTicketToSupport() { const t = getSelectedTicket(); if (!t || t.status !== 'andamento') return; applyAction({ type: 'ticket:update-status', payload: { id: t.id, status: 'suporte' } }, { broadcast: true }); closeContextMenu(); notify('Status alterado para aguardando suporte.'); }

function openEditTitleModal() { const t = getSelectedTicket(); if (!t) return; const input = document.getElementById('editTitleInput'); input.value = t.titulo; closeContextMenu(); openBackdrop('editTitleBackdrop'); setTimeout(() => { input.focus(); input.select(); }, 120); }
function closeEditTitleModal() { closeBackdrop('editTitleBackdrop'); document.getElementById('editTitleInput').value = ''; }
function saveEditedTitle() { const t = getSelectedTicket(); if (!t) return; const value = sanitizeText(document.getElementById('editTitleInput').value, LIMITS.title); if (!value) return notify('Informe um título.'); applyAction({ type: 'ticket:update-title', payload: { id: t.id, titulo: value } }, { broadcast: true }); closeEditTitleModal(); notify('Título atualizado.'); }
function openEditRequesterModal() { const t = getSelectedTicket(); if (!t) return; const input = document.getElementById('editRequesterInput'); input.value = t.solicitante; closeContextMenu(); openBackdrop('editRequesterBackdrop'); setTimeout(() => { input.focus(); input.select(); }, 120); }
function closeEditRequesterModal() { closeBackdrop('editRequesterBackdrop'); document.getElementById('editRequesterInput').value = ''; }
function saveEditedRequester() { const t = getSelectedTicket(); if (!t) return; const value = sanitizeText(document.getElementById('editRequesterInput').value, LIMITS.requester); if (!value) return notify('Informe o solicitante.'); applyAction({ type: 'ticket:update-requester', payload: { id: t.id, solicitante: value } }, { broadcast: true }); closeEditRequesterModal(); notify('Solicitante atualizado.'); }
function openEditDescriptionModal() { const t = getSelectedTicket(); if (!t) return; const input = document.getElementById('editDescriptionInput'); input.value = t.descricao; closeContextMenu(); openBackdrop('editDescriptionBackdrop'); setTimeout(() => { input.focus(); input.select(); }, 120); }
function closeEditDescriptionModal() { closeBackdrop('editDescriptionBackdrop'); document.getElementById('editDescriptionInput').value = ''; }
function saveEditedDescription() { const t = getSelectedTicket(); if (!t) return; const value = sanitizeDescription(document.getElementById('editDescriptionInput').value); if (!value) return notify('Informe a descrição.'); applyAction({ type: 'ticket:update-description', payload: { id: t.id, descricao: value } }, { broadcast: true }); closeEditDescriptionModal(); notify('Descrição atualizada.'); }

function addBackdropClose(id, closeFn) { const el = document.getElementById(id); if (!el) return; el.addEventListener('click', (event) => { if (event.target.id === id) closeFn(); }); }

async function requireSession() {
  const res = await fetch('/api/session', { credentials: 'same-origin' });
  if (!res.ok) { window.location.href = LOGIN_URL; return null; }
  const data = await res.json();
  currentUser = data.user;
  document.getElementById('userName').textContent = currentUser.nome || currentUser.login || 'TI';
  document.getElementById('userAvatar').firstChild.nodeValue = (currentUser.nome || currentUser.login || 'T').trim().charAt(0).toUpperCase();
  return currentUser;
}

async function setupRealtime() {
  const response = await fetch('/api/config', { credentials: 'same-origin' });
  if (!response.ok) return notify('Realtime indisponível.');
  const config = await response.json();
  if (!window.supabase) return notify('Biblioteca Supabase não carregou.');
  realtimeClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  realtimeChannel = realtimeClient
    .channel('pj1-events-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pj1_events' }, (payload) => {
      const event = payload.new;
      if (!event || event.client_id === clientId) return;
      applyAction(event.action, { broadcast: false });
    })
    .subscribe();
}

let pendingCsvRows = null;

function openCsvTools() {
  openBackdrop('csvToolsBackdrop');
}

function closeCsvTools() {
  closeBackdrop('csvToolsBackdrop');
  const input = document.getElementById('csvFileInput');
  if (input) input.value = '';
}

function closeCsvImportConfirm() {
  closeBackdrop('csvImportConfirmBackdrop');
  pendingCsvRows = null;
  const input = document.getElementById('csvFileInput');
  if (input) input.value = '';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

function ticketsToCsv() {
  const headers = ['id', 'titulo', 'descricao', 'solicitante', 'status', 'data'];
  const rows = tickets.map((ticket) => {
    const normalized = normalizeTicket(ticket);
    return headers.map((key) => csvEscape(normalized[key])).join(',');
  });

  return '\ufeff' + headers.map(csvEscape).join(',') + '\n' + rows.join('\n');
}

function getCsvFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-');

  return `chamados-ti-${stamp}.csv`;
}

async function exportCsv() {
  if (!tickets.length) {
    notify('Não há chamados para exportar.');
    return;
  }

  const csv = ticketsToCsv();
  const fileName = getCsvFileName();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

  try {
    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Arquivo CSV',
            accept: { 'text/csv': ['.csv'] }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    closeCsvTools();
    notify('CSV exportado.');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    notify('Não foi possível exportar o CSV.');
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  const source = String(text || '').replace(/^\ufeff/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (insideQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char !== '\r') field += char;
  }

  row.push(field);
  rows.push(row);

  return rows.filter((csvRow) => csvRow.some((cell) => String(cell).trim() !== ''));
}

function csvRowsToTickets(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => sanitizeText(header, 40).toLowerCase());
  const required = ['titulo', 'descricao', 'solicitante', 'status', 'data'];
  const hasRequired = required.every((field) => headers.includes(field));

  if (!hasRequired) {
    throw new Error('CSV inválido. Colunas necessárias: titulo, descricao, solicitante, status, data.');
  }

  return rows.slice(1).map((row) => {
    const raw = {};

    headers.forEach((header, index) => {
      raw[header] = row[index] || '';
    });

    return normalizeTicket({
      id: sanitizeText(raw.id, 80) || crypto.randomUUID(),
      titulo: raw.titulo,
      descricao: raw.descricao,
      solicitante: raw.solicitante,
      status: raw.status,
      data: raw.data
    });
  }).filter((ticket) => ticket.titulo && ticket.descricao);
}

function askCsvFile() {
  const input = document.getElementById('csvFileInput');
  input.value = '';
  input.click();
}

async function handleCsvFileSelected(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    notify('Selecione um arquivo CSV.');
    event.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const importedTickets = csvRowsToTickets(rows);

    if (!importedTickets.length) {
      notify('CSV sem chamados válidos.');
      event.target.value = '';
      return;
    }

    pendingCsvRows = importedTickets;
    document.getElementById('csvImportConfirmText').textContent =
      `Deseja importar os dados desse CSV? ${importedTickets.length} chamado(s) serão carregados.`;
    closeCsvTools();
    openBackdrop('csvImportConfirmBackdrop');
  } catch (error) {
    notify(error.message || 'Não foi possível ler o CSV.');
    event.target.value = '';
  }
}

function confirmCsvImport() {
  if (!Array.isArray(pendingCsvRows) || !pendingCsvRows.length) {
    closeCsvImportConfirm();
    return;
  }

  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  let added = 0;
  let updated = 0;

  pendingCsvRows.forEach((ticket) => {
    const normalized = normalizeTicket(ticket);
    const existing = byId.get(normalized.id);

    if (existing) {
      existing.titulo = normalized.titulo;
      existing.descricao = normalized.descricao;
      existing.solicitante = normalized.solicitante;
      existing.status = normalized.status;
      existing.data = normalized.data;
      existing.isNew = true;
      updated += 1;
    } else {
      tickets.unshift({ ...normalized, isNew: true });
      added += 1;
    }
  });

  saveTickets();
  render();
  closeCsvImportConfirm();
  notify(`CSV importado. ${added} novo(s), ${updated} atualizado(s).`);

  setTimeout(() => {
    tickets.forEach((ticket) => {
      ticket.isNew = false;
    });
    render();
  }, 1400);
}

function runTests() {
  console.assert(getStatusInfo('suporte').text === 'Aguardando suporte', 'Teste status suporte falhou');
  console.assert(escapeHtml('<x>') === '&lt;x&gt;', 'Teste escapeHtml falhou');
  console.assert(sanitizeText('  a   b  ', 20) === 'a b', 'Teste sanitizeText falhou');
  console.assert(isValidStatus('hack') === false, 'Teste status inválido falhou');
  console.assert(parseCsv(ticketsToCsv()).length >= 2, 'Teste CSV export/import falhou');
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireSession();
  tickets = loadTickets();
  render();
  setupRealtime();

  document.getElementById('csvToolsBtn').addEventListener('click', openCsvTools);
  document.getElementById('cancelCsvToolsBtn').addEventListener('click', closeCsvTools);
  document.getElementById('importCsvBtn').addEventListener('click', askCsvFile);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('csvFileInput').addEventListener('change', handleCsvFileSelected);
  document.getElementById('cancelCsvImportBtn').addEventListener('click', closeCsvImportConfirm);
  document.getElementById('confirmCsvImportBtn').addEventListener('click', confirmCsvImport);
  document.getElementById('addTicketBtn').addEventListener('click', openModal);
  document.getElementById('cancelAddBtn').addEventListener('click', closeModal);
  document.getElementById('saveAddBtn').addEventListener('click', addTicket);
  document.getElementById('deleteMenuBtn').addEventListener('click', deleteSelectedTicket);
  document.getElementById('editTitleMenuBtn').addEventListener('click', openEditTitleModal);
  document.getElementById('editRequesterMenuBtn').addEventListener('click', openEditRequesterModal);
  document.getElementById('editDescriptionMenuBtn').addEventListener('click', openEditDescriptionModal);
  document.getElementById('moveSupportBtn').addEventListener('click', moveSelectedTicketToSupport);
  document.getElementById('cancelEditTitleBtn').addEventListener('click', closeEditTitleModal);
  document.getElementById('saveEditTitleBtn').addEventListener('click', saveEditedTitle);
  document.getElementById('cancelEditRequesterBtn').addEventListener('click', closeEditRequesterModal);
  document.getElementById('saveEditRequesterBtn').addEventListener('click', saveEditedRequester);
  document.getElementById('cancelEditDescriptionBtn').addEventListener('click', closeEditDescriptionModal);
  document.getElementById('saveEditDescriptionBtn').addEventListener('click', saveEditedDescription);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteConfirm);
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteTicket);

  document.getElementById('doneCards').addEventListener('click', (event) => { const card = event.target.closest('.card'); if (card) openDetail(card.dataset.id); });
  document.getElementById('doneCards').addEventListener('contextmenu', (event) => { const card = event.target.closest('.card'); if (card) openContextMenu(event, card.dataset.id); });
  document.getElementById('detailBackdrop').addEventListener('click', closeDetail);
  document.getElementById('detailModal').addEventListener('click', (event) => event.stopPropagation());
  addBackdropClose('csvToolsBackdrop', closeCsvTools);
  addBackdropClose('csvImportConfirmBackdrop', closeCsvImportConfirm);
  addBackdropClose('modalBackdrop', closeModal);
  addBackdropClose('editTitleBackdrop', closeEditTitleModal);
  addBackdropClose('editRequesterBackdrop', closeEditRequesterModal);
  addBackdropClose('editDescriptionBackdrop', closeEditDescriptionModal);
  addBackdropClose('deleteConfirmBackdrop', closeDeleteConfirm);
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeContextMenu(); closeDetail(); closeModal(); closeEditTitleModal(); closeEditRequesterModal(); closeEditDescriptionModal(); closeDeleteConfirm(); closeCsvTools(); closeCsvImportConfirm(); } });
  document.getElementById('editTitleInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveEditedTitle(); if (event.key === 'Escape') closeEditTitleModal(); });
  document.getElementById('editRequesterInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveEditedRequester(); if (event.key === 'Escape') closeEditRequesterModal(); });
  document.getElementById('editDescriptionInput').addEventListener('keydown', (event) => { if (event.key === 'Escape') closeEditDescriptionModal(); if (event.key === 'Enter' && event.ctrlKey) saveEditedDescription(); });

  runTests();
});

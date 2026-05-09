'use strict';

const APP_VERSION = '1.0.08.05.26';
const STORAGE_KEY = 'pj1_tickets_cache_v2';
const LOGIN_URL = '/index.html';

const LIMITS = Object.freeze({ title: 90, requester: 60, description: 800 });
let statuses = [
  { codigo: 'concluido', nome: 'Concluído', cor: '#39d98a', ordem: 10, protegido: true },
  { codigo: 'andamento', nome: 'Em andamento', cor: '#6ea8ff', ordem: 20, protegido: true },
  { codigo: 'pendente', nome: 'Pendente - Conferir descrição', cor: '#f5c542', ordem: 30, protegido: true },
  { codigo: 'suporte', nome: 'Aguardando suporte', cor: '#ff6b6b', ordem: 40, protegido: true }
];

let tickets = [];
let selectedTicketId = null;
let detailCloseTimer = null;
let toastTimer = null;
let realtimeClient = null;
let realtimeChannel = null;
let currentUser = null;
let searchOpen = false;

function getStatusInfo(status) {
  return statuses.find((item) => item.codigo === status) || statuses[0];
}

function getStatusStyle(status) {
  const info = getStatusInfo(status);
  return `style="color: ${escapeHtml(info.cor || '#8c96a8')}"`;
}

function getCompletedByText(ticket) {
  const normalized = normalizeTicket(ticket);

  if (normalized.status !== 'concluido' || !normalized.concluido_por_nome) {
    return '';
  }

  return ` por: ${normalized.concluido_por_nome}`;
}

function isValidStatus(status) {
  return statuses.some((item) => item.codigo === status);
}

function renderStatusOptions(selectId, selectedValue = 'concluido', options = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const list = options.exclude
    ? statuses.filter((item) => !options.exclude.includes(item.codigo))
    : statuses;

  select.innerHTML = list
    .map((item) => `<option value="${escapeHtml(item.codigo)}">${escapeHtml(item.nome)}</option>`)
    .join('');

  if (list.some((item) => item.codigo === selectedValue)) {
    select.value = selectedValue;
  } else if (list[0]) {
    select.value = list[0].codigo;
  }
}

function brDateToInputDate(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function inputDateToBrDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getFilteredTickets() {
  const filter = document.getElementById('searchFilter')?.value || 'titulo';
  const term = normalizeSearchValue(document.getElementById('searchInput')?.value || '');

  if (!term) return tickets;

  return tickets.filter((ticket) => {
    const normalized = normalizeTicket(ticket);
    const statusText = getStatusInfo(normalized.status).nome;

    const searchMap = {
      titulo: normalized.titulo,
      solicitante: normalized.solicitante,
      status: statusText,
      data: normalized.data
    };

    return normalizeSearchValue(searchMap[filter] || '').includes(term);
  });
}

function syncSearchUi() {
  const actions = document.querySelector('.search-actions');
  const box = document.getElementById('searchBox');
  const input = document.getElementById('searchInput');

  if (!actions || !box || !input) return;

  actions.classList.toggle('is-open', searchOpen);
  box.classList.toggle('has-value', Boolean(input.value.trim()));
}

function toggleSearch() {
  searchOpen = !searchOpen;
  syncSearchUi();

  if (searchOpen) {
    setTimeout(() => document.getElementById('searchInput').focus(), 120);
    return;
  }

  const input = document.getElementById('searchInput');
  input.value = '';
  render();
  syncSearchUi();
}


function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeDescription(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LIMITS.description);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeTicket(raw) {
  return {
    id: sanitizeText(raw.id, 80) || crypto.randomUUID(),
    titulo: sanitizeText(raw.titulo, LIMITS.title) || 'Sem título',
    descricao: sanitizeDescription(raw.descricao) || 'Sem descrição informada.',
    solicitante: sanitizeText(raw.solicitante, LIMITS.requester) || 'Não informado',
    data: sanitizeText(raw.data, 10) || new Date().toLocaleDateString('pt-BR'),
    status: isValidStatus(raw.status) ? raw.status : 'concluido',
    criado_por: raw.criado_por || null,
    atualizado_por: raw.atualizado_por || null,
    criado_em: raw.criado_em || null,
    atualizado_em: raw.atualizado_em || null,
    concluido_por: raw.concluido_por || null,
    concluido_por_nome: sanitizeText(raw.concluido_por_nome, 80) || '',
    destacado: Boolean(raw.destacado),
    isNew: Boolean(raw.isNew)
  };
}

function getStatusPriority(status) {
  const priorityMap = {
    pendente: 0,
    suporte: 1,
    andamento: 2,
    concluido: 9
  };

  return Object.prototype.hasOwnProperty.call(priorityMap, status)
    ? priorityMap[status]
    : 3;
}

function sortTickets() {
  tickets.sort((a, b) => {
    const statusDiff = getStatusPriority(a.status) - getStatusPriority(b.status);

    if (statusDiff !== 0) return statusDiff;

    const aTime = Date.parse(a.criado_em || '') || 0;
    const bTime = Date.parse(b.criado_em || '') || 0;

    return bTime - aTime;
  });
}

function loadCachedTickets() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) return stored.map(normalizeTicket);
  } catch {}
  return [];
}

function saveTicketsCache() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tickets.map(({ isNew, ...ticket }) => ticket))
  );
}

function getTicketById(id) {
  return tickets.find((ticket) => ticket.id === id) || null;
}

function upsertTicket(ticket, markNew = false) {
  const normalized = normalizeTicket(ticket);
  const index = tickets.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    tickets[index] = {
      ...tickets[index],
      ...normalized,
      isNew: markNew || tickets[index].isNew
    };
  } else {
    tickets.unshift({ ...normalized, isNew: markNew });
  }

  sortTickets();
  saveTicketsCache();
  render();

  if (markNew) {
    setTimeout(() => {
      const current = getTicketById(normalized.id);
      if (current) current.isNew = false;
      render();
      saveTicketsCache();
    }, 1400);
  }
}

function removeTicket(id) {
  const before = tickets.length;
  tickets = tickets.filter((ticket) => ticket.id !== id);
  if (tickets.length !== before) {
    saveTicketsCache();
    render();
  }
}

function buildCardHtml(item, index) {
  const ticket = normalizeTicket(item);
  const statusInfo = getStatusInfo(ticket.status);

  return [
    '<article class="card ', ticket.isNew ? 'new-card ' : '', ticket.destacado ? 'highlighted' : '', '" style="animation-delay: ', Math.min(index * 35, 240), 'ms" data-id="', escapeHtml(ticket.id), '" title="Clique para ver o chamado completo">',
      '<div class="card-head"><h3 class="card-title">', escapeHtml(ticket.titulo), '</h3><span class="card-date">', escapeHtml(ticket.data), '</span></div>',
      '<div class="meta"><span class="requester"><strong class="requester-name">', escapeHtml(ticket.solicitante), '</strong><span class="meta-separator">,</span></span><span class="status" ', getStatusStyle(ticket.status), '>', escapeHtml(statusInfo.nome), escapeHtml(getCompletedByText(ticket)), '</span></div>',
      '<span class="card-open-hint" aria-hidden="true"></span>',
    '</article>'
  ].join('');
}

function render() {
  const container = document.getElementById('doneCards');
  const visibleTickets = getFilteredTickets();

  container.innerHTML = visibleTickets.length
    ? visibleTickets.map(buildCardHtml).join('')
    : '<div class="empty">Nenhum chamado encontrado.</div>';
}

function notify(text) {
  const toast = document.getElementById('toast');
  toast.textContent = sanitizeText(text, 120);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openBackdrop(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('is-open');
}

function closeBackdrop(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('is-open');
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Erro de comunicação com o servidor');
  }

  return data;
}

async function loadStatuses() {
  try {
    const data = await apiRequest('/api/statuses', { method: 'GET' });

    if (Array.isArray(data.statuses) && data.statuses.length) {
      statuses = data.statuses.map((item) => ({
        codigo: sanitizeText(item.codigo, 60),
        nome: sanitizeText(item.nome, 50),
        cor: /^#[0-9a-fA-F]{6}$/.test(item.cor || '') ? item.cor : '#8c96a8',
        ordem: Number(item.ordem || 100),
        protegido: Boolean(item.protegido)
      }));
    }

    renderStatusOptions('newStatus', 'concluido');
    renderStatusOptions('statusChangeSelect', 'andamento', { exclude: ['pendente'] });
  } catch {
    notify('Não foi possível carregar a lista de status.');
  }
}

function renderStatusList() {
  const list = document.getElementById('statusList');
  if (!list) return;

  list.innerHTML = statuses.map((item) => [
    '<div class="status-list-item">',
      '<span class="status-list-left">',
        '<span class="status-color-dot" style="background:', escapeHtml(item.cor), '"></span>',
        '<span class="status-list-name">', escapeHtml(item.nome), '</span>',
      '</span>',
      item.protegido ? '<span class="status-lock">padrão</span>' : '<span class="status-lock">custom</span>',
    '</div>'
  ].join('')).join('');
}

function renderStatusRemoveList() {
  const list = document.getElementById('statusRemoveList');
  if (!list) return;

  list.innerHTML = statuses.map((item) => [
    '<div class="status-remove-item">',
      '<span class="status-remove-left">',
        '<span class="status-color-dot" style="background:', escapeHtml(item.cor), '"></span>',
        '<span class="status-remove-name">', escapeHtml(item.nome), '</span>',
      '</span>',
      '<button class="status-remove-btn" type="button" data-status-code="', escapeHtml(item.codigo), '" ', item.protegido ? 'disabled title="Status padrão não pode ser removido"' : 'title="Remover status"', '>×</button>',
    '</div>'
  ].join('')).join('');
}

function openStatusManager() {
  openBackdrop('statusManagerBackdrop');
}

function closeStatusManager() {
  closeBackdrop('statusManagerBackdrop');
}

function openStatusList() {
  renderStatusList();
  closeStatusManager();
  openBackdrop('statusListBackdrop');
}

function closeStatusList() {
  closeBackdrop('statusListBackdrop');
}

function openStatusManage() {
  renderStatusRemoveList();
  closeStatusManager();
  openBackdrop('statusManageBackdrop');
}

function closeStatusManage() {
  closeBackdrop('statusManageBackdrop');
  document.getElementById('newStatusName').value = '';
  document.getElementById('newStatusColor').value = '#8c96a8';
  document.getElementById('newStatusColorText').textContent = '#8c96a8';
}

async function addCustomStatus() {
  const nome = sanitizeText(document.getElementById('newStatusName').value, 50);
  const cor = document.getElementById('newStatusColor').value;

  if (!nome) {
    notify('Informe o nome do status.');
    return;
  }

  try {
    const data = await apiRequest('/api/statuses', {
      method: 'POST',
      body: JSON.stringify({ nome, cor })
    });

    if (Array.isArray(data.statuses)) {
      statuses = data.statuses;
    } else if (data.status) {
      statuses.push(data.status);
    }

    renderStatusOptions('newStatus', data.status?.codigo || 'concluido');
    renderStatusOptions('statusChangeSelect', 'andamento', { exclude: ['pendente'] });
    renderStatusRemoveList();
    render();
    document.getElementById('newStatusName').value = '';
    notify('Status adicionado.');
  } catch (error) {
    notify(error.message || 'Erro ao adicionar status.');
  }
}

let pendingStatusDeleteCode = null;

function askRemoveStatus(codigo) {
  const status = statuses.find((item) => item.codigo === codigo);
  if (!status || status.protegido) return;

  pendingStatusDeleteCode = codigo;
  document.getElementById('statusDeleteConfirmText').textContent =
    `Tem certeza que deseja remover o status "${status.nome}"?`;
  openBackdrop('statusDeleteConfirmBackdrop');
}

function closeStatusDeleteConfirm() {
  closeBackdrop('statusDeleteConfirmBackdrop');
  pendingStatusDeleteCode = null;
}

async function confirmRemoveStatus() {
  if (!pendingStatusDeleteCode) return;

  try {
    const data = await apiRequest('/api/statuses', {
      method: 'DELETE',
      body: JSON.stringify({ codigo: pendingStatusDeleteCode })
    });

    if (Array.isArray(data.statuses)) {
      statuses = data.statuses;
    } else {
      statuses = statuses.filter((item) => item.codigo !== pendingStatusDeleteCode);
    }

    renderStatusOptions('newStatus', 'concluido');
    renderStatusOptions('statusChangeSelect', 'andamento', { exclude: ['pendente'] });
    renderStatusRemoveList();
    render();
    closeStatusDeleteConfirm();
    notify('Status removido.');
  } catch (error) {
    notify(error.message || 'Erro ao remover status.');
  }
}

async function loadTicketsFromServer() {
  try {
    const data = await apiRequest('/api/tickets', { method: 'GET' });
    tickets = Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [];
    sortTickets();
    saveTicketsCache();
    render();
  } catch {
    notify('Não foi possível carregar chamados do Supabase. Exibindo cache local.');
  }
}

function openModal() {
  openBackdrop('modalBackdrop');
  setTimeout(() => document.getElementById('newTitle').focus(), 120);
}

function closeModal() {
  closeBackdrop('modalBackdrop');
  document.getElementById('newTitle').value = '';
  document.getElementById('newDesc').value = '';
  document.getElementById('newPerson').value = '';
  document.getElementById('newStatus').value = 'concluido';
}

async function addTicket() {
  const titulo = sanitizeText(document.getElementById('newTitle').value, LIMITS.title);
  const descricao = sanitizeDescription(document.getElementById('newDesc').value);
  const solicitante = sanitizeText(document.getElementById('newPerson').value, LIMITS.requester) || 'Não informado';
  const status = document.getElementById('newStatus').value;
  const data = new Date().toLocaleDateString('pt-BR');

  if (!titulo || !descricao) return notify('Preencha título e descrição.');
  if (!isValidStatus(status)) return notify('Status inválido.');

  try {
    const result = await apiRequest('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ titulo, descricao, solicitante, status, data })
    });

    upsertTicket(result.ticket, true);
    closeModal();
    notify('Chamado adicionado.');
  } catch (error) {
    notify(error.message || 'Erro ao adicionar chamado.');
  }
}

function openDetail(id) {
  const ticket = getTicketById(id);
  if (!ticket) return;

  selectedTicketId = id;
  const statusInfo = getStatusInfo(ticket.status);
  const finishButton = ticket.status === 'andamento' || ticket.status === 'suporte'
    ? '<button class="finish-btn" id="finishTicketBtn" type="button" title="Finalizar chamado" aria-label="Finalizar chamado"></button>'
    : '';

  document.getElementById('detailContent').innerHTML = [
    '<div class="detail-top"><h2 class="detail-title">', escapeHtml(ticket.titulo), '</h2><span class="detail-date">', escapeHtml(ticket.data), '</span></div>',
    '<div class="detail-desc">', escapeHtml(ticket.descricao), '</div>',
    '<div class="detail-meta"><span class="requester">Solicitado por: <strong class="requester-name">', escapeHtml(ticket.solicitante), '</strong>', ticket.status === 'concluido' && ticket.concluido_por_nome ? '<span class="meta-separator">,</span> Concluído por <strong class="requester-name">' + escapeHtml(ticket.concluido_por_nome) + '</strong>' : '', '</span><span class="detail-status-wrap"><span class="status" ', getStatusStyle(ticket.status), '>', escapeHtml(statusInfo.nome), '</span>', finishButton, '</span></div>'
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

async function updateTicket(id, patch, successMessage) {
  try {
    const result = await apiRequest('/api/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch })
    });

    upsertTicket(result.ticket, true);
    if (successMessage) notify(successMessage);
    return true;
  } catch (error) {
    notify(error.message || 'Erro ao atualizar chamado.');
    return false;
  }
}

async function finishTicket(event, id) {
  event.stopPropagation();
  const ok = await updateTicket(id, { status: 'concluido' }, 'Chamado finalizado como concluído.');
  if (ok) closeDetail();
}

function openContextMenu(event, id) {
  event.preventDefault();
  event.stopPropagation();

  const ticket = getTicketById(id);
  if (!ticket) return;

  selectedTicketId = id;
  document.getElementById('changeStatusBtn').classList.toggle('is-hidden', ticket.status !== 'pendente');
  document.getElementById('toggleHighlightBtn').textContent = ticket.destacado ? 'Remover destaque' : 'Destacar chamado';

  const menu = document.getElementById('contextMenu');
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  menu.classList.add('is-open');

  const rect = menu.getBoundingClientRect();
  const padding = 10;

  if (rect.right > window.innerWidth - padding) {
    menu.style.left = (window.innerWidth - rect.width - padding) + 'px';
  }

  if (rect.bottom > window.innerHeight - padding) {
    menu.style.top = (window.innerHeight - rect.height - padding) + 'px';
  }
}

function closeContextMenu() {
  document.getElementById('contextMenu').classList.remove('is-open');
}

function getSelectedTicket() {
  return selectedTicketId ? getTicketById(selectedTicketId) : null;
}

function deleteSelectedTicket() {
  if (!getSelectedTicket()) return;
  closeContextMenu();
  openBackdrop('deleteConfirmBackdrop');
}

function closeDeleteConfirm() {
  closeBackdrop('deleteConfirmBackdrop');
}

async function confirmDeleteTicket() {
  const selected = getSelectedTicket();
  if (!selected) return;

  try {
    await apiRequest('/api/tickets', {
      method: 'DELETE',
      body: JSON.stringify({ id: selected.id })
    });

    removeTicket(selected.id);
    selectedTicketId = null;
    closeDeleteConfirm();
    closeDetail();
    notify('Chamado excluído.');
  } catch (error) {
    notify(error.message || 'Erro ao excluir chamado.');
  }
}

function openStatusChangeModal() {
  const ticket = getSelectedTicket();
  if (!ticket || ticket.status !== 'pendente') return;

  renderStatusOptions('statusChangeSelect', 'andamento', { exclude: ['pendente'] });

  closeContextMenu();
  openBackdrop('statusChangeBackdrop');
  setTimeout(() => document.getElementById('statusChangeSelect').focus(), 120);
}

function closeStatusChangeModal() {
  closeBackdrop('statusChangeBackdrop');
  renderStatusOptions('statusChangeSelect', 'andamento', { exclude: ['pendente'] });
}

async function saveStatusChange() {
  const ticket = getSelectedTicket();
  if (!ticket || ticket.status !== 'pendente') return;

  const status = document.getElementById('statusChangeSelect').value;

  if (!isValidStatus(status) || status === 'pendente') {
    notify('Status inválido.');
    return;
  }

  const info = getStatusInfo(status);
  const ok = await updateTicket(ticket.id, { status }, `Status alterado para ${info.nome}.`);
  if (ok) closeStatusChangeModal();
}


async function toggleSelectedHighlight() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const destacado = !ticket.destacado;
  const ok = await updateTicket(
    ticket.id,
    { destacado },
    destacado ? 'Chamado destacado.' : 'Destaque removido.'
  );

  if (ok) closeContextMenu();
}

function openEditTitleModal() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const input = document.getElementById('editTitleInput');
  input.value = ticket.titulo;
  closeContextMenu();
  openBackdrop('editTitleBackdrop');
  setTimeout(() => { input.focus(); input.select(); }, 120);
}

function closeEditTitleModal() {
  closeBackdrop('editTitleBackdrop');
  document.getElementById('editTitleInput').value = '';
}

async function saveEditedTitle() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const value = sanitizeText(document.getElementById('editTitleInput').value, LIMITS.title);
  if (!value) return notify('Informe um título.');

  const ok = await updateTicket(ticket.id, { titulo: value }, 'Título atualizado.');
  if (ok) closeEditTitleModal();
}

function openEditRequesterModal() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const input = document.getElementById('editRequesterInput');
  input.value = ticket.solicitante;
  closeContextMenu();
  openBackdrop('editRequesterBackdrop');
  setTimeout(() => { input.focus(); input.select(); }, 120);
}

function closeEditRequesterModal() {
  closeBackdrop('editRequesterBackdrop');
  document.getElementById('editRequesterInput').value = '';
}

async function saveEditedRequester() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const value = sanitizeText(document.getElementById('editRequesterInput').value, LIMITS.requester);
  if (!value) return notify('Informe o solicitante.');

  const ok = await updateTicket(ticket.id, { solicitante: value }, 'Solicitante atualizado.');
  if (ok) closeEditRequesterModal();
}

function openEditDescriptionModal() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const input = document.getElementById('editDescriptionInput');
  input.value = ticket.descricao;
  closeContextMenu();
  openBackdrop('editDescriptionBackdrop');
  setTimeout(() => { input.focus(); input.select(); }, 120);
}

function closeEditDescriptionModal() {
  closeBackdrop('editDescriptionBackdrop');
  document.getElementById('editDescriptionInput').value = '';
}

async function saveEditedDescription() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const value = sanitizeDescription(document.getElementById('editDescriptionInput').value);
  if (!value) return notify('Informe a descrição.');

  const ok = await updateTicket(ticket.id, { descricao: value }, 'Descrição atualizada.');
  if (ok) closeEditDescriptionModal();
}


function openEditDateModal() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const input = document.getElementById('editDateInput');
  input.value = brDateToInputDate(ticket.data) || new Date().toISOString().slice(0, 10);
  closeContextMenu();
  openBackdrop('editDateBackdrop');
  setTimeout(() => { input.focus(); input.showPicker?.(); }, 120);
}

function closeEditDateModal() {
  closeBackdrop('editDateBackdrop');
  document.getElementById('editDateInput').value = '';
}

async function saveEditedDate() {
  const ticket = getSelectedTicket();
  if (!ticket) return;

  const value = inputDateToBrDate(document.getElementById('editDateInput').value);
  if (!value) return notify('Informe uma data válida.');

  const ok = await updateTicket(ticket.id, { data: value }, 'Data atualizada.');
  if (ok) closeEditDateModal();
}

function addBackdropClose(id, closeFn) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener('click', (event) => {
    if (event.target.id === id) closeFn();
  });
}

async function requireSession() {
  const res = await fetch('/api/session', { credentials: 'same-origin' });

  if (!res.ok) {
    window.location.href = LOGIN_URL;
    return null;
  }

  const data = await res.json();
  currentUser = data.user;
  document.getElementById('userName').textContent = currentUser.nome || currentUser.login || 'TI';

  return currentUser;
}

async function setupRealtime() {
  const response = await fetch('/api/config', { credentials: 'same-origin' });

  if (!response.ok) {
    notify('Realtime indisponível.');
    return;
  }

  const config = await response.json();

  if (!window.supabase) {
    notify('Biblioteca Supabase não carregou.');
    return;
  }

  realtimeClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  realtimeChannel = realtimeClient
    .channel('pj1-tickets-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pj1_tickets' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        removeTicket(payload.old.id);
        return;
      }

      if (payload.new && payload.new.deletado === true) {
        removeTicket(payload.new.id);
        return;
      }

      if (payload.new) {
        upsertTicket(payload.new, true);
      }
    })
    .subscribe();
}

function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  const userButton = document.getElementById('loggedUser');
  const isOpen = menu.classList.toggle('is-open');
  userButton.setAttribute('aria-expanded', String(isOpen));
}

function closeUserMenu() {
  const menu = document.getElementById('userMenu');
  const userButton = document.getElementById('loggedUser');

  if (!menu) return;

  menu.classList.remove('is-open');

  if (userButton) {
    userButton.setAttribute('aria-expanded', 'false');
  }
}

async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
  } catch {}

  window.location.href = LOGIN_URL;
}

function isTypingTarget(target) {
  if (!target) return false;

  const tag = String(target.tagName || '').toLowerCase();

  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

function isBackdropOpen(id) {
  const el = document.getElementById(id);
  return Boolean(el && el.classList.contains('is-open'));
}

function handleGlobalHotkeys(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (isTypingTarget(event.target)) return;

  const key = event.key.toLowerCase();

  if (key === 'n') {
    event.preventDefault();
    closeContextMenu();
    closeUserMenu();
    openModal();
    return;
  }

  if (event.key === 'Delete') {
    event.preventDefault();

    if (!isBackdropOpen('detailBackdrop') || !getSelectedTicket()) {
      notify('Abra um chamado para excluir com DEL.');
      return;
    }

    deleteSelectedTicket();
  }
}


function runTests() {
  console.assert(getStatusInfo('suporte').nome === 'Aguardando suporte', 'Teste status suporte falhou');
  console.assert(getStatusInfo('pendente').nome === 'Pendente - Conferir descrição', 'Teste status pendente falhou');
  console.assert(escapeHtml('<x>') === '&lt;x&gt;', 'Teste escapeHtml falhou');
  console.assert(sanitizeText('  a   b  ', 20) === 'a b', 'Teste sanitizeText falhou');
  console.assert(isValidStatus('hack') === false, 'Teste status inválido falhou');
  console.assert(normalizeTicket({ destacado: true }).destacado === true, 'Teste destacado falhou');
  console.assert(getCompletedByText({ status: 'concluido', concluido_por_nome: 'TIMC1' }).includes('TIMC1'), 'Teste concluido por falhou');
  console.assert(getStatusPriority('pendente') < getStatusPriority('concluido'), 'Teste prioridade pendente falhou');
  console.assert(getStatusPriority('suporte') < getStatusPriority('concluido'), 'Teste prioridade suporte falhou');
  console.assert(getStatusPriority('andamento') < getStatusPriority('concluido'), 'Teste prioridade andamento falhou');
  console.assert(getStatusStyle('concluido').includes('#39d98a'), 'Teste cor status falhou');
  console.assert(normalizeSearchValue('ÁÉÍ') === 'aei', 'Teste normalizeSearchValue falhou');
  console.assert(inputDateToBrDate('2026-05-09') === '09/05/2026', 'Teste data input falhou');
  console.assert(brDateToInputDate('09/05/2026') === '2026-05-09', 'Teste data BR falhou');
  console.assert(isTypingTarget(document.createElement('input')) === true, 'Teste hotkey typing target falhou');
  console.assert(normalizeSearchValue('09/05/2026').includes('09'), 'Teste busca por data falhou');
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireSession();

  await loadStatuses();

  tickets = loadCachedTickets();
  sortTickets();
  render();

  await loadTicketsFromServer();
  setupRealtime();

  document.getElementById('loggedUser').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleUserMenu();
  });

  document.getElementById('logoutBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    logout();
  });

  document.getElementById('searchBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSearch();
  });

  document.getElementById('searchInput').addEventListener('input', () => {
    searchOpen = true;
    syncSearchUi();
    render();
  });

  document.getElementById('searchFilter').addEventListener('change', () => {
    searchOpen = true;
    syncSearchUi();
    render();
    document.getElementById('searchInput').focus();
  });

  document.getElementById('searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById('searchInput').value = '';
      searchOpen = false;
      syncSearchUi();
      render();
    }
  });

  document.getElementById('statusManagerBtn').addEventListener('click', openStatusManager);
  document.getElementById('cancelStatusManagerBtn').addEventListener('click', closeStatusManager);
  document.getElementById('listStatusesBtn').addEventListener('click', openStatusList);
  document.getElementById('manageStatusesBtn').addEventListener('click', openStatusManage);
  document.getElementById('closeStatusListBtn').addEventListener('click', closeStatusList);
  document.getElementById('closeStatusManageBtn').addEventListener('click', closeStatusManage);
  document.getElementById('saveNewStatusBtn').addEventListener('click', addCustomStatus);
  document.getElementById('cancelStatusDeleteBtn').addEventListener('click', closeStatusDeleteConfirm);
  document.getElementById('confirmStatusDeleteBtn').addEventListener('click', confirmRemoveStatus);
  document.getElementById('newStatusColor').addEventListener('input', (event) => {
    document.getElementById('newStatusColorText').textContent = event.target.value;
  });
  document.getElementById('statusRemoveList').addEventListener('click', (event) => {
    const btn = event.target.closest('.status-remove-btn');
    if (!btn) return;
    askRemoveStatus(btn.dataset.statusCode);
  });

  document.getElementById('addTicketBtn').addEventListener('click', openModal);
  document.getElementById('cancelAddBtn').addEventListener('click', closeModal);
  document.getElementById('saveAddBtn').addEventListener('click', addTicket);

  document.getElementById('deleteMenuBtn').addEventListener('click', deleteSelectedTicket);
  document.getElementById('editTitleMenuBtn').addEventListener('click', openEditTitleModal);
  document.getElementById('editRequesterMenuBtn').addEventListener('click', openEditRequesterModal);
  document.getElementById('editDescriptionMenuBtn').addEventListener('click', openEditDescriptionModal);
  document.getElementById('editDateMenuBtn').addEventListener('click', openEditDateModal);
  document.getElementById('changeStatusBtn').addEventListener('click', openStatusChangeModal);
  document.getElementById('toggleHighlightBtn').addEventListener('click', toggleSelectedHighlight);

  document.getElementById('cancelEditTitleBtn').addEventListener('click', closeEditTitleModal);
  document.getElementById('saveEditTitleBtn').addEventListener('click', saveEditedTitle);
  document.getElementById('cancelEditRequesterBtn').addEventListener('click', closeEditRequesterModal);
  document.getElementById('saveEditRequesterBtn').addEventListener('click', saveEditedRequester);
  document.getElementById('cancelEditDescriptionBtn').addEventListener('click', closeEditDescriptionModal);
  document.getElementById('saveEditDescriptionBtn').addEventListener('click', saveEditedDescription);
  document.getElementById('cancelEditDateBtn').addEventListener('click', closeEditDateModal);
  document.getElementById('saveEditDateBtn').addEventListener('click', saveEditedDate);

  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteConfirm);
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteTicket);
  document.getElementById('cancelStatusChangeBtn').addEventListener('click', closeStatusChangeModal);
  document.getElementById('saveStatusChangeBtn').addEventListener('click', saveStatusChange);

  document.getElementById('doneCards').addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });

  document.getElementById('doneCards').addEventListener('contextmenu', (event) => {
    const card = event.target.closest('.card');
    if (card) openContextMenu(event, card.dataset.id);
  });

  document.getElementById('detailBackdrop').addEventListener('click', closeDetail);
  document.getElementById('detailModal').addEventListener('click', (event) => event.stopPropagation());

  addBackdropClose('statusManagerBackdrop', closeStatusManager);
  addBackdropClose('statusListBackdrop', closeStatusList);
  addBackdropClose('statusManageBackdrop', closeStatusManage);
  addBackdropClose('statusDeleteConfirmBackdrop', closeStatusDeleteConfirm);
  addBackdropClose('modalBackdrop', closeModal);
  addBackdropClose('editTitleBackdrop', closeEditTitleModal);
  addBackdropClose('editRequesterBackdrop', closeEditRequesterModal);
  addBackdropClose('editDescriptionBackdrop', closeEditDescriptionModal);
  addBackdropClose('editDateBackdrop', closeEditDateModal);
  addBackdropClose('deleteConfirmBackdrop', closeDeleteConfirm);
  addBackdropClose('statusChangeBackdrop', closeStatusChangeModal);

  document.addEventListener('click', () => {
    closeContextMenu();
    closeUserMenu();
  });
  document.addEventListener('keydown', handleGlobalHotkeys);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContextMenu();
      closeUserMenu();
      closeDetail();
      closeModal();
      closeEditTitleModal();
      closeEditRequesterModal();
      closeEditDescriptionModal();
      closeEditDateModal();
      closeDeleteConfirm();
      closeStatusChangeModal();
      closeStatusManager();
      closeStatusList();
      closeStatusManage();
      closeStatusDeleteConfirm();
      searchOpen = false;
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      syncSearchUi();
    }
  });

  document.getElementById('editTitleInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveEditedTitle();
    if (event.key === 'Escape') closeEditTitleModal();
  });

  document.getElementById('editRequesterInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveEditedRequester();
    if (event.key === 'Escape') closeEditRequesterModal();
  });

  document.getElementById('editDescriptionInput').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeEditDescriptionModal();
    if (event.key === 'Enter' && event.ctrlKey) saveEditedDescription();
  });

  document.getElementById('editDateInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveEditedDate();
    if (event.key === 'Escape') closeEditDateModal();
  });

  document.getElementById('statusChangeSelect').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveStatusChange();
    if (event.key === 'Escape') closeStatusChangeModal();
  });

  runTests();
});

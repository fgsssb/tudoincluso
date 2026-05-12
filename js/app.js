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
let searchPresetElement = null;
let searchDateElement = null;

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

  return ` por ${normalized.concluido_por_nome}`;
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

function getSearchTermByFilter(filter) {
  if (filter === 'status') {
    return document.getElementById('searchPresetSelect')?.value || '';
  }

  if (filter === 'data') {
    return inputDateToBrDate(document.getElementById('searchDateInput')?.value || '');
  }

  if (filter === 'destacado') {
    return 'true';
  }

  return document.getElementById('searchInput')?.value || '';
}

function getFilteredTickets() {
  const filter = document.getElementById('searchFilter')?.value || 'titulo';
  const rawTerm = getSearchTermByFilter(filter);
  const term = normalizeSearchValue(rawTerm);

  if (filter === 'destacado') {
    return tickets.filter((ticket) => Boolean(normalizeTicket(ticket).destacado));
  }

  if (!term) return tickets;

  return tickets.filter((ticket) => {
    const normalized = normalizeTicket(ticket);
    const statusText = getStatusInfo(normalized.status).nome;

    const searchMap = {
      titulo: normalized.titulo,
      solicitante: normalized.solicitante,
      status: normalized.status,
      data: normalized.data,
      status_nome: statusText
    };

    if (filter === 'status') {
      return normalized.status === rawTerm;
    }

    return normalizeSearchValue(searchMap[filter] || '').includes(term);
  });
}

function ensureSearchFilterOptions() {
  const filter = document.getElementById('searchFilter');
  if (!filter) return;

  const existingValues = Array.from(filter.options).map((option) => option.value);

  const optionsToAdd = [
    { value: 'data', label: 'Data' },
    { value: 'destacado', label: 'Destacados' }
  ];

  optionsToAdd.forEach((item) => {
    if (existingValues.includes(item.value)) return;

    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    filter.appendChild(option);
  });
}

function baseSearchFieldStyle(element) {
  element.style.gridColumn = '2 / 3';
  element.style.gridRow = '1';
  element.style.width = '100%';
  element.style.height = '40px';
  element.style.minWidth = '0';
  element.style.border = '1px solid var(--line)';
  element.style.borderLeft = '0';
  element.style.borderRadius = '0 10px 10px 0';
  element.style.background = 'var(--surface)';
  element.style.color = 'var(--text)';
  element.style.padding = '0 12px';
  element.style.outline = 'none';
  element.style.font = 'inherit';
  element.style.fontSize = '13px';
}

function ensureSearchPresetControls() {
  const box = document.getElementById('searchBox');
  const input = document.getElementById('searchInput');

  if (!box || !input) return;

  if (!searchPresetElement) {
    searchPresetElement = document.createElement('select');
    searchPresetElement.id = 'searchPresetSelect';
    searchPresetElement.setAttribute('aria-label', 'Valor do filtro');
    baseSearchFieldStyle(searchPresetElement);
    searchPresetElement.style.display = 'none';
    box.appendChild(searchPresetElement);

    searchPresetElement.addEventListener('change', () => {
      searchOpen = true;
      syncSearchUi();
      render();
    });
  }

  if (!searchDateElement) {
    searchDateElement = document.createElement('input');
    searchDateElement.id = 'searchDateInput';
    searchDateElement.type = 'date';
    searchDateElement.setAttribute('aria-label', 'Data do filtro');
    baseSearchFieldStyle(searchDateElement);
    searchDateElement.style.display = 'none';
    box.appendChild(searchDateElement);

    searchDateElement.addEventListener('input', () => {
      searchOpen = true;
      syncSearchUi();
      render();
    });

    searchDateElement.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearSearchControls();
      }
    });
  }
}

function renderSearchStatusOptions() {
  if (!searchPresetElement) return;

  const selectedValue = searchPresetElement.value;

  searchPresetElement.innerHTML = statuses
    .map((item) => `<option value="${escapeHtml(item.codigo)}">${escapeHtml(item.nome)}</option>`)
    .join('');

  const stillExists = statuses.some((item) => item.codigo === selectedValue);

  if (selectedValue && stillExists) {
    searchPresetElement.value = selectedValue;
    return;
  }

  if (statuses.length) {
    searchPresetElement.value = statuses[0].codigo;
  }
}

function renderSearchHighlightedOption() {
  if (!searchPresetElement) return;

  searchPresetElement.innerHTML = '<option value="true">Chamados destacados</option>';
}

function configureSearchMode() {
  ensureSearchFilterOptions();
  ensureSearchPresetControls();

  const filter = document.getElementById('searchFilter')?.value || 'titulo';
  const input = document.getElementById('searchInput');

  if (!input || !searchPresetElement || !searchDateElement) return;

  input.style.display = 'none';
  searchPresetElement.style.display = 'none';
  searchDateElement.style.display = 'none';

  if (filter === 'status') {
    renderSearchStatusOptions();
    searchPresetElement.style.display = 'block';
    return;
  }

  if (filter === 'destacado') {
    renderSearchHighlightedOption();
    searchPresetElement.style.display = 'block';
    return;
  }

  if (filter === 'data') {
    searchDateElement.style.display = 'block';
    return;
  }

  input.style.display = 'block';
}

function hasSearchValue() {
  const filter = document.getElementById('searchFilter')?.value || 'titulo';

  if (filter === 'status') return Boolean(document.getElementById('searchPresetSelect')?.value);
  if (filter === 'destacado') return true;
  if (filter === 'data') return Boolean(document.getElementById('searchDateInput')?.value);

  return Boolean(document.getElementById('searchInput')?.value.trim());
}

function clearSearchControls() {
  const filter = document.getElementById('searchFilter');
  const input = document.getElementById('searchInput');
  const dateInput = document.getElementById('searchDateInput');

  if (filter) filter.value = 'titulo';
  if (input) input.value = '';
  if (dateInput) dateInput.value = '';

  searchOpen = false;
  syncSearchUi();
  render();
}

function syncSearchUi() {
  const actions = document.querySelector('.search-actions');
  const box = document.getElementById('searchBox');

  if (!actions || !box) return;

  configureSearchMode();

  actions.classList.toggle('is-open', searchOpen);
  box.classList.toggle('has-value', searchOpen && hasSearchValue());
}

function toggleSearch() {
  if (searchOpen || hasSearchValue()) {
    clearSearchControls();
    return;
  }

  searchOpen = true;
  syncSearchUi();

  setTimeout(() => {
    const filter = document.getElementById('searchFilter')?.value || 'titulo';

    if (filter === 'status' || filter === 'destacado') {
      document.getElementById('searchPresetSelect')?.focus();
      return;
    }

    if (filter === 'data') {
      document.getElementById('searchDateInput')?.focus();
      return;
    }

    document.getElementById('searchInput')?.focus();
  }, 120);
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
    renderStatusOptions('statusChangeSelect', 'andamento');
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
    renderStatusOptions('statusChangeSelect', 'andamento');
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
    renderStatusOptions('statusChangeSelect', 'andamento');
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
 

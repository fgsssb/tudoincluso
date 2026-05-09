'use strict';

const APP_VERSION = '1.0.08.05.26';
const STORAGE_KEY = 'pj1_tickets_cache_v2';
const LOGIN_URL = '/index.html';

const LIMITS = Object.freeze({ title: 90, requester: 60, description: 800 });
const ALLOWED_STATUSES = Object.freeze(['concluido', 'andamento', 'suporte']);

const statusMap = Object.freeze({
  concluido: { text: 'Concluído', className: 'done' },
  andamento: { text: 'Em andamento', className: 'progress' },
  suporte: { text: 'Aguardando suporte', className: 'support' }
});

let tickets = [];
let selectedTicketId = null;
let detailCloseTimer = null;
let toastTimer = null;
let realtimeClient = null;
let realtimeChannel = null;
let currentUser = null;
async function requireSession() {
  const res = await fetch('/api/session', { credentials: 'same-origin' });

  if (!res.ok) {
    window.location.href = LOGIN_URL;
    return null;
  }

  const data = await res.json();
  currentUser = data.user;
  document.getElementById('userName').textContent = currentUser.nome || currentUser.login || 'TI';
  document.getElementById('userAvatar').firstChild.nodeValue = (currentUser.nome || currentUser.login || 'T').trim().charAt(0).toUpperCase();

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

function runTests() {
  console.assert(getStatusInfo('suporte').text === 'Aguardando suporte', 'Teste status suporte falhou');
  console.assert(escapeHtml('<x>') === '&lt;x&gt;', 'Teste escapeHtml falhou');
  console.assert(sanitizeText('  a   b  ', 20) === 'a b', 'Teste sanitizeText falhou');
  console.assert(isValidStatus('hack') === false, 'Teste status inválido falhou');
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireSession();

  tickets = loadCachedTickets();
  render();

  await loadTicketsFromServer();
  setupRealtime();


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

  addBackdropClose('modalBackdrop', closeModal);
  addBackdropClose('editTitleBackdrop', closeEditTitleModal);
  addBackdropClose('editRequesterBackdrop', closeEditRequesterModal);
  addBackdropClose('editDescriptionBackdrop', closeEditDescriptionModal);
  addBackdropClose('deleteConfirmBackdrop', closeDeleteConfirm);

  document.addEventListener('click', closeContextMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContextMenu();
      closeDetail();
      closeModal();
      closeEditTitleModal();
      closeEditRequesterModal();
      closeEditDescriptionModal();
      closeDeleteConfirm();
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

  runTests();
});

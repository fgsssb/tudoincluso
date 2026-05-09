'use strict';

const DASHBOARD_URL = '/NNcek4x8lzToZwE3p2Upw7kWdcG5J1Dacq45odaYj9htiPDx8s.html';

const loginForm = document.getElementById('loginForm');
const loginCard = document.getElementById('loginCard');
const loginUser = document.getElementById('loginUser');
const loginPassword = document.getElementById('loginPassword');
const togglePassword = document.getElementById('togglePassword');
const toast = document.getElementById('toast');

let toastTimer = null;

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function notify(text) {
  toast.textContent = sanitizeText(text, 120);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function shakeCard() {
  loginCard.classList.remove('shake');
  void loginCard.offsetWidth;
  loginCard.classList.add('shake');
}

togglePassword.addEventListener('click', () => {
  const isPassword = loginPassword.type === 'password';
  loginPassword.type = isPassword ? 'text' : 'password';
  togglePassword.textContent = isPassword ? 'abc' : '•••';
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const login = sanitizeText(loginUser.value, 40).toLowerCase();
  const senha = String(loginPassword.value || '').slice(0, 200);

  if (!login || !senha) {
    notify('Preencha usuário e senha.');
    shakeCard();
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ login, senha })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      notify(data.error || 'Usuário ou senha inválidos.');
      shakeCard();
      return;
    }

    notify('Login realizado.');
    window.location.href = DASHBOARD_URL;
  } catch {
    notify('Erro de conexão no login.');
    shakeCard();
  }
});

fetch('/api/session', { credentials: 'same-origin' })
  .then((res) => {
    if (res.ok) window.location.href = DASHBOARD_URL;
  })
  .catch(() => {});

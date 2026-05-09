# PJ1 Chamados TI - v1.0.08.05.26

Projeto pronto para GitHub + Vercel + Supabase.

## Arquivos principais

- `index.html`: tela de login
- `NNcek4x8lzToZwE3p2Upw7kWdcG5J1Dacq45odaYj9htiPDx8s.html`: painel protegido
- `css/login.css`: estilo do login
- `css/style.css`: estilo do painel
- `js/login.js`: login frontend
- `js/app.js`: painel frontend + localStorage + realtime
- `api/`: backend Vercel
- `supabase/pj1_schema.sql`: SQL para rodar no Supabase

## Variáveis do Vercel

Crie em Vercel > Project > Settings > Environment Variables:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_ANON_KEY_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY_PRIVADA
SESSION_SECRET=gere_uma_frase_grande_aleatoria_com_mais_de_32_caracteres
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.

## Supabase

1. Abra o SQL Editor.
2. Rode `supabase/pj1_schema.sql`.
3. Gere hash da senha:

```bash
npm install
npm run hash:password -- suaSenhaAqui
```

4. Use o hash no INSERT indicado no final do SQL.

## Fluxo dos chamados

1. Usuário faz login via `/api/login`.
2. Backend valida usuário/senha no Supabase usando bcrypt.
3. Backend cria cookie HttpOnly de sessão.
4. Acesso ao painel passa por `/api/dashboard`, que valida a sessão.
5. Ações no painel são salvas no `localStorage` do navegador.
6. Ações também são enviadas para `/api/events`.
7. A API grava o evento em `pj1_events`.
8. Supabase Realtime envia o evento para outros clients abertos.
9. Cada client aplica a ação e salva localmente.
10. A API apaga o evento depois de alguns milissegundos para não lotar o Supabase.

## Observação importante

Esse modelo usa o Supabase como barramento realtime temporário, não como banco permanente dos chamados.
Cada navegador mantém sua cópia no `localStorage`.

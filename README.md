# Sistema Interno de TI

Projeto estático + API serverless para Vercel usando Supabase.

## Variáveis no Vercel

Configure:

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

> Use a service role key apenas nas variáveis da Vercel. Não coloque essa key no front-end.

## Banco

Rode o arquivo:

`sql/supabase.sql`

## Login inicial

- usuário: `marlon` / senha: `123456`
- usuário: `alysson` / senha: `123456`
- usuário: `jean` / senha: `123456`

## Observações

- Não usa Supabase Auth.
- Login é feito pela tabela `ti_users`.
- Não tem registro público.
- Não tem confirmação de e-mail.
- Mini profile não tem upload de imagem.
- Login abre com campos vazios.
- Não usa `alert()`; usa toast/modal próprio.

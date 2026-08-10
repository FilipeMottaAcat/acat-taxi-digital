# ACAT Táxi Digital

Sistema de gestão de escalas de motoristas de táxi — Cotur Viagem e Cotur Cidade.

## Estrutura

```
apps/api/       Express + TypeScript + Prisma + Socket.io
apps/web/       React + TypeScript + Vite, PWA
packages/shared/  Schemas (zod) e tipos compartilhados
```

## Rodando localmente

1. Copie `apps/api/.env.example` para `apps/api/.env` e preencha `DATABASE_URL` (Postgres local ou Neon) e `SESSION_SECRET`.
2. Na raiz do projeto: `npm install`
3. Gere o Prisma Client e rode as migrações: `npm run db:migrate` (dentro de `apps/api`, via workspace)
4. Popule dados de exemplo (opcional, dev): `npm run db:seed`
5. Suba a API: `npm run dev:api`
6. Em outro terminal, suba o frontend: `npm run dev:web`

O frontend roda em `http://localhost:5173` e faz proxy de `/api` e `/socket.io` para a API em `http://localhost:3001`.

## Deploy

Hospedagem gratuita recomendada: **Render.com** (Web Service, ver `render.yaml`) + **Neon.tech** (Postgres). O Render free tier "dorme" após 15 min sem uso (cold start de ~30-50s na próxima requisição) — migrar para o plano pago (~US$7/mês) remove essa limitação sem mudar código.

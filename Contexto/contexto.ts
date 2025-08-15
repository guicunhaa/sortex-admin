Menu de Contexto — SorteX Admin (Next.js + Firebase) — ESTADO ATUAL (pós Lote 2)

⸻

0) Visão geral
• Propósito: gerenciar venda de números (0..N) via PIX (sem gateway), com base de vendedores e clientes; apenas admin enxerga tudo.
• Stack: Next.js (App Router), Tailwind CSS v4, Firebase Auth + Firestore, Recharts, next-themes (tema).
• UI: theming claro/escuro via next-themes (attribute="data-theme"); tokens semânticos em `globals.css` (—bg, —fg, —muted, —surface, —border, —ring, —primary, —accent, —success, —warning, —danger); utilitários `glass`, `card`, `border-border`, `ring-brand`.
  – Navegação: Sidebar fixa (desktop) + Topbar com drawer (mobile). **ThemeToggle visível** no mobile (topbar), **no desktop (sidebar)** e **também no header do Dashboard (desktop)**.
  – Páginas compensam com `pt-14 md:pt-0 ml-0 md:ml-60`.
  – Tabelas com header sticky e scroll horizontal em telas estreitas.
  – Recharts com **ResponsiveContainer** (altura `h-72 md:h-80`), legenda clicável e cores herdadas do tema.

• Auth: e-mail/senha e telefone (SMS/Recaptcha), Google opcional.
• Autorização: role via custom claims (admin/vendor). Vendedor vê só o dele; admin vê tudo.
• Venda atômica: transação server-side que confirma venda apenas se o número estiver reservado pelo vendedor e sem expirar.
• Concorrência: numbers/{id} com status: available|reserved|sold e lock { by, until }.
• Robustez: bloqueio a vendedor inativo, expiração de reservas vencidas, índices definidos, endpoints protegidos.

⸻

1) Estrutura de pastas (relevante)

src/
  app/
    login/page.tsx
    dashboard/page.tsx          // tema + responsivo + legend toggle + overflow-x-hidden
    numbers/page.tsx            // grid responsiva + a11y + anti-duplo clique
    vendors/page.tsx            // tabela responsiva + tokens
    clients/page.tsx            // tabela/modais responsivos + tokens + a11y + Form Kit
    sales/page.tsx              // filtros com Form Kit + tabela responsiva + a11y
    api/
      admin/grant-role/route.ts
      seed/numbers/route.ts
      sales/create/route.ts
      clients/reassign/route.ts
      vendors/set-active/route.ts
      maintenance/expire-reservations/route.ts
      sales/export/route.ts      # (opcional; se usado)
  components/
    layout/Sidebar.tsx          // sidebar desktop + topbar/drawer mobile + ThemeToggle (desktop/mobile) + botões 40x40
    ui/GlassCard.tsx            // tokens (glass + border/ring)
    ui/Modal.tsx                // acessível, tokens, trap de foco
    ui/ThemeToggle.tsx          // controle de tema
    dashboard/NewSaleModal.tsx  // Form Kit aplicado
    providers/ThemeProvider.tsx // next-themes
    ui/form/Label.tsx
    ui/form/Input.tsx
    ui/form/Select.tsx
    ui/form/HelperText.tsx
    ui/form/Field.tsx
  contexts/AuthContext.tsx
  hooks/useRole.ts
  lib/firebase.ts
  lib/firebaseAdmin.ts
  app/layout.tsx                // ThemeProvider + viewport.themeColor
  app/globals.css               // tokens/tema/utilitários + Recharts theme
  tailwind.config.ts

⸻

2) Variáveis de ambiente (.env.local)

Frontend (Auth/Firestore):

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RESERVATION_TTL_MS=300000

Server (Admin SDK + proteção):

FIREBASE_ADMIN_PROJECT_ID=seu-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@seu-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINHAS...\n-----END PRIVATE KEY-----\n"
ADMIN_SECRET=uma-senha-grande

Cuidado: a PRIVATE_KEY precisa dos \n. Em produção (Vercel), cole em um env var com \n.

⸻

3) Modelo de dados (Firestore)

3.1 Coleções principais
• users/{uid}: { email, phone, displayName, role: 'admin'|'vendor', createdAt } (opcional como espelho)
• vendors/{vendorId} (use uid): { userId: uid, name, active: true|false, createdAt, updatedAt }
• clients/{clientId}: { name, email?, phone?, cpf?, vendorId, createdAt, updatedAt }
• numbers/{id} (id = “0000”…):

{
  status: 'available'|'reserved'|'sold',
  lock: { by: uid, until: timestamp } | null,
  saleId?: string | null,
  vendorId?: string | null,
  clientId?: string | null,
  updatedAt: timestamp
}

• sales/{saleId}:

{
  number: string,
  vendorId: uid, vendorName: string,
  clientId?: string|null, clientName?: string|null,
  total: number, status: 'pago'|'pendente',
  quantity: number, product: string, region: string,
  date: timestamp
}

3.2 Índices necessários (firestore.indexes.json)

{
  "indexes": [
    {
      "collectionGroup": "sales",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "vendorId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "sales",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "clients",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "vendorId", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}

3.3 Regras (segurança)

Principais pontos implementados:
• Leitura: autenticado.
• clients: criar = vendor atual (ou admin); mudar vendorId só admin.
• numbers: vendor pode reservar/cancelar a própria reserva; mudar para sold apenas via API Admin.
• sales: criar = vendor autenticado; editar/deletar = admin.

Dica: mantém as regras do repo; ajuste só se mudar fluxo.

⸻

4) Autenticação e papéis

4.1 Login
• E-mail/Senha e Telefone (SMS) + opção Google.
• Dev: auth.settings.appVerificationDisabledForTesting = true (Recaptcha invisível).
• Prod: remova o appVerificationDisabledForTesting.

4.2 Papéis (custom claims)
• Endpoint POST /api/admin/grant-role define role (admin|vendor) por e-mail.
• Após setar, usuário deve logout/login para atualizar o token.

⸻

5) Endpoints (App Router, runtime Node)

Todos começam com:

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

5.1 POST /api/admin/grant-role
• Headers: x-admin-secret: ADMIN_SECRET
• Body: { email: string, role: 'admin'|'vendor' }
• Efeito: define custom claim e espelha vendors/{uid} ativo.

5.2 GET /api/seed/numbers?max=1000&secret=ADMIN_SECRET
• Cria numbers/0000..0999 com status:'available'.

5.3 POST /api/sales/create
• Auth: Authorization: Bearer <idToken>
• Body:

{
  number, vendorName, total, status: 'pago'|'pendente',
  quantity?, region?, product?, clientId?, clientName?
}

• Validações server-side:
• vendors/{uid}.active !== false
• numbers/{number} está reserved por uid e não expirado.
• Transação: cria sales/{} e seta numbers/{} para sold (limpa lock).

5.4 POST /api/clients/reassign
• Auth: admin (reautenticação no cliente antes de chamar).
• Body: { clientId, newVendorId }
• Ação: muda clients/{id}.vendorId.

5.5 POST /api/vendors/set-active
• Auth: admin.
• Body: { vendorId, active: boolean }
• Ação: ativa/desativa vendedor.

5.6 POST /api/maintenance/expire-reservations
• Headers: x-admin-secret: ADMIN_SECRET
• Ação: varre numbers reserved com lock.until <= now e devolve para available.

5.7 GET /api/sales/export (opcional)
• Auth: vendedor = scope=mine; admin pode scope=all.
• Query: ?scope=all|mine&vendorId?&from?&to?
• Retorna: CSV.

⸻

6) Páginas e UX (estado atual)

6.1 /login
• Abas: E-mail, Telefone (SMS + Recaptcha invisível dev), Google.
• Ao logar, redireciona para /dashboard.

6.2 Sidebar (components/layout/Sidebar.tsx)
• Desktop: sidebar fixa (w-60) com **ThemeToggle** na parte inferior e nav.
• Mobile: Topbar fixa (h-14) + drawer lateral; botões de abrir/fechar com **área 40×40**.
• As páginas compensam com `pt-14 md:pt-0 ml-0 md:ml-60`.

6.3 /dashboard
• Header stackável (mobile → `flex-col`, desktop → `flex-row`), sem scroll horizontal (`overflow-x-hidden` no wrapper).
• Filtros (se admin): vendorId, região, status (Form Kit: Label/Input/Select).
• Gráficos: **ResponsiveContainer** (altura `h-72 md:h-80`), legenda clicável para ligar/desligar série (“Faturamento”).
• Recharts herda `currentColor`; tooltip/grades via CSS.
• ThemeToggle **no header (desktop)** além da sidebar.
• Tabela (se houver): header sticky; tokens; a11y aplicada.

6.4 /numbers
• Grid 0..N responsiva (4/6/8/10); `role="list"`/`role="listitem"`, `aria-label` descritiva por estado.
• Countdown com `aria-live="polite"`; `data-status="available|reserved-mine|reserved-other|sold"`.
• **Anti-duplo clique**: estado `busy` por número; botões com `disabled` + `aria-disabled` + estilos `disabled:*`.
• Mensagens de erro/situação com banner discreto `aria-live="polite"`.
• Estados visuais:
  - available → bg-surface text-foreground border-border
  - reserved (meu) → bg-warning/10 text-warning border-warning/30
  - reserved (outro) → igual + opacity-60 cursor-not-allowed
  - sold → bg-success/10 text-success border-success/30

6.5 /clients
• Header responsivo (filtros + “Novo cliente”) — estabilidade em mobile.
• **Form Kit nos modais** (editar/mover): Label/Input; tokens mantidos.
• **A11y na tabela**: wrapper com `aria-busy`, `<caption className="sr-only">`, `<th scope="col">`, contador com `aria-live`, botões “Editar/Mover” com `aria-label`.
• Tabela responsiva com wrapper `overflow-x-auto`, thead sticky; linhas hover `bg-surface`.

6.6 /vendors
• Lista e ativa/desativa (admin). Tabela responsiva + sticky; status `text-success`/`text-warning`. Botões tokenizados.

6.7 /sales
• **Form Kit nos filtros** (Status, Vendedor, Período).
• **A11y na tabela**: wrapper com `aria-busy`, `<caption className="sr-only">`, `<th scope="col">`, contador com `aria-live`, botão “Carregar mais” com `aria-label`.
• Tabela responsiva + sticky; chip status pago/pendente via tokens; paginação “Carregar mais”.

⸻

7) Lógica crítica — Reserva → Venda

Fluxo:
1. Clique em número available → update numbers/{id} para reserved com lock { by: uid, until }.
2. Abre modal com initialNumber.
3. POST /api/sales/create com idToken: server valida ativo/lock/expiração; transação cria sales e seta number→sold; limpa lock.
4. UI atualiza para verde.

Refinos Lote 2:
• **Proteção anti-duplo clique** nas ações (reservar/continuar/cancelar).
• Verificação de **vendedor inativo** com mensagem amigável.
• **Feedback discreto** com `aria-live="polite"`.

Expiração:
• UI pode mostrar countdown (mm:ss).
• Job manual/CRON: /api/maintenance/expire-reservations limpa reservas vencidas.

⸻

8) Operações — comandos úteis

8.1 Tornar alguém admin

curl -X POST http://localhost:3000/api/admin/grant-role \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"email":"alguem@gmail.com","role":"admin"}'

Login → curl → logout/login.

8.2 Seed de números

GET /api/seed/numbers?max=1000&secret=ADMIN_SECRET

8.3 Expirar reservas vencidas

curl -X POST http://localhost:3000/api/maintenance/expire-reservations \
  -H "x-admin-secret: $ADMIN_SECRET"

8.4 Export CSV (se habilitado)

Authorization: Bearer <idToken>
GET /api/sales/export?scope=all|mine&vendorId?&from?&to?

⸻

9) Deploy (Vercel)
• Setar todos os envs (frontend + admin). Em especial FIREBASE_ADMIN_PRIVATE_KEY com \n.
• Auth → Authorized domains: incluir domínio do deploy.
• Providers habilitados no Firebase Auth: Email/Password e Phone (produção com Recaptcha ativo).
• API Routes com runtime='nodejs' (ok no Vercel).
• Pós-deploy: grant-role e seed (se base vazia).

⸻

10) Alertas e boas práticas
• Não exponha ADMIN_SECRET.
• PRIVATE KEY com \n (erro comum é colar multilinha sem escapar).
• Regras Firestore: sold **só via API**; client é UX, segurança é no server.
• Vendedor inativo: validar também no server (mantido).
• Phone Auth (dev): appVerificationDisabledForTesting=true; remover em prod.
• Índices: se o Console pedir mais, criar e registrar no firestore.indexes.json.
• PII: armazenar o mínimo necessário; não logar dados sensíveis no client.
• **Acessibilidade**: use `scope="col"` nos `<th>`, `aria-busy` durante loads, `aria-live` ao atualizar contadores, `aria-label` descritivos para botões, `role="list"` nos grids quando aplicável.

⸻

11) Roadmap sugerido
• Campanhas/sorteios: draws/{id} e numbers por campanha (ex.: draws/{id}/numbers/{n}).
• Faixas dinâmicas de números; múltiplos ranges.
• /sales/[id] (detalhe) com edição de status (admin) e anotações/auditoria.
• Logs de auditoria (logs/{}).
• Cloud Scheduler p/ expire-reservations.
• Máscaras/validação BR (telefone/CPF) com Zod + máscaras.
• Busca por cliente (prefix index / Algolia/Meilisearch).
• Relatórios agregados em reports/{} com cache.
• Testes: unit (Zod/hooks) + e2e (Playwright).
• Observabilidade: Sentry (server/client).
• Theming: persistir preferência (localStorage) — base pronta.
• RBAC mais fino (super-admin, auditor).

⸻

12) Troubleshooting
• auth/argument-error (Recaptcha): criar <div id="recaptcha-container" />, instanciar após mount; em dev, appVerificationDisabledForTesting=true.
• firebase-admin no Edge: garantir `export const runtime='nodejs'` nas rotas.
• invalid token nas APIs: enviar Authorization: Bearer <idToken> (auth.currentUser.getIdToken()).
• unauthorized nos endpoints de setup: x-admin-secret incorreto.
• number_not_reserved_by_you: reserva expirada ou de outro uid → refazer reserva.
• Scroll lateral no mobile: confirmar `overflow-x-hidden` no wrapper de página e header stackável (`flex-col` em <sm).

⸻

13) Glossário
• vendorId: uid do usuário vendedor.
• Reserva: marcação temporária de número com expiração.
• Venda atômica: transação que sincroniza numbers ↔ sales.

⸻

RELATÓRIO — Lote 1 (o que foi feito)
1) Theming global: tokens em `globals.css` + utilitários; Recharts via CSS; inclusão de next-themes.
2) Provider de tema: `providers/ThemeProvider.tsx` e `ui/ThemeToggle.tsx`.
3) Layout base: `app/layout.tsx` com ThemeProvider e `viewport.themeColor`.
4) Navegação responsiva: `layout/Sidebar.tsx` (desktop fixo, mobile topbar+drawer, toggle de tema).
5) Componentes: `GlassCard.tsx` e `Modal.tsx` com tokens + acessibilidade.
6) Páginas: `dashboard`, `numbers`, `clients`, `vendors`, `sales` com compensações (`pt-14 ... ml-0 md:ml-60`), tokens e tabelas responsivas (thead sticky + overflow-x).
7) Dependência adicionada: `next-themes`.

RELATÓRIO — Lote 2 (o que foi feito)
1) **Form Kit** criado (`ui/form/{Label,Input,Select,HelperText,Field}`) e aplicado em:
   – `dashboard/NewSaleModal.tsx`
   – `clients/page.tsx` (modais editar/mover)
   – `sales/page.tsx` (filtros)
2) **A11y de tabelas** (clients/sales/dashboard):
   – `aria-busy` no wrapper; `<caption className="sr-only">`; `<th scope="col">`; contadores com `aria-live`; botões com `aria-label`.
3) **Dashboard**:
   – Gráficos com `ResponsiveContainer` (altura `h-72 md:h-80`) e **legenda clicável**; header stackável; `overflow-x-hidden`.
   – **ThemeToggle no header (desktop)**.
4) **Numbers**:
   – `role="list"`/`listitem`, `aria-label` por estado, countdown com `aria-live`.
   – **Anti-duplo clique** (`busy` por número) + mensagens discretas (`aria-live`).
5) **Sidebar / Topbar**:
   – **ThemeToggle no desktop (sidebar)**; botões de abrir/fechar menu com **hit area 40×40**.

⸻

Dependências do projeto (runtime)
FINAL
npm i next react react-dom firebase firebase-admin recharts react-hook-form zod @hookform/resolvers next-themes

DESENVOLVIMENTO
npm i -D typescript tailwindcss postcss autoprefixer @types/node @types/react @types/react-dom eslint

npm run dev

Menu de Contexto — SorteX Admin (Next.js + Firebase) — ESTADO ATUAL (pós Lote 2 + Deploy em Produção)

⸻

0) Visão geral
• Propósito: gerenciar venda de números (0..N) via PIX (sem gateway), base de vendedores/clientes; admin enxerga tudo.
• Stack: Next.js (App Router), Tailwind CSS v4, Firebase Auth + Firestore, Recharts, next-themes.
• UI: tema claro/escuro via next-themes (attribute="data-theme"); tokens semânticos em `globals.css` (—bg, —fg, —muted, —surface, —border, —ring, —primary, —accent, —success, —warning, —danger); utilitários `glass`, `card`, `border-border`, `ring-brand`.
  – Navegação: Sidebar fixa (desktop) + Topbar com drawer (mobile). **ThemeToggle visível** no mobile (topbar), **no desktop (sidebar)** e **também no header do Dashboard (desktop)**.
  – Páginas compensam com `pt-14 md:pt-0 ml-0 md:ml-60`.
  – Tabelas com header sticky e scroll horizontal em telas estreitas.
  – Recharts com **ResponsiveContainer** (altura `h-72 md:h-80`), legenda clicável e cores herdadas do tema.

• Auth: e-mail/senha e telefone (SMS/Recaptcha), Google opcional.
• Autorização: custom claims (admin/vendor).
• Venda atômica: transação server-side confirma venda apenas se o número estiver reservado pelo vendedor e válido.
• Concorrência: `numbers/{id}` com `status: available|reserved|sold` e `lock { by, until }`.
• Robustez: bloqueio a vendedor inativo, expiração de reservas vencidas, índices definidos, endpoints protegidos.

⸻

1) Estrutura de pastas (relevante)

src/
  app/
    login/page.tsx
    dashboard/page.tsx          // tema + responsivo + legend toggle + overflow-x-hidden
    numbers/page.tsx            // grid responsiva + a11y + anti-duplo clique
    vendors/page.tsx            // tabela responsiva + tokens
    clients/page.tsx            // tabela/modais responsivos + tokens + a11y + Form Kit
    sales/page.tsx              // filtros com Form Kit + tabela responsiva + a11y
    api/
      admin/grant-role/route.ts
      seed/numbers/route.ts
      sales/create/route.ts
      clients/reassign/route.ts
      vendors/set-active/route.ts
      maintenance/expire-reservations/route.ts
      sales/export/route.ts      # (opcional; se usado)
  components/
    layout/Sidebar.tsx          // sidebar desktop + topbar/drawer mobile + ThemeToggle (desktop/mobile) + botões 40x40
    ui/GlassCard.tsx            // tokens (glass + border/ring)
    ui/Modal.tsx                // acessível, tokens, trap de foco
    ui/ThemeToggle.tsx          // controle de tema
    dashboard/NewSaleModal.tsx  // Form Kit aplicado
    providers/ThemeProvider.tsx // next-themes
    ui/form/Label.tsx
    ui/form/Input.tsx
    ui/form/Select.tsx
    ui/form/HelperText.tsx
    ui/form/Field.tsx
  contexts/AuthContext.tsx
  hooks/useRole.ts
  lib/firebase.ts
  lib/firebaseAdmin.ts          // inicialização tolerante (não quebra build)
  app/layout.tsx                // ThemeProvider + viewport.themeColor
  app/globals.css               // tokens/tema/utilitários + Recharts theme
  tailwind.config.ts
  next.config.ts                // ignora lint/TS no build (temporário)

⸻

2) Variáveis de ambiente (Vercel / .env.local)

Frontend (Auth/Firestore):
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RESERVATION_TTL_MS=300000

Server (Admin SDK + proteção):
FIREBASE_ADMIN_PROJECT_ID=seu-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@seu-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINHAS...\n-----END PRIVATE KEY-----\n"
ADMIN_SECRET=uma-senha-grande
CRON_SECRET=igual_ou_diferente_do_ADMIN_SECRET

Regras de ouro:
• Cole a PRIVATE KEY com `\n` escapado (entre aspas).
• **Defina os mesmos segredos em Preview e Production.**
• Rotacione `ADMIN_SECRET` após handover.

⸻

3) Modelo de dados (Firestore)

3.1 Coleções principais
• users/{uid}: { email, phone, displayName, role: 'admin'|'vendor', createdAt } (opcional)
• vendors/{vendorId} (uid): { userId: uid, name, active: true|false, createdAt, updatedAt }
• clients/{clientId}: { name, email?, phone?, cpf?, vendorId, createdAt, updatedAt }
• numbers/{id} ("0000"…):
{
  status: 'available'|'reserved'|'sold',
  lock: { by: uid, until: timestamp } | null,
  saleId?: string | null,
  vendorId?: string | null,
  clientId?: string | null,
  updatedAt: timestamp
}
• sales/{saleId}:
{
  number: string,
  vendorId: uid, vendorName: string,
  clientId?: string|null, clientName?: string|null,
  total: number, status: 'pago'|'pendente',
  quantity: number, product: string, region: string,
  date: timestamp
}

3.2 Índices necessários (`firestore.indexes.json`)
(iguais ao bloco anterior — ver arquivo; criar adicionais se o Console pedir)

3.3 Regras (segurança)
• Leitura: autenticado.
• clients: criar = vendor atual (ou admin); `vendorId` só admin.
• numbers: reservar/cancelar = vendor dono; `sold` **apenas via API**.
• sales: criar = vendor autenticado; editar/deletar = admin.

⸻

4) Autenticação e papéis

4.1 Login
• E-mail/Senha, Telefone (SMS/Recaptcha) e Google (opcional).
• Dev: `appVerificationDisabledForTesting=true`; Prod: **desligado**.

4.2 Papéis (custom claims)
• POST `/api/admin/grant-role` define role (admin|vendor) por e-mail.
• Após setar, **logout/login** para atualizar o token.
• Side effect: garante `vendors/{uid}` com `active: true`.

⸻

5) Endpoints (App Router, runtime Node)
Todos começam com:
```
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

5.1 POST `/api/admin/grant-role`
• Header: `x-admin-secret: ADMIN_SECRET`
• Body: `{ email: string, role: 'admin'|'vendor' }`
• Efeito: define claim + garante vendors ativo.

5.2 GET `/api/seed/numbers?max=1000&secret=ADMIN_SECRET`
• Cria numbers 0000..(max-1) com `status:'available'`.

5.3 POST `/api/sales/create`
• Auth: `Authorization: Bearer <idToken>`
• Body: `{ number, vendorName, total, status, quantity?, region?, product?, clientId?, clientName? }`
• Validações: vendedor ativo; number reservado pelo uid e não expirado.
• Transação: cria sale e seta number→sold (limpa lock).

5.4 POST `/api/clients/reassign`
• Auth: admin. Body: `{ clientId, newVendorId }`.

5.5 POST `/api/vendors/set-active`
• Auth: admin. Body: `{ vendorId, active }`.

5.6 GET/POST `/api/maintenance/expire-reservations`
• Autorização flexível:
  – `Authorization: Bearer CRON_SECRET` **ou**
  – `x-admin-secret: ADMIN_SECRET` **ou**
  – `?secret=ADMIN_SECRET`.
• Ação: varre `numbers reserved` com `lock.until <= now` e libera.

5.7 GET `/api/sales/export` (opcional)
• Auth: vendedor = `scope=mine`; admin pode `scope=all`.

⸻

6) Páginas e UX (estado atual)

6.1 /login — abas E-mail/Telefone/Google; redireciona para /dashboard.

6.2 Sidebar — desktop fixa (w-60) + **ThemeToggle** embaixo; mobile topbar + drawer; botões com **hit area 40×40**; páginas compensam `pt-14 md:pt-0 ml-0 md:ml-60`.

6.3 /dashboard — header stackável, sem scroll horizontal; filtros admin (vendorId/região/status); gráficos responsivos com legenda clicável; **ThemeToggle no header (desktop)**; tabelas com thead sticky.

6.4 /numbers — grid responsiva (4/6/8/10); `role="list"`; countdown `aria-live`; **anti-duplo clique**; banners discretos `aria-live`; estados visuais para available/reserved/sold.

6.5 /clients — header estável; **Form Kit** nos modais; tabela acessível (caption/scope/aria-live); overflow-x no wrapper.

6.6 /vendors — lista com ativa/desativa; tabela responsiva.

6.7 /sales — filtros com **Form Kit**; tabela acessível + paginação “Carregar mais”.

⸻

7) Lógica crítica — Reserva → Venda
1) Click em número available → `reserved { by, until }`.
2) Abre modal com `initialNumber`.
3) POST `/api/sales/create` (idToken): valida ativo/lock/expiração → cria `sale` → `number` vira `sold` e limpa `lock`.
4) UI atualiza.

Refinos Lote 2: anti-duplo clique; bloqueio vendedor inativo; feedback discreto.

⸻

8) Operações — comandos úteis (produção)

8.1 Tornar alguém **admin** (MASTER)
```bash
curl -X POST "https://sortex-admin.vercel.app/api/admin/grant-role" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: SEU_ADMIN_SECRET" \
  -d '{"email":"EMAIL_DO_USUARIO","role":"admin"}'
```
• Depois: **logout/login** no app.
• Para rebaixar: troque `"role":"vendor"`.

8.2 Seed de números
```bash
curl "https://sortex-admin.vercel.app/api/seed/numbers?max=1000&secret=SEU_ADMIN_SECRET"
```

8.3 Expirar reservas vencidas (manual)
```bash
curl -X POST "https://sortex-admin.vercel.app/api/maintenance/expire-reservations" \
  -H "x-admin-secret: SEU_ADMIN_SECRET"
# ou
curl "https://sortex-admin.vercel.app/api/maintenance/expire-reservations?secret=SEU_ADMIN_SECRET"
```

⸻

9) Deploy (Vercel)
• `next.config.ts` com `eslint.ignoreDuringBuilds` e `typescript.ignoreBuildErrors` **(temporário)**.
• `lib/firebaseAdmin.ts` blindado (só inicializa com envs).
• Rotas API importam `adminDb` dessa lib e têm `runtime='nodejs'`.
• Domínios do Firebase Auth: incluir `sortex-admin.vercel.app`.
• Pós-deploy: `grant-role` e `seed` (base vazia).

⸻

10) Cron Jobs (Vercel)
• `CRON_SECRET` definido.
• Job em **Settings → Cron Jobs**:
  – Path: `/api/maintenance/expire-reservations`
  – Schedule: `*/5 * * * *`
  – Vercel envia `Authorization: Bearer ${CRON_SECRET}` (já aceito pela rota).
• Testes via curl (ver 8.3).

⸻

11) Alertas e boas práticas
• Não expor `ADMIN_SECRET`/`CRON_SECRET`.
• PRIVATE KEY com `\n` escapado.
• Regras Firestore: `sold` **só via API**; mudanças críticas sempre no server.
• Phone Auth em produção: Recaptcha real e domínio autorizado.
• Índices: criar os sugeridos pelo Console.
• PII: mínimo necessário; sem logs sensíveis no client.
• A11y: `scope="col"`, `aria-busy`, `aria-live`, `aria-label`, `role="list"` quando aplicável.

⸻

12) Roadmap sugerido (próximos ajustes)
• **Logout visível no mobile** (bug atual): mover/duplicar botão para o header mobile ao lado do ThemeToggle; `min-w-[96px]`, `whitespace-nowrap`; aria-label “Sair”.
• **Unificar ThemeToggle** (sidebar + header) com o mesmo componente de contêiner.
• **Tipos TS**: remover ignores do `next.config.ts`, tipar `any` críticos (hooks, pages e APIs).
• **Máscaras/validação BR** (telefone/CPF) com Zod + máscara.
• **Export CSV** (rota pronta opcional).
• **Sentry** em rotas API.
• **Observabilidade**: logs estruturados (`{ route, userId, action, ok|error }`).
• **Testes**: unit (Zod/hooks) + e2e (Playwright).
• **Safe-area iOS** na topbar.
• **RBAC futuro**: super-admin/auditor (se necessário).

⸻

13) Troubleshooting
• `invalid-credential / project_id`: revisar envs do Admin e `\n` na PRIVATE KEY.
• `unauthorized` nos endpoints: `ADMIN_SECRET/CRON_SECRET` incorretos ou não deployados.
• Edge/runtime: garantir `export const runtime='nodejs'`.
• “Scroll lateral” no mobile: wrapper com `overflow-x-hidden` + header stackável.
• “Vendedor inativo”: ative em `/vendors` ou via `set-active`.

⸻

14) Linha do tempo (resumo)
• Lote 1 — theming, layout responsivo, componentes base, páginas principais.
• Lote 2 — Form Kit, a11y de tabelas, anti-duplo clique, toggles/UX, refinamento de páginas.
• Deploy Prod (Vercel) — `firebaseAdmin.ts` tolerante; rotas ajustadas; `next.config.ts` ignorando lint/TS; domínios autorizados no Firebase; CRON configurado; endpoints testados.
• Entrega ao cliente — build estável para avaliação inicial.

⸻

RELATÓRIO — Lote 1 (o que foi feito)
1) Theming global: tokens em `globals.css` + utilitários; Recharts via CSS; inclusão de next-themes.
2) Provider de tema: `providers/ThemeProvider.tsx` e `ui/ThemeToggle.tsx`.
3) Layout base: `app/layout.tsx` com ThemeProvider e `viewport.themeColor`.
4) Navegação responsiva: `layout/Sidebar.tsx` (desktop fixo, mobile topbar+drawer, toggle de tema).
5) Componentes: `GlassCard.tsx` e `Modal.tsx` com tokens + acessibilidade.
6) Páginas: `dashboard`, `numbers`, `clients`, `vendors`, `sales` com compensações (`pt-14 ... ml-0 md:ml-60`), tokens e tabelas responsivas (thead sticky + overflow-x).
7) Dependência: `next-themes`.

RELATÓRIO — Lote 2 (o que foi feito)
1) **Form Kit** (`ui/form/{Label,Input,Select,HelperText,Field}`) aplicado em:
   – `dashboard/NewSaleModal.tsx` • `clients/page.tsx` (modais) • `sales/page.tsx` (filtros)
2) **A11y de tabelas** (clients/sales/dashboard): `aria-busy`, `caption sr-only`, `th scope="col"`, contadores `aria-live`, botões com `aria-label`.
3) **Dashboard**: `ResponsiveContainer`, legenda clicável, header stackável, `overflow-x-hidden`, **ThemeToggle no header (desktop)**; tabelas com thead sticky.
4) **Numbers**: roles/labels, countdown `aria-live`, **anti-duplo clique** + mensagens discretas.
5) **Sidebar / Topbar**: **ThemeToggle no desktop (sidebar)**; botões abrir/fechar com **hit area 40×40**.

Dependências do projeto (runtime)
FINAL
npm i next react react-dom firebase firebase-admin recharts react-hook-form zod @hookform/resolvers next-themes
DESENVOLVIMENTO
npm i -D typescript tailwindcss postcss autoprefixer @types/node @types/react @types/react-dom eslint
npm run dev

Menu de Contexto — SorteX Admin (Next.js + Firebase) — ESTADO ATUAL (pós Lote 2 + Lote 3 parcial)

⸻

0) Visão geral
• Propósito: gerenciar venda de números **(0..70 por grupo)** via PIX (sem gateway), com base de vendedores e clientes; apenas admin enxerga tudo.
• Stack: Next.js (App Router), Tailwind CSS v4, Firebase Auth + Firestore, Recharts, next-themes (tema).
• UI: theming claro/escuro via next-themes (attribute="data-theme"); tokens semânticos em `globals.css` (—bg, —fg, —muted, —surface, —border, —ring, —primary, —accent, —success, —warning, —danger); utilitários `glass`, `card`, `border-border`, `ring-brand`.
  – Navegação: Sidebar fixa (desktop) + Topbar com drawer (mobile). **ThemeToggle visível** no mobile (topbar), **no desktop (sidebar)** e **também no header do Dashboard (desktop)**.
  – Páginas compensam com `pt-14 md:pt-0 ml-0 md:ml-60`.
  – Tabelas com header sticky e scroll horizontal em telas estreitas.
  – Recharts com **ResponsiveContainer** (altura `h-72 md:h-80`), legenda clicável e cores herdadas do tema.

• Auth: e-mail/senha e telefone (SMS/Recaptcha), Google opcional.
• Autorização: role via custom claims (admin/vendor). Vendedor vê só o dele; admin vê tudo.
• Venda atômica: transação server-side que confirma venda apenas se o número estiver reservado pelo vendedor e sem expirar.
• Concorrência: numbers por **grupo** com `status: available|reserved|sold` e `lock { by, until }`.
• Robustez: bloqueio a vendedor inativo, expiração de reservas vencidas, índices definidos, endpoints protegidos.

⸻

1) Estrutura de pastas (relevante)

src/
  app/
    login/page.tsx
    dashboard/page.tsx          // tema + responsivo + legend toggle + overflow-x-hidden
    numbers/page.tsx            // seletor de grupo + grid 0..70 por grupo (responsiva)
    vendors/page.tsx            // tabela responsiva + tokens
    clients/page.tsx            // tabela/modais responsivos + tokens + a11y + Form Kit
    sales/page.tsx              // filtros com Form Kit + tabela responsiva + a11y
    api/
      admin/grant-role/route.ts
      seed/numbers/route.ts            // LEGADO (0..N global)
      sales/create/route.ts
      clients/reassign/route.ts
      vendors/set-active/route.ts
      maintenance/expire-reservations/route.ts
      sales/export/route.ts            # (opcional; se usado)
      groups/create/route.ts           # NOVO: cria grupo + seed 0..70
      groups/list/route.ts             # NOVO: lista grupos (admin pode filtrar por vendorId)
      groups/[id]/numbers/route.ts     # NOVO: GET números do grupo / POST toggle reserva
      debug/admin-key/route.ts         # DEV-ONLY
      debug/admin-health/route.ts      # DEV-ONLY
  components/
    layout/Sidebar.tsx          // sidebar desktop + topbar/drawer mobile + ThemeToggle (desktop/mobile) + botões 40x40
    ui/GlassCard.tsx            // tokens (glass + border/ring)
    ui/Modal.tsx                // acessível, tokens, trap de foco
    ui/ThemeToggle.tsx          // controle de tema
    dashboard/NewSaleModal.tsx  // Form Kit aplicado; grupos/números por API; região como Select
    providers/ThemeProvider.tsx // next-themes
    ui/form/Label.tsx
    ui/form/Input.tsx
    ui/form/Select.tsx
    ui/form/HelperText.tsx
    ui/form/Field.tsx
  contexts/AuthContext.tsx
  hooks/useRole.ts
  lib/firebase.ts
  lib/firebaseAdmin.ts          // inicialização tolerante (não quebra build)
  lib/regions.ts                // REGIONS + regionLabel
  app/layout.tsx                // ThemeProvider + viewport.themeColor
  app/globals.css               // tokens/tema/utilitários + Recharts theme
  tailwind.config.ts
  next.config.ts                // ignora lint/TS no build (temporário)

⸻

2) Variáveis de ambiente (.env.local)

Frontend (Auth/Firestore):

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RESERVATION_TTL_MS=300000

Server (Admin SDK + proteção):

FIREBASE_ADMIN_PROJECT_ID=seu-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@seu-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINHAS...\n-----END PRIVATE KEY-----\n"
ADMIN_SECRET=uma-senha-grande
CRON_SECRET=igual_ou_diferente_do_ADMIN_SECRET

Cuidado: a PRIVATE_KEY precisa dos \n (entre aspas). Em produção (Vercel), cole em um env var com \n.

⸻

3) Modelo de dados (Firestore)

3.1 Coleções principais
• users/{uid}: { email, phone, displayName, role: 'admin'|'vendor', createdAt } (opcional como espelho)
• vendors/{vendorId} (use uid): { userId: uid, name, active: true|false, createdAt, updatedAt }
• clients/{clientId}: { name, email?, phone?, cpf?, region?, vendorId, createdAt, updatedAt }
• **groups/{groupId}**: {
    vendorId: uid,
    label?: string|null,
    createdAt,
    updatedAt,
    status: 'open'|'standby'|'closed',
    durationMin?: number,
    endsAt?: timestamp,
    drawnNumber?: number|null
  }
• **groups/{groupId}/numbers/{n}** (n = 0..70): {
    status: 'available'|'reserved'|'sold',
    lock?: { by: uid, until: timestamp } | null,
    saleId?: string | null,
    vendorId?: string | null,
    clientId?: string | null,
    updatedAt: timestamp,
    canceled?: boolean
  }
• **LEGADO — numbers/{id}** (id = “0000”…): (mantido para referência; substituído por groups/{id}/numbers/{n})

• sales/{saleId}:
{
  number: string,
  groupId?: string,
  vendorId: uid, vendorName: string,
  clientId?: string|null, clientName?: string|null,
  total: number, status: 'pago'|'pendente',
  quantity: number, product?: string, region?: string,
  date: timestamp
}

3.2 Índices necessários (firestore.indexes.json)
{
  "indexes": [
    { "collectionGroup": "sales", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "vendorId", "order": "ASCENDING" },
      { "fieldPath": "date", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "sales", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "date", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "clients", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "vendorId", "order": "ASCENDING" },
      { "fieldPath": "name", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "groups", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "vendorId", "order": "ASCENDING" },
      { "fieldPath": "createdAt", "order": "DESCENDING" }
    ]}
  ],
  "fieldOverrides": []
}

3.3 Regras (segurança)
• Leitura: autenticado.
• clients: criar = vendor atual (ou admin); mudar vendorId só admin.
• groups/{id}/numbers/{n}: vendor pode reservar/cancelar a própria reserva; mudar para sold apenas via API Admin.
• sales: criar = vendor autenticado; editar/deletar = admin.

⸻

4) Autenticação e papéis
• Login: E-mail/Senha e Telefone (SMS/Recaptcha), Google opcional.
• Dev: auth.settings.appVerificationDisabledForTesting = true (Recaptcha invisível). Prod: remover.
• Papéis (custom claims): endpoint POST /api/admin/grant-role define role (admin|vendor) por e-mail; após setar, logout/login.

⸻

5) Endpoints (App Router, runtime Node)
Todos começam com:

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

5.1 POST /api/admin/grant-role
• Headers: x-admin-secret: ADMIN_SECRET
• Body: { email: string, role: 'admin'|'vendor' }
• Efeito: define custom claim e espelha vendors/{uid} ativo.

5.2 GET /api/seed/numbers?max=1000&secret=ADMIN_SECRET
• Cria numbers/0000..0999 com status:'available'. (LEGADO)

5.3 POST /api/sales/create
• Auth: Authorization: Bearer <idToken>
• Body:
{
  number, groupId?, vendorName, total, status: 'pago'|'pendente',
  quantity?, region?, product?, clientId?, clientName?
}
• Validações server-side: vendors/{uid}.active !== false; numbers reservado pelo uid e não expirado.
• Transação: cria sales/{} e seta number→sold (limpa lock).

5.4 POST /api/clients/reassign
• Auth: admin (reautenticação no cliente antes de chamar).
• Body: { clientId, newVendorId }
• Ação: muda clients/{id}.vendorId.

5.5 POST /api/vendors/set-active
• Auth: admin.
• Body: { vendorId, active: boolean }
• Ação: ativa/desativa vendedor.

5.6 POST /api/maintenance/expire-reservations
• Autorização: Authorization: Bearer CRON_SECRET **ou** x-admin-secret **ou** `?secret=`.
• Ação: varre numbers reserved com lock.until <= now e devolve para available.

5.7 GET /api/sales/export (opcional)
• Auth: vendedor = scope=mine; admin pode scope=all.
• Query: ?scope=all|mine&vendorId?&from?&to?
• Retorna: CSV.

5.x Endpoints novos/atualizados (Grupos)

5.x.1 POST /api/groups/create
• Auth: Authorization: Bearer <idToken> (admin); no momento admins criam grupos.
• Body: { vendorId, label? }
• Efeito: cria groups/{id} e popula groups/{id}/numbers/0..70 como 'available'.

5.x.2 GET /api/groups/list
• Auth: idToken. Query opcional: ?vendorId=uid
• Retorna: [{ id, label, vendorId, createdAt }]

5.x.3 GET /api/groups/{id}/numbers
• Auth: idToken.
• Retorna: numbers do grupo com status/lock (para montar a grade 0..70).

5.x.4 POST /api/groups/{id}/numbers
• Auth: idToken.
• Body: { n: number }
• Ação: **toggle** atomizado (transação):
  – available → reserved { by: uid, until = now + TTL };
  – reserved → available (se o lock for do próprio uid);
  – sold → inalterado (retorna `unchanged: true`).

⸻

6) Páginas e UX (estado atual)

6.1 /login
• Abas: E-mail, Telefone (SMS + Recaptcha invisível dev), Google.
• Ao logar, redireciona para /dashboard.

6.2 Sidebar (components/layout/Sidebar.tsx)
• Desktop: sidebar fixa (w-60) com **ThemeToggle** na parte inferior e nav.
• Mobile: Topbar fixa (h-14) + drawer lateral; botões de abrir/fechar com **área 40×40**.
• As páginas compensam com `pt-14 md:pt-0 ml-0 md:ml-60`.

6.3 /dashboard
• Header stackável (mobile → `flex-col`, desktop → `flex-row`), sem scroll horizontal (`overflow-x-hidden` no wrapper).
• Filtros (se admin): vendorId, região, status (Form Kit: Label/Input/Select).
• Gráficos: **ResponsiveContainer** (altura `h-72 md:h-80`), legenda clicável para ligar/desligar série (“Faturamento”).
• Recharts herda `currentColor`; tooltip/grades via CSS.
• ThemeToggle **no header (desktop)** além da sidebar.
• Tabela (se houver): header sticky; tokens; a11y aplicada.

6.4 /numbers
• **Seleção de Grupo** (lista) e grade **0..70 por grupo (responsiva)**.
• `role="list"/"listitem"`, `aria-label` por estado; countdown `aria-live`.
• **Anti-duplo clique**: estado `busy` por número; botões com `disabled` + `aria-disabled` + estilos `disabled:*`.
• Estados visuais:
  – available → bg-surface text-foreground border-border (branco)
  – reserved (meu) → bg-warning/10 text-warning border-warning/30 (amarelo)
  – reserved (outro) → igual + opacity-60 cursor-not-allowed
  – sold (pago) → bg-success/10 text-success border-success/30 (verde)
  – **pendente (venda criada com status=pendente)** → amarelo (permite confirmar ou cancelar) **[próximo lote]**
• Ações:
  – Clique em available → reserva e abre **Registrar venda**.
  – Em pendente: confirmar (vira sold) ou cancelar (volta a available) **[próximo lote]**.
  – Em sold: permitir **contestar/cancelar** (admin) — **[próximo lote]**.
  – Tooltip/hover em sold mostrando **nome do cliente** — **[próximo lote]**.

6.5 /clients
• Header responsivo (filtros + “Novo cliente”) — estabilidade em mobile.
• **Form Kit nos modais** (editar/mover): Label/Input/Select; tokens mantidos.
• **A11y na tabela**: wrapper com `aria-busy`, `<caption className="sr-only">`, `<th scope="col">`, contador com `aria-live`, botões “Editar/Mover” com `aria-label`.
• Tabela responsiva com wrapper `overflow-x-auto`, thead sticky; linhas hover `bg-surface`.

6.6 /vendors
• Lista e ativa/desativa (admin). Tabela responsiva + sticky; status `text-success`/`text-warning`. Botões tokenizados.

6.7 /sales
• **Form Kit nos filtros** (Status, Vendedor, Período).
• **A11y na tabela**: wrapper com `aria-busy`, `<caption className="sr-only">`, `<th scope="col">`, contador com `aria-live`, botão “Carregar mais” com `aria-label`.
• Tabela responsiva + sticky; chip status pago/pendente via tokens; paginação “Carregar mais”.

⸻

7) Lógica crítica — Reserva → Venda
Fluxo:
1. Clique em número available → update groups/{groupId}/numbers/{n} para reserved com lock { by: uid, until }.
2. Abre modal com initialNumber/initialGroupId.
3. POST /api/sales/create com idToken: server valida ativo/lock/expiração; transação cria sales e seta number→sold (limpa lock).
4. UI atualiza para verde.

Refinos Lote 3 (próximo):
• Se criar venda com **status=pendente**, o número permanece **amarelo** até confirmação/cancelamento.

⸻

8) Operações — comandos úteis

8.1 Tornar alguém admin

curl -X POST http://localhost:3000/api/admin/grant-role \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"email":"alguem@gmail.com","role":"admin"}'

Login → curl → logout/login.

8.2 Seed de números (LEGADO)

GET /api/seed/numbers?max=1000&secret=ADMIN_SECRET

8.3 Expirar reservas vencidas

curl -X POST http://localhost:3000/api/maintenance/expire-reservations \
  -H "x-admin-secret: $ADMIN_SECRET"

⸻

9) Deploy (Vercel)
• Setar todos os envs (frontend + admin). Em especial FIREBASE_ADMIN_PRIVATE_KEY com \n.
• Auth → Authorized domains: incluir domínio do deploy.
• Providers habilitados no Firebase Auth: Email/Password e Phone (produção com Recaptcha ativo).
• API Routes com runtime='nodejs' (ok no Vercel).
• Pós-deploy: grant-role e seed (se base vazia).

⸻

10) Cron Jobs (Vercel)
• `CRON_SECRET` definido.
• Job em **Settings → Cron Jobs**:
  – Path: `/api/maintenance/expire-reservations`
  – Schedule: `*/5 * * * *`
  – Vercel envia `Authorization: Bearer ${CRON_SECRET}` (aceito pela rota).

⸻

11) Alertas e boas práticas
• Não exponha ADMIN_SECRET/CRON_SECRET.
• PRIVATE KEY com \n (erro comum é colar multilinha sem escapar).
• Regras Firestore: sold **só via API**; client é UX, segurança é no server.
• Vendedor inativo: validar também no server (mantido).
• Phone Auth (dev): appVerificationDisabledForTesting=true; remover em prod.
• Índices: se o Console pedir mais, criar e registrar no firestore.indexes.json.
• PII: armazenar o mínimo necessário; não logar dados sensíveis no client.
• **Acessibilidade**: use `scope="col"` nos `<th>`, `aria-busy` durante loads, `aria-live` ao atualizar contadores, `aria-label` descritivos para botões, `role="list"` nos grids quando aplicável.

⸻

12) Roadmap — **Próximos ajustes (polimento e recursos)**
1) **Tempo de duração do grupo**:
   – Campo `durationMin`/`endsAt` em `groups/{id}`; cron/worker para fechar grupo ao expirar (status → `standby`).
   – Ao fechar, **sortear 1 número (0..70)** entre os **vendidos (pago)**; persistir `drawnNumber`.
   – UI: seção "**Grupos (histórico)**" listando grupos fechados com `drawnNumber` e período.
2) **Estados de venda x cor do número**:
   – Quando criar venda com **status=pendente**, o número permanece **amarelo** até confirmação.
   – Ações no grid: confirmar pendente → sold (verde); cancelar pendente → available (branco).
3) **Contestação/Cancelamento de venda (sold)**:
   – Ação no grid/modal para cancelar venda (admin); marcar `canceled: true` no número e reabrir (ou manter histórico conforme regra).
   – **Tooltip**/hover mostrando `clientName` no estado sold.
4) **UX/Polimento (Dashboard)**:
   – Ticks/legendas dos gráficos: formatter de eixos para evitar sobreposição.
   – Filtros do Dashboard: garantir listas selecionáveis (vendor/região) 100%.
5) **Manutenção/CRON**:
   – Ajustar `/api/maintenance/expire-reservations` para respeitar `NEXT_PUBLIC_RESERVATION_TTL_MS` e limpar reservas por grupo.
   – Novo endpoint `/api/groups/close` (opcional) para fechar manualmente e sortear (admin).
6) **Segurança/Prod**:
   – Remover/fechar rotas `api/debug/*` no build de produção.
   – Validar claims/roles em todas as rotas novas.
7) **Relatórios/Export**:
   – Export CSV por grupo/histórico.
8) **Testes**:
   – Unit (Zod/hooks) + e2e (Playwright).

⸻

13) Troubleshooting
• auth/argument-error (Recaptcha): criar <div id="recaptcha-container" />, instanciar após mount; em dev, appVerificationDisabledForTesting=true.
• firebase-admin no Edge: garantir `export const runtime='nodejs'` nas rotas.
• invalid token nas APIs: enviar Authorization: Bearer <idToken> (auth.currentUser.getIdToken()).
• unauthorized nos endpoints de setup: x-admin-secret incorreto.
• number_not_reserved_by_you: reserva expirada ou de outro uid → refazer reserva.
• Scroll lateral no mobile: confirmar `overflow-x-hidden` no wrapper de página e header stackável (`flex-col` em <sm).

⸻

14) Linha do tempo (resumo)
• **Lote 1** — theming, layout responsivo, componentes base, páginas principais.
• **Lote 2** — Form Kit, a11y de tabelas, anti-duplo clique, toggles/UX, refinamento de páginas.
• **Lote 3 (parcial desta sessão)** — Grupos 0..70 por vendor; grade por grupo; API de toggle reserva; Modal de venda integrado a grupos/números; Região como Select; correções de imports/env.

Arquivos tocados/criados (sessão atual)
• **Criados**:
  – `src/app/api/groups/[id]/numbers/route.ts` (GET lista / POST toggle reserva).
  – `src/app/api/groups/list/route.ts` (listar grupos via Admin SDK).
  – `src/app/api/debug/admin-key/route.ts` (dev) e `src/app/api/debug/admin-health/route.ts` (dev).
  – `src/lib/regions.ts` (REGIONS + regionLabel).
• **Atualizados**:
  – `src/app/api/groups/create/route.ts` — cria grupos 0..70 e valida vendor.
  – `src/app/numbers/page.tsx` — carrega grupos via API, mostra grade 0..70, reserva/libera via API.
  – `src/components/dashboard/NewSaleModal.tsx` — grupos/números por API; região Select; auto-preenchimento por cliente; correção das deps de `setValue`.
  – `src/app/clients/page.tsx` — Região (lista) ao registrar/editar cliente.
  – `src/app/vendors/page.tsx` — ativa/desativa (admin).
  – `src/lib/firebaseAdmin.ts` — inicialização tolerante.
  – `src/lib/firebase.ts` — ajustes de import/persistência.
• **Sem remoções** de arquivos de produção (rotas de debug são temporárias e devem ser removidas/guardadas antes do deploy final).

⸻

RELATÓRIO — Lote 3 (parcial) — Sessão atual

O que foi implementado/agora funciona
• **Grupos 0..70**: criação de grupos (admins) populando subcoleção `groups/{id}/numbers/0..70`.
• **Números por grupo**: página `/numbers` com seletor de grupo e grade 0..70 carregados via API.
• **Reserva via API**: `POST /api/groups/{id}/numbers` com transação (available ⇄ reserved; sold inalterado).
• **Modal Registrar venda** integrado:
  – Carrega **Grupos** (via `/api/groups/list`) e **Números** do grupo (via `/api/groups/{id}/numbers`).
  – `ensureReserved` usa a API (não escreve direto do client).
  – **Região** é um `<Select>` (REGIONS/regionLabel) e **preenche automática** ao escolher o cliente.
  – Vendedor logado pré-selecionado.
• Correções de DX:
  – `@/lib/regions` criado/referenciado; erro de import resolvido.
  – Ajustes em `firebase.ts` para evitar conflito de imports do Auth (persistências duplicadas).
  – Rotas de debug (dev): `/api/debug/admin-key`, `/api/debug/admin-health`.

Pending / Backlog imediato (próximo sublote)
1) **Tempo de duração do grupo** e **fechamento automático (standby)** + **sorteio (drawnNumber)**.
2) **Estado pendente**: número amarelo; confirmar/cancelar pendente.
3) **Contestação de sold** + hover com `clientName`.
4) **Dashboard**: ajustar ticks/legendas (não sobrepor).
5) **CRON**: considerar grupos; endpoint `/api/groups/close` (manual) opcional.
6) **Segurança/Prod**: remover `api/debug/*` e validar claims em todas as rotas novas.
7) **Export/Relatórios** por grupo.

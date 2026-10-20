# Reação do cliente chega pelo WAHA compartilhado — Plano

> **Status: NÃO INICIADO (2026-10-20).** Aguarda o ok do dono para abrir o PR e, depois do teste no staging, para mexer nas sessões de produção.

**Goal:** o 👍/😐 que o cliente manda pelo WhatsApp (canal por QR, WAHA compartilhado `wa-ha`) passa a chegar ao CRM em produção.

**Por que não chega hoje (medido em 2026-10-20):** a upstream #2797 assinou `message.reaction` só em `WHATSAPP_HOOK_EVENTS` dos arquivos de compose. Na produção o serviço `waha` do compose está desligado (`docker-compose.axis.yml`, `profiles: waha-externo-nao-usado`); o CRM usa o `wa-ha` externo e o app grava o webhook **em cada sessão** (`WAHA_SESSION_WEBHOOK`, `lib/waha/client.ts`). A lista dessa gravação é `EVENTOS_DO_WEBHOOK` e não tem `message.reaction`. Nas 5 sessões `org_*` em `WORKING` do `wa-ha`, nenhuma assina o evento. **Atualizar o compose da produção não resolve.**

**Regras do dono:** PR só no fork (`-R axis-digital/DeskcommCRM`), base `develop`; staging antes da `main`; produção só com autorização explícita (o classificador do Claude Code bloqueia deploy de produção até o usuário confirmar). Sem mudança de schema.

## Task 1: a lista de eventos do código acompanha a do compose

**Files:**
- Modify: `lib/waha/client.ts` (`EVENTOS_DO_WEBHOOK`)
- Test: `lib/waha/ingest-reacao.test.ts` (já guarda os compose) ou arquivo irmão

- [ ] **Step 1: teste que falha.** `EVENTOS_DO_WEBHOOK` contém `message.reaction`, e é **igual**, como conjunto, à lista de `WHATSAPP_HOOK_EVENTS` de `docker-compose.prod.yml` (hoje o comentário do código diz que são "os mesmos", e divergiram).
- [ ] **Step 2: rodar e ver falhar** (`pnpm vitest run lib/waha`).
- [ ] **Step 3: incluir `"message.reaction"`** na lista e corrigir o comentário.
- [ ] **Step 4: rodar e ver passar**, depois `pnpm test:unit` inteiro (a suíte inteira, não a área: ver as lições em `mem_20261020_fff42dc1c263442089a7`).
- [ ] **Step 5: PR → develop**, CI verde, mesclar.

## Task 2: provar no staging

- [ ] Aplicar `develop` no staging (procedimento em `mem_20261006_c02e5c932c1a4509b531`). Sem schema novo: não reaplicar baseline.
- [ ] Regravar o webhook de uma sessão do WAHA próprio do staging (`deskcomm-staging-waha-1`) com `WahaClient.convergirConfigDaSessao` e confirmar que a lista inclui `message.reaction`.
- [ ] Mandar uma reação real de um aparelho de teste e conferir a linha gravada (`ingest.ts`, ramo `message.reaction`) e que ela **não** passa pelos gatilhos (migration 0684).

## Task 3: sessões já existentes em produção (SÓ com autorização)

Sessão criada antes do conserto continua com a lista antiga: só passa a assinar quando o webhook é regravado. Não achei rotina automática para isso.

- [ ] Deploy do `develop`/`main` em produção (script e rollback em `mem_20261020_fff42dc1c263442089a7`).
- [ ] Regravar o webhook das sessões `WORKING` (5 em 2026-10-20: 3 de `org_bc1e396c_*`, `org_a1445ba1_*`, `org_0d63d923_*`) por `convergirConfigDaSessao`, **uma de cada vez**, conferindo a lista depois de cada uma.
- [ ] Reação real em uma sessão de produção, com número combinado com o dono (envio real de WhatsApp é do usuário).
- [ ] **Não mexer** nas sessões estranhas do `wa-ha` (`org_bc1e396c_bd42…` em `FAILED`; `Whatsapp_WhatsApp-Davi_CWID_1` e `Whatsapp_WhatsApp-RD-Tech_CWID_15`, sem webhook, parecem sobras do Chatwoot) sem pedir.

**Destino (DoD 18):** núcleo (corrige o canal por QR em modo compartilhado). **Fragmento `.changes/`:** `capacidade_nova`/`corrigido`, voz do operador.

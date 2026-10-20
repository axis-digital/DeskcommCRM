# Worker não pode cair ao derivar um PDF — Plano

> **Status: NÃO INICIADO (2026-10-20).** Achado no fechamento da sessão do funil/dossiê, depois do deploy de produção. Aguarda decisão do dono; mudança em produção só com autorização.

**Goal:** receber ou enviar um PDF não derruba o `deskcommcrm-worker-1` (hoje: *heap out of memory*, reinício em loop).

**Evidência (só leitura, 2026-10-20):** `RestartCount=10`, todos por `FATAL ERROR: Reached heap limit … JavaScript heap out of memory` (heap ~250 MB; limite do container 512 MiB; `OOMKilled=false`), entre 11:57 e 12:22 UTC. Cada crash vem poucos segundos depois de um `[media-derive] transcrição resolvida` e de um **documento PDF** (3 PDFs de 280–350 kB às 11:57:41 → 3 crashes; depois 433 kB, 322 kB, 390 kB e 1,7 MB). Áudios, imagens e webp do mesmo período processaram normalmente. Antes das 11:57 o worker ficou 11,5 h estável; desde as 12:22, também. Staging (mesma imagem) não teve PDFs na janela e tem 0 reinícios.

**O que não se sabe:** se já acontecia antes do deploy (o container antigo foi recriado e levou os logs). Indícios de que é anterior: `workers/media-derive-worker*.ts` e `pdfjs-dist` não mudaram desde `43b265c10`; um teste local com um PDF simples rodou igual na imagem antiga (`:axis-rollback-20261020`) e na nova (`lib/ai/rag/extractors/pdf.ts`, `--memory=512m`, 3 extrações, `heapUsed` ~118 MB, aviso `standardFontDataUrl`). Os PDFs reais não foram testados (dado de cliente).

**Impacto:** o worker faz as respostas da IA e os envios de **todas** as organizações; enquanto um PDF está em derivação ele reinicia a cada ~5 s até esgotar as tentativas. Hoje está estável, mas o próximo PDF pode repetir.

**Regras do dono:** PR só no fork (`-R axis-digital/DeskcommCRM`), base `develop`; staging antes da `main`; produção só com autorização explícita (o classificador do Claude Code bloqueia deploy de produção até o usuário confirmar). Sem mudança de schema.

## Task 1: reproduzir com PDF real, no staging

- [ ] Com **autorização do dono** para usar um PDF real de cliente (ou um PDF de teste equivalente: 300 kB–2 MB, com fontes embutidas e imagens), enviá-lo ao canal do staging (WAHA próprio `deskcomm-staging-waha-1`).
- [ ] Medir o heap do `deskcomm-staging-worker-1` (`docker stats` + log) com o limite atual e com `NODE_OPTIONS=--max-old-space-size=768` / `mem_limit` maior. Confirmar se o crash reproduz e a partir de que tamanho.
- [ ] Se **não** reproduzir no staging, reproduzir em container descartável com a imagem de produção (`docker run --rm --memory=512m`, sem rede) chamando `extractPdfText` com o mesmo PDF.

## Task 2: decidir a correção (o dono escolhe)

- [ ] **(A) Heap e limite do worker** no overlay `docker-compose.axis.yml` (`NODE_OPTIONS=--max-old-space-size=768`, `mem_limit: 1g`). Pequeno e reversível; não corrige a causa, só dá folga. Mudança em produção.
- [ ] **(B) Rollback das imagens** para `:axis-rollback-20261020`. Provavelmente **não resolve** (o extrator é o mesmo) e perde as features do release.
- [ ] **(C) Correção de código:** a derivação de PDF passa a ter memória limitada: teto de páginas e de tamanho, ou processo filho com heap próprio, ou recusa sem derivar (o PDF é entregue e guardado de qualquer jeito; só o texto derivado fica de fora), e a falha vira registro, nunca queda do worker. Teste com PDF real que **falha antes** (heap acima do teto) e passa depois.

## Task 3: verificação

- [ ] `pnpm test:unit` inteiro (inclui o `pdf-extractor.test.ts`, vermelho na linha de base com `m.extractPdfText is not a function` no harness; investigar se é o mesmo problema ou só o teste).
- [ ] Prova no staging: 3 PDFs seguidos, `RestartCount` do worker continua 0.
- [ ] Só então, com autorização, produção (script e rollback em `mem_20261020_fff42dc1c263442089a7`) e acompanhar o `RestartCount` por algumas horas com PDFs reais.

**Destino (DoD 18):** núcleo (estabilidade do worker). **Fragmento `.changes/`:** `corrigido`, na voz do operador.

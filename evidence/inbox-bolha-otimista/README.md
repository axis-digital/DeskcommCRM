# Prova em tela — bolha otimista no envio de mídia (PR #21)

Staging `staging.deskcomm.axisaceleradora.com.br`, imagem construída de `73034c33e`,
baseline da branch reaplicado. 2026-10-15. Playwright (Chromium, 1280×800), conversa
`[TESTE] Cliente GA4`.

**Sem envio pelo WhatsApp:** o staging tem WAHA `WORKING` num número real, então todo
`POST /api/v1/messages` foi abortado NO NAVEGADOR (`postsBloqueados: 2` — envio +
retentativa; nenhum chegou ao servidor). O upload para o Storage foi real, atrasado
2 s de propósito para o "Enviando…" ficar observável.

| Medida | Valor |
|---|---|
| Clique em "Enviar" → diálogo fechado | 278 ms |
| Clique → bolha local na tela | 280 ms |
| Status da bolha durante o envio | "Enviando…" |
| Composer liberado durante o envio | sim |
| Status após a falha | "Não enviada", com "Tentar de novo" e "Descartar" |
| Legenda preservada na falha | sim |
| Prévia (`blob:`) preservada na falha | sim |
| Retentativa (POST bloqueado de novo) | volta a "Não enviada" |
| "Descartar" | bolha some |

Números brutos em `medidas-sem-envio.json`.

## Achado e conserto

`03-nao-enviada-ANTES-do-conserto-abaixo-da-dobra.png`: ao virar "Não enviada" a bolha
cresce e o fio não rolava — status e botões ficavam abaixo da dobra. Consertado em
`5491b669a` (a troca de fase entra nas dependências da rolagem), com teste e sabotagem
(1 vermelho de 5, o previsto). **Esta captura é anterior ao conserto; o staging ainda
roda a imagem de `73034c33e`.**

## O que NÃO foi provado em tela

- A bolha local virando a mensagem real sem duplicar: exige envio de verdade pelo WAHA
  (número real). Coberto por `hooks/inbox/useEnviosDeMidia.test.tsx` e
  `tests/unit/chat-thread-bolha-otimista.test.tsx`.
- O conserto da rolagem na tela (staging não reconstruído depois dele).

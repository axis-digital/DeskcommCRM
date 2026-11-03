# Contrato do provisionador de proxy por sessão WAHA (v1, proposta)

**Estado:** proposta. Nenhum workflow n8n implementa este contrato ainda, e nada foi aplicado em produção. Plano de origem: [`docs/superpowers/plans/2026-10-30-proxy-individual-waha.md`](../plans/2026-10-30-proxy-individual-waha.md), Fase 2. Cliente: [`lib/waha/provisionador-de-proxy.ts`](../../../lib/waha/provisionador-de-proxy.ts). Barreira: [`lib/waha/proxy-antes-do-inicio.ts`](../../../lib/waha/proxy-antes-do-inicio.ts).

## O que o contrato faz e o que não faz

Faz: dado uma sessão WAHA **existente e parada** (`STOPPED`), reservar um proxy do pool para ela, gravar `config.proxy` por merge, reler a sessão para confirmar e devolver um recibo sem credenciais.

Não faz, em nenhuma resposta: `start`, `restart`, troca de IP de sessão que já tem proxy, liberação de proxy (a liberação aos 14/30 dias é da Fase 4, não deste endpoint), criação ou exclusão de sessão.

## Requisição

`POST {PROVISIONADOR_URL}` com `Content-Type: application/json`.

| Item | Regra |
|---|---|
| `Authorization: Bearer <token>` | Obrigatório. Um token por instalação, nunca em query string nem no corpo. Ausente ou errado: `401`, sem corpo útil. |
| `instance` | Identificador da instância WAHA (ex.: `principal`). A identidade da sessão é o par `(instance, session_name)`. Instância fora da lista permitida do token: `403`. |
| `session_name` | Nome exato da sessão, 1 a 54 caracteres, sem espaços nas pontas. O servidor só atua em sessões da lista de propriedade do token; nome arbitrário ou de outro sistema: `403`. |
| `operation_id` | UUID gerado pelo CRM por tentativa de conexão. Serve para rastro e retomada; **a idempotência é pela identidade `(instance, session_name)`**, não por ele. |

Corpo: `{ "instance": "...", "session_name": "...", "operation_id": "<uuid>" }`. Campos extras: `400`.

## Resposta

Todo desfecho de domínio volta com **HTTP 200** e um campo `resultado`; falha de infraestrutura volta com 4xx/5xx sem corpo útil e é tratada pelo cliente como `indisponivel`. Corpo sempre estrito (sem campos extras) e **nunca** com usuário, senha ou URL com credenciais.

| `resultado` | Significado | Campos além de `instance`, `sessao`, `operation_id` | O CRM faz |
|---|---|---|---|
| `confirmado` | Sessão tem proxy do pool, confirmado por GET posterior | `server` (`host:porta`, sem credenciais), `reutilizado` (boolean: já estava reservado) | Segue; a barreira ainda relê a sessão no WAHA |
| `pool_esgotado` | Nenhuma linha válida e livre | — | Não inicia; aviso recuperável ("sem proxy disponível") |
| `conflito` | Sessão já tem proxy que diverge do pool, ou o proxy pertence a outra sessão | `codigo`: `proxy_de_outra_sessao`, `divergente_do_pool`, `sessao_nao_parada` | Não inicia; encaminha para revisão; não troca IP |
| `incerto` | O PUT pode ter sido aplicado e a confirmação falhou | — | Não inicia; repete **a mesma** chamada (mesma identidade); nunca assume falha |
| `indisponivel` | Pool, WAHA ou workflow fora do ar | — | Não inicia; aviso recuperável |

O cliente só trata `confirmado` como sucesso. Qualquer corpo 200 fora deste formato (campo faltando ou extra, `instance`, `sessao` ou `operation_id` diferentes dos enviados, `server` com credencial ou caminho, JSON ilegível) é `incerto` no cliente: o servidor processou a chamada e o efeito é desconhecido. Resposta não-2xx (inclusive 401/403) é `indisponivel`, e o corpo nunca é lido nem repassado. Nome de sessão ou `operation_id` inválidos são recusados no cliente, antes de enviar, como `indisponivel`.

## Obrigações do servidor, em ordem

1. Autenticar, validar `instance` e `session_name` contra a lista de propriedade do token.
2. GET completo da sessão no WAHA. Estado diferente de `STOPPED`: `conflito/sessao_nao_parada` (a Fase 4 trata o resto).
3. Sessão já com `config.proxy`: reconciliar com o pool. Mesma sessão e mesmo endereço: `confirmado` com `reutilizado: true`. Endereço fora do pool, ou de outra sessão: `conflito`. Endereço no pool e livre: registrar como em uso (função de registro da Fase 1) e `confirmado`.
4. Sem proxy: reservar em transação (bloqueio de linha, uma reserva por identidade; repetição devolve a mesma). Sem linha: `pool_esgotado`.
5. Persistir a intenção **antes** do PUT; PUT com merge somente de `config.proxy` (webhooks, ignore, grupos, acervo e campos desconhecidos preservados); GET de confirmação comparando identidade e endereço.
6. Timeout, queda ou resposta ambígua em qualquer ponto depois da reserva: marcar `incerto` e responder `incerto`. **Nunca liberar a linha por timeout.**
7. Orçamento de tempo do servidor menor que o do cliente (cliente: 15 s por padrão), para o cliente receber `incerto` e não um corte.

## Lado do CRM

- Modo gerenciado é opt-in. Sem ele, o contrato legado (`WAHA_SESSION_PROXY` fixo ou nenhum proxy) segue como está; os dois modos juntos são recusados.
- O erro que o operador vê usa só o `codigo` seguro do cliente (`pool_esgotado`, `conflito`, `incerto`, `indisponivel`), nunca endereço, usuário ou senha.
- Timeout ou erro de rede **depois** de enviar a requisição é `incerto`, não `indisponivel`: a requisição pode ter chegado.

## Fora deste contrato

Liberação aos 14/30 dias, limpeza de `config.proxy` de sessão parada, rotação semanal e watchdog: Fase 4 do plano. Ligar o modo opt-in nas rotas: Fase 3. Contrato correspondente no n8n e provas em ambiente isolado: Fase 5.

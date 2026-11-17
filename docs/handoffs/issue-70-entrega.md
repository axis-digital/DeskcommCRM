# Issue #70 — aviso de fora do horário por organização: entrega técnica

> Estado: **implementado e verificado na bancada local, NÃO commitado**. Nada foi
> enviado a remoto, nenhum PR aberto, nenhum merge ou deploy. A publicação exige o
> Gate 2.

Branch: `daviguerreiroa/atendimento-aviso-de-fora-do-hor-rio-para-organi`
(destino: fork `axis-digital/DeskcommCRM`, base `main` — **nunca** no `upstream`).

## O que a entrega faz

A organização liga, em **Atendimento → Aviso de fora do horário**, um texto fixo,
as janelas de atendimento por dia da semana e o fuso. Quem escreve fora dessas
janelas recebe o aviso **uma vez por período fechado**, sem agente de IA. Quando o
agente da conversa tem o aviso legado configurado, o aviso da organização vence e o
legado se cala: exatamente um envio.

Regras que o envio respeita, provadas por teste: bloqueio/opt-out, titular
anonimizado, conversa de grupo, número interno, pacing (resposta: janela de
cortesia aberta, throttle e warm-up mantidos), dedupe atômico por
`(organization_id, contact_id, inicio_periodo)` e não-repetição de envio com
resultado `incerta`.

## Peças (CONFIRMADO — lido do código)

| Arquivo | Papel |
|---|---|
| `lib/agent-engine/agent/configuracao-aviso-organizacao.ts` | Schema Zod (fonte única do teto de texto), `lerConfiguracaoAvisoOrganizacao`, `avaliarHorarioDoAviso` |
| `lib/agent-engine/agent/janela-de-atendimento.ts` | `periodoFechadoSemanal` (união de janelas, DST, início do período) |
| `lib/agent-engine/agent/aviso-organizacao-consumidor.ts` | Fluxo puro: vetos → horário → pacing → reserva → envio |
| `lib/agent-engine/agent/aviso-organizacao.handler.ts` | Portas de produção, leituras SQL, upsert da reserva, `sendMessageHandler` |
| `lib/agent-engine/pacing/aviso-imediato.ts` | `decidePacingDoAviso` (o aviso é RESPOSTA) |
| `lib/agent-engine/agent/aviso-fora-do-horario.ts` | Aviso legado; porta `avisoOrganizacaoAtivo` (suprime o legado) |
| `lib/event-log/register-handlers.ts` | Handler registrado por último, `naOrgParada: "pula"` |
| `app/api/v1/aviso-organizacao/route.ts` | GET (manager+) / PATCH (admin + `requireSupportWrite` + audit) |
| `app/app/settings/atendimento/_aviso-organizacao-form.tsx` | Cartão e formulário |
| `supabase/migrations/20261117160000_9905_reserva_aviso_organizacao.sql` + apêndice em `supabase/baseline.sql` | Tabela de reserva, RLS, grants |
| `tests/invariants/reserva-aviso-organizacao.test.ts` | Isolamento, privilégios, retomada, concorrência |
| `.changes/70-aviso-de-fora-do-horario.md` | Fragmento de release (`capacidade_nova`, `adicionado`) |
| `docs/architecture/aviso-de-fora-de-horario.architecture.json` + linha em `docs/architecture/README.md` | Mapa de arquitetura (15 nós, 16 arestas) |

## Cobertura de comportamento (unit + invariante de banco)

`configuracao-aviso-organizacao.test.ts`, `aviso-organizacao-consumidor.test.ts`,
`aviso-organizacao.handler.test.ts`, `aviso-fora-do-horario.test.ts`,
`pacing/*`, `tests/unit/aviso-organizacao-rota.test.ts`,
`tests/unit/aviso-organizacao-form.test.tsx`,
`tests/invariants/reserva-aviso-organizacao.test.ts`:

- 23h de um dia útil e sábado/domingo inteiros → aviso; dentro da janela → nada.
- Janelas contíguas e sobrepostas não geram dois envios; DST não desloca o período.
- Opt-out/bloqueio, anonimizado, grupo, número interno → veto.
- Empresa ligada + agente com aviso próprio → **um** envio (o da empresa).
- Segundo período fechado → aviso novo; mesmo período → silêncio.
- Duas execuções simultâneas no mesmo período → uma reserva, um envio.
- Falha de envio com resultado incerto → não repete sozinho; reserva fica para conferência.
- Rota: GET/PATCH por papel, `requireSupportWrite`, audit, merge não-destrutivo
  (desligar preserva janelas, texto e fuso).
- Banco: isolamento cross-tenant sob RLS, privilégios de `anon`/`authenticated`,
  regra de retomada da reserva, concorrência.

## Evidência executada nesta sessão

| Comando | Resultado |
|---|---|
| `bash scripts/local-supabase.sh start` | stack local de pé, `baseline.sql` aplicado sem erro |
| `PATH=/tmp/e2e-bin:$PATH pnpm e2e:env` | `.env.e2e` apontando para `127.0.0.1:54321` |
| `pnpm e2e:build` | **exit 0** (build de produção + guarda do bundle contra host de produção) |
| `pnpm test:e2e tests/e2e/distribuicao-atendimento.spec.ts` | **3 passed** — prova que o locator escopado continua medindo a tela |
| `pnpm lint` | **exit 0** (0 errors; 725 warnings pré-existentes no repo) |
| `pnpm lint:channels` / `pnpm lint:role-rank` | exit 0 / exit 0 |
| `tsc --noEmit -p tsconfig.typecheck.json` | **exit 0** |
| `vitest run` (aviso + pacing + dispatcher + rota + form) | **10 arquivos / 140 testes verdes** |
| `vitest run tests/unit/mapas-de-arquitetura.test.ts` | **363 testes verdes** (gate do mapa) |
| `pnpm release:conferir` | **exit 0** |
| `CONFERENCIA_KIT_RELEASE=v1.113.0 pnpm test:db tests/invariants/reserva-aviso-organizacao.test.ts` | **5/5 verdes** (baseline + update com dados + isolamento) |

### Prova visual (DoD 12) — `docs/evidence/aviso-fora-do-horario/`

Spec Playwright temporária (removida depois de colher a evidência) logada como
`e2e-admin`, contra o Supabase local com o `baseline.sql`:

1. `docs/evidence/aviso-fora-do-horario/1-desligado.png` — o cartão aparece desligado, no estado do seed.
2. `docs/evidence/aviso-fora-do-horario/2-preenchido.png` — ligado, fuso `America/Sao_Paulo`, janela segunda 09:00–18:00, texto preenchido.
3. `docs/evidence/aviso-fora-do-horario/3-salvo.png` — toast de sucesso.
4. `docs/evidence/aviso-fora-do-horario/4-recarregado.png` — **depois do reload** (página server-rendered) o aviso continua ligado e o texto é o mesmo: o que a tela gravou é o que a tela lê.
5. `docs/evidence/aviso-fora-do-horario/5-desligado-preserva.png` — desligado de novo, com janelas e texto preservados.

A spec também leu `organizations.settings.aviso_fora_do_horario` direto do banco
com service role para provar que o valor gravado é o que a tela mostrou.

## Dois defeitos que a prova visual encontrou (e o conserto)

1. **Build quebrado, typecheck verde.** `_aviso-organizacao-form.tsx` importava
   `TAMANHO_MAXIMO_DO_TEXTO` de `aviso-fora-do-horario.ts`, que puxa
   `next/headers` para o bundle do browser: `Turbopack build failed — You're
   importing a module that depends on "next/headers"`. O teto foi para
   `configuracao-aviso-organizacao.ts` (módulo puro, o mesmo que a tela importa) e
   `aviso-fora-do-horario.ts` reexporta — uma fonte só. `pnpm e2e:build` voltou a
   passar.
2. **Locator compartilhado ambíguo.** A tela `/app/settings/atendimento` passou a
   ter um segundo botão "Salvar". `tests/e2e/distribuicao-atendimento.spec.ts`
   clicava `getByRole("button", { name: /^Salvar$/ })` na página inteira e
   passaria a resolver dois elementos. O conserto é no locator (escopo em
   `form-atendimento`), nunca esconder botão do produto — e a spec foi rodada de
   novo: 3/3.

## Limites declarados (não são bugs escondidos)

- **O caminho completo até a caixa de entrada não foi provado pela tela** nesta
  bancada: exigiria canal conectado e destinatário real. Ele está coberto por
  teste unitário do consumidor e por invariante de banco; a prova visual cobre a
  configuração e a persistência.
- **Timeout do envio WAHA**: o envio de texto tem deadline padrão de 15 s e o
  handler não impõe prazo global. Documentado; envio que fica `incerta` não é
  repetido.
- **Sem retentativa automática de `incerta`**: é decisão de produto (evitar
  mensagem duplicada ao cliente), com a reserva visível no banco para conferência.
- O `pnpm typecheck` do script estourou memória nesta máquina (62 GB, ~42 GB em
  uso por outros contêineres); o mesmo `tsc` rodado direto com
  `--max-old-space-size=10240` saiu **0**. Não é erro de tipo — é pressão de
  memória da bancada.

## Living System Checklist (`docs/doctrine/sistema-vivo.md`)

1. **Nada é ilha** — o aviso só existe no ramo em que o turno já ia ser adiado;
   conversa, contato, canal e pacing são as mesmas fontes do turno normal.
   CONFIRMADO no consumidor.
2. **Continuidade IA↔humano** — o aviso não substitui a IA: quando a janela abre,
   o turno roda como antes; a linha do aviso fica registrada na conversa.
3. **Log universal e visível** — o envio é uma mensagem real com
   `metadata.idempotency_key` e `MARCA_DO_AVISO`; a reserva fica em tabela
   própria, consultável.
4. **Nenhuma demanda sem próximo passo** — fora do horário o cliente recebe
   resposta; a demanda segue na fila para a abertura.
5. **Informação com propósito** — o formulário só pede o que o runtime lê (fuso,
   janelas, texto), pela mesma função (`lerConfiguracaoAvisoOrganizacao`).
6. **Configuração com superfície** — a tela é a porta; o PATCH é o único escritor.
7. **Todo laço se fecha** — reserva → envio → mensagem → dedupe pelo período; erro
   no ramo do aviso nunca derruba a resposta agendada.
8. **Regra do tempo** — observação em realtime (a mensagem chega na hora), ação no
   tempo do humano (a resposta de verdade continua na abertura da janela).

## Definition of Done

- Typecheck 0 e lint 0 (errors) — CONFIRMADO.
- Testes relevantes verdes (unit, invariante de banco, e2e da tela vizinha, mapa de arquitetura) — CONFIRMADO.
- RLS testada (isolamento cross-tenant na tabela nova) — CONFIRMADO.
- `audit()` no PATCH — CONFIRMADO.
- Zod em todo input externo (body do PATCH) — CONFIRMADO.
- Migration versionada + apêndice no `baseline.sql` + linha `-- manifest:` — CONFIRMADO.
- Prova visual com evidência em `docs/evidence/` — CONFIRMADO (5 capturas).
- `.changes/` com efeito no operador — CONFIRMADO (`capacidade_nova`, sem ação manual).
- Mapa de arquitetura atualizado — CONFIRMADO.
- Living System Checklist respondido — acima.

## Próximo passo — Gate 2

Nada está commitado. O Gate 2 cobre: `git add` das peças listadas, commit único na
branch da issue, push para `origin` (`axis-digital/DeskcommCRM`) e PR **rascunho**
com base `main` do fork. Sem merge e sem deploy. `.ecc/` (estado local da
ferramenta de memória) fica fora do commit.

# Iconografia Axis/Lucide — plano e pendências

**Status:** implementação concluída na branch `feat/axis-iconografia-lucide`; aguardando
validações de ambiente e autorização para publicar.

**Objetivo:** alinhar a iconografia do produto ao catálogo privado do Axis Design System,
preservando os nomes semânticos usados pelo código e evitando que as telas importem ícones
diretamente de uma biblioteca externa.

**Fonte de referência:** [Axis Design System](https://github.com/axis-digital/axis-design-system)
e [`docs/design-system/05-iconography-phosphor.md`](../../design-system/05-iconography-phosphor.md).
O nome do arquivo de design system foi mantido por compatibilidade; o contrato vigente é
Axis/Lucide.

## Entregue

- [x] Confirmar no repositório Axis o estilo outline monocromático, catálogo curado e traço de
  `1,75–2px`.
- [x] Centralizar os ícones em [`lib/ui/icons.ts`](../../../lib/ui/icons.ts), com imports nomeados
  de `lucide-react` e adaptador compatível com os consumidores existentes.
- [x] Preservar compatibilidade de `weight` e o tamanho legado `1em`, limitando o traço ao contrato
  Axis.
- [x] Migrar consumidores de Lucide/Phosphor para o barrel canônico e bloquear imports diretos
  via ESLint.
- [x] Remover `@phosphor-icons/react` do produto, do `package.json` e do lockfile.
- [x] Substituir logos de terceiros por ícone genérico de canal, mantendo texto e acessibilidade.
- [x] Atualizar showcase, documentação do design system e referências de integração.
- [x] Criar teste do contrato visual e corrigir os aliases semânticos `UsersThree` e `ChartLineUp`.

## Evidências

| Verificação | Resultado |
|---|---|
| Teste focado `lib/ui/icons.test.ts` | 9/9 passando |
| Typecheck com TypeScript 6 | Passou |
| ESLint com `.runtime` ignorado | 0 erros; 498 warnings preexistentes |
| Corte de release | Passou; fragmento da mudança reconhecido |
| Preview visual desktop/mobile | Conferido em `/tmp/axis-icons-desktop.png` e `/tmp/axis-icons-mobile-dark.png` |
| Rota real `/design` | **Feita (2026-10-09):** merge de `feat/axis-iconografia-lucide` na worktree de staging (`/root/projects/deskcomm-staging`, branch `feat/perfil-de-negocio-ga4`, merge limpo sem conflitos), rebuild `deskcomm-app:staging`/`deskcomm-worker:staging`, containers recriados (healthy, domínio 307). Login autenticado como Davi (admin org "Axis Teste") em https://staging.deskcomm.axisaceleradora.com.br. Seção "Iconografia" do showcase e `/app/inbox` real conferidos em light e dark — ícones outline monocromáticos, traço 1,75px, `currentColor` herdado corretamente, zero erros de console nas duas telas. |
| Suíte unitária completa | **Feita (2026-10-09):** `pnpm test:unit` 19483 passed, 1 expected fail, 1 skipped, **11 failed** — nenhuma falha toca `lib/ui/icons.ts` ou código desta feature. Classificação: 5 `rate-limit` (Redis local ausente, falha de ambiente documentada no CLAUDE.md), 1 `pdf-extractor` (pré-existente, `extractPdfText is not a function`), 1 `namespace-das-imagens` (arquivos `.env.bak-*` soltos no disco por outra sessão, não rastreados), 1 `channel-health-aviso` (timeout 15s, serviço ausente), 1 `janela-24h-recusa-quem-envia-por-token` (depende de WAHA configurado), 2 `roteador-grava-o-roteiro` (depende de `SUPABASE_DB_URL` específico ausente/divergente). Nenhuma bloqueia o PR. |
| Build de produção (`pnpm build`) | **Feito (2026-10-09):** exit 0, Node 22, `NODE_OPTIONS=--max-old-space-size=12288`. Todas as rotas compilaram, inclusive `/design`. |
| Medição de bundle (tree-shaking) | **Feita (2026-10-09):** `lucide-react` completo tem 20MB em ícones (`node_modules/lucide-react/dist/esm/icons`); barrel usa ~120 ícones nomeados; único chunk de produção com referência a `lucide` = **40KB** (`.next/static/chunks/2cm2eqwi9n8b1.js`). Confirma tree-shaking — o bundle não carrega o pacote inteiro. |

Commits da implementação:

- `ad2f85a53` — `test(ui): define contrato Axis para iconografia`
- `281dbfb2d` — `feat(ui): alinhar iconografia ao Axis Design System`
- `1d481f1ef` — `fix(ui): preservar escala dos icones migrados`

## Pendências antes de publicar

- [x] Rodar `pnpm test:unit` em um ambiente completo e classificar as falhas que não sejam
  causadas por esta mudança.
- [x] Executar a prova visual autenticada da rota `/design` (feita no staging, não precisou
  seed de credenciais novas — usou conta do Davi já existente). Comparação com baseline aprovada
  não feita (não há baseline visual versionada do showcase ainda).
- [x] Executar build de produção e medir o bundle para confirmar o benefício de tree-shaking do
  barrel.
- [ ] Fazer revisão final do diff e obter autorização explícita para `push`/PR. Nenhuma alteração
  foi publicada remotamente nesta etapa.
- [ ] **Novo (2026-10-09):** staging ficou com o merge de `feat/axis-iconografia-lucide` aplicado
  sobre `feat/perfil-de-negocio-ga4` para esta prova. Decidir: manter assim (staging passa a
  refletir as duas branches) ou reverter o staging para o estado anterior (só GA4) depois do PR
  de ícones — conferir com o dono antes de nova rodada de testes do GA4 no mesmo staging.

## Decisões que não são pendências

- O arquivo de documentação com sufixo `phosphor` não será renomeado agora: o nome é mantido para
  não quebrar links existentes.
- Não haverá logos de WhatsApp, Instagram, Messenger ou Google no barrel canônico; canais usam
  iconografia genérica e texto identificador.
- Não há impacto em banco, RLS, migrations, APIs ou dados de tenant; portanto os gates de banco e
  de shell não são necessários para esta feature.

## Próxima ação

Executar `pnpm test:unit` fora do sandbox e anexar o resultado a esta lista antes de abrir o PR.

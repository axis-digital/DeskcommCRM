# Evidência TDD — reenvio GA4/SemOrigem por plataforma

Fonte: `docs/superpowers/plans/2026-10-05-conversoes-ga4.md`, item A.1.

## Jornada

Como administrador, quero reprocessar uma conversão sem origem com falha para
que somente a plataforma que falhou receba o reenvio, sem duplicar a venda na
plataforma irmã.

## RED → GREEN

- RED: `pnpm vitest run tests/unit/conversoes-sem-origem.test.ts tests/unit/conversoes-sem-origem-no-handler.test.ts` — 17 passaram, 2 falharam pelo comportamento esperado: o fallback percorria Meta e Google, e o handler não repassava a plataforma do evento.
- GREEN: o mesmo comando — 19 passaram.
- GREEN ampliado: cinco arquivos de conversão — 56 testes passaram.

## Garantias

| Garantia | Teste | Resultado |
| --- | --- | --- |
| O fallback normal continua enviando às duas plataformas | `conversoes-sem-origem.test.ts` | PASS |
| Um reenvio recebe apenas `meta_ads` ou `google_ads` | `conversoes-sem-origem.test.ts` e `conversoes-sem-origem-no-handler.test.ts` | PASS |
| Reenvios GA4 continuam fora do handler de Meta/Google | `conversoes-sem-origem-no-handler.test.ts` | PASS |
| A RPC aceita e isola os eventos GA4/SemOrigem | `tests/invariants/conversoes-reenvio-ga4-e-sem-origem.test.ts` | 15 PASS |

## Gates executados

- `pnpm typecheck` — PASS.
- `pnpm lint` — PASS, 0 erros; o repositório reportou 501 avisos preexistentes.
- `CONFERENCIA_KIT_RELEASE=v1.77.0 pnpm test:db tests/invariants/conversoes-reenvio-ga4-e-sem-origem.test.ts` — PASS.
- Cobertura focal com `--coverage`: `reportar-sem-origem.ts` em 87,5% de statements, 76% de branches, 100% de funções e 94,11% de linhas. A execução foi focal e não representa cobertura global do repositório.

## Checkpoints

- `e2bb841b8` — teste RED.
- `21c7bb5f0` — correção GREEN.

Alterações não relacionadas que já estavam no worktree (`branding.test.ts`,
`dispatcher-org-parada.test.ts` e `origem-do-site.test.ts`) não foram incluídas.

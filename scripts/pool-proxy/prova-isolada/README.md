# Prova isolada do contrato v1 do provisionador de proxy WAHA

Ambiente **descartável** para provar o contrato
([`docs/superpowers/specs/2026-11-03-contrato-provisionador-proxy-waha.md`](../../../docs/superpowers/specs/2026-11-03-contrato-provisionador-proxy-waha.md))
sem tocar em produção. Nada aqui usa o pool real, o WAHA real nem as credenciais reais.

## O que existe

| Peça                                                           | Onde                                     | Observação                                                                        |
| -------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| Postgres de teste `proxytest-pg`                               | `compose.yml`                            | tmpfs; pool **sintético** (`proxy-sintetico-N.invalid`, hosts que nunca resolvem) |
| WAHA de teste `proxytest-waha`                                 | `compose.yml`                            | imagem `latest-2026.7.2`, chave própria, sem webhook, sem pareamento              |
| Workflow n8n `PROXYTEST - Provisionador contrato v1 (isolado)` | n8n, id `eBSaFjgccRXQ5mKG`               | **só no n8n, não versionado aqui**; credenciais `PROXYTEST - *`                   |
| Pool                                                           | `scripts/pool-proxy/reserva-atomica.sql` | o protótipo, aplicado em `public.waha_proxy_pool` sintética                       |

Os containers entram na rede `network_public` (a mesma do n8n) com prefixo `proxytest-`, sem porta
publicada. Nenhum container existente muda de rede.

## Como subir

```bash
export PT_PG_PASSWORD=$(openssl rand -hex 12)
export PT_WAHA_API_KEY=$(openssl rand -hex 16)
export PT_WAHA_API_KEY_HASH="sha512:$(printf %s "$PT_WAHA_API_KEY" | sha512sum | cut -d' ' -f1)"
docker compose -f compose.yml up -d
```

Depois: criar `public.waha_proxy_pool` sintética (colunas de `reserva-atomica.sql`), aplicar
`reserva-atomica.sql`, criar as 3 credenciais `PROXYTEST - *` no n8n e ativar o workflow.

## Como provar

Os scripts rodam **dentro** do container `proxytest-waha` (mesma rede do n8n) e nunca imprimem credenciais:

```bash
docker exec -i -e K="$PT_WAHA_API_KEY" -e T="<bearer sintético do workflow>" \
  proxytest-waha node --input-type=module - < bateria-fase1.mjs
```

1. `bateria-fase1.mjs`: autenticação, validação, domínio (24 verificações).
2. Inserir **uma** linha livre no pool, depois `bateria-fase2-concorrencia.mjs`.
3. `falhas.mjs`: injeção de falha (`docker pause proxytest-waha` em instantes escalonados) para `indisponivel` e `incerto`.

## Descartar

```bash
docker compose -f compose.yml down
```

E apagar o workflow e as três credenciais `PROXYTEST - *` no n8n.

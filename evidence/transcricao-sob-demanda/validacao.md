# Validação — 26/11/2026

Correção local na branch `fix/inbox-transcricao-por-clique`, baseada em `origin/main` `917a0738c`. Não publicada nem aplicada à produção.

| Verificação | Resultado |
|---|---|
| Vitest, 15 arquivos de comportamento e cercas relevantes | **613 casos passaram** |
| PostgreSQL fresco com baseline aplicado em install e update, seis invariantes desta mudança | **6 passaram**, incluindo dois cliques concorrentes, acesso de outra empresa e retomada pela IA |
| Playwright, inbox real em Chromium desktop e viewport 390 × 844 | **1 passou, 16,8 s** |
| ESLint de todos os arquivos de código alterados, `lint:channels`, `lint:role-rank`, formatação dos arquivos novos e `git diff --check` | Passaram |
| Auditoria de dependências de produção | 7 vulnerabilidades existentes: 1 baixa, 6 moderadas; nenhuma alta |

O Playwright usou Supabase local exclusivo (`transcricao-clique`, API 55421 / banco 55422), banco sem dados reais aplicado a partir do baseline, conta criada pela própria spec, Storage e worker reais, áudio OGG/Opus válido e fornecedor HTTP sintético. O pedido partiu do botão do inbox; a spec aguardou a resposta HTTP 202 antes de executar o worker. Foram provados: nenhum evento ao abrir a conversa; erro 402 do fornecedor local exibido no balão; nova tentativa; texto concluído; recarga sem outro pedido; layout móvel sem transbordamento horizontal. O worker sintético recebeu exatamente uma chamada por tentativa. Não houve chamada paga nem uso de áudio de cliente. Os recibos `worker-402.json` e `worker-ok.json` identificam o limite desta prova.

Capturas: `01-transcrever.png`, `02-falha-de-credito.png`, `03-transcricao-pronta.png`, `04-celular.png`. São dados de teste, não a instalação da Axis.

## Limites que impedem aprovar produção

**Typecheck completo não concluiu:** o compilador terminou por falta de heap; a tentativa com `NODE_OPTIONS=--max-old-space-size=12288` também falhou. **O build não concluiu:** a etapa de compilação do Next passou, mas a checagem de tipos não. A prova visual foi feita com `next dev`, com configuração local do Playwright que aponta para o servidor de teste conhecido e Chromium instalado. Não é prova de `next start` nem do empacotamento de produção. A spec foi registrada na matriz normal do CI, que continua usando o build de produção.

**O `test:db` completo ficou vermelho** em `scripts/conferir-isolamento-do-kit.sh:115`: a combinação `printf | grep -q` sob `pipefail` produziu SIGPIPE ao conferir o kit deste checkout. A última release e a versão antiga foram conferidas; install e update do baseline passaram. Os seis invariantes foram então executados em cópia suplementar do harness, preservando as duas aplicações do baseline e excluindo **somente essa conferência já reprovada**. A árvore ficou parada durante a execução final. O verde desses seis testes não é apresentado como verde do comando completo.

Não foram executadas a suíte unitária inteira, todas as specs E2E nem uma chamada ao fornecedor público com crédito válido. Nenhuma credencial, limite, saldo ou mensagem da produção foi alterada. A causa exata dentro da conta OpenRouter ainda exige conferência pelo administrador: os registros locais preservam o código 402, não o detalhamento do limite do fornecedor.

## Autoavaliação

| Eixo | Nota | Evidência e melhoria |
|---|---:|---|
| Precisão | 4/5 | Causa e comportamento medidos; o detalhamento do 402 na conta não foi consultado. |
| Completude | 3/5 | Clique, IA automática, retomada, falha e isolamento cobertos; typecheck/build de produção permanecem pendentes. |
| Clareza | 4/5 | Configuração e limitações estão separadas da prova sintética; a evidência técnica é extensa. |
| Ação possível | 4/5 | Operador pode conferir saldo/limite ou cadastrar chave de API pela tela; publicação depende dos gates restantes. |
| Concisão | 4/5 | Entrega curta no chat e detalhes neste arquivo; a investigação de ambiente foi longa. |

Média: **3,8/5**. Prioridades: concluir typecheck/build em ambiente com recursos adequados; repetir esta spec contra `next start`; após configurar a conta, testar um áudio autorizado contra o fornecedor real. A avaliação explicita o que a pessoa consegue usar agora e o que ainda não está em produção.

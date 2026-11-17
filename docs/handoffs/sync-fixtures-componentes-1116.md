# Fixtures do merge upstream — 16/11

Branch local `merge/upstream-2026-11-16`, renomeada pelo coordenador na mesma worktree; nenhuma troca de branch foi feita.

- Antes: os três arquivos iniciais tinham 17 falhas de montagem (`/tmp/deskcomm-fixtures-before-1116.log`); o quarto tinha três falhas de App Router (`/tmp/deskcomm-expandir-before-1116.log`). A Nuvemshop tinha duas falhas de mock de consulta e uma asserção de texto (`/tmp/deskcomm-sync-nuvemshop-page-1116.log`).
- Depois: os quatro arquivos de componentes passaram, incluindo permissões, Esc, expandir, fechamento e anexos em sequência. O Composer usa a fila otimista real com upload e POST dublados; os dossiês recebem os contextos necessários. Nenhuma asserção foi removida ou afrouxada.
- Nuvemshop: mock atualizado para consultas de catálogo e exportações atuais. Após corrigir a montagem, dois testes revelaram uma regressão real do merge: a descrição canônica de #4357 havia desaparecido. A frase traduzida de `upstream/main` foi restaurada em `page.tsx`, preservando os cartões, pedidos e sincronização do fork; nenhuma asserção foi afrouxada.
- Execução conjunta final: **5 arquivos e 23 testes passaram** (`/tmp/deskcomm-fixtures-five-after-1116.log`, exit 0); `git diff --check` dos arquivos rastreados alterados passou. Typecheck, lint, build, suíte completa e nova prova visual não foram executados nesta tarefa; o coordenador fará as validações integradas e rebuild.
- Sistema vivo: a tela de integração informa o destino e mantém o link para `/app/ai/knowledge/sources`; a restauração é leitura, sem mutação, nova configuração, fila, decisão automática ou peça arquitetural nova, portanto não cria log, anti-morte ou laço adicionais.
- Comunicação: `orca orchestration check` retornou `runtime_unavailable`; o relatório preserva o resultado para entrega ao coordenador.

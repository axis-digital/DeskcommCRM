---
impacto: nada_mudou
secao: adicionado
titulo: Instalações gerenciadas podem exigir um proxy individual confirmado para cada número de WhatsApp
---

Quem administra uma instalação gerenciada pode ligar o pool de proxy individual: com as variáveis
`WAHA_PROXY_POOL_URL`, `WAHA_PROXY_POOL_TOKEN` e `WAHA_PROXY_POOL_INSTANCE` preenchidas, cada número
novo só começa a conectar depois que o proxy dele é confirmado. Isso vale ao conectar um canal, no
onboarding, ao reconectar e quando o sistema religa uma sessão parada.

Se o proxy não for confirmado, a conexão fica parada, nada é apagado, e o cartão em Conexões explica o
motivo (sem proxy livre, proxy em revisão, serviço indisponível ou proxy não confirmado). Com as
variáveis vazias, que é o padrão, nada muda.

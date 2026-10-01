# Fork Axis do DeskcommCRM

Branch de produção: `axis` (nunca `main`, que espelha o upstream). Remotes: `origin` =
`axis-digital/DeskcommCRM` (fork), `upstream` = `melgarafael/DeskcommCRM`.

## O que é nosso (e só isso diverge do upstream)

| Arquivo | Para quê |
|---|---|
| `app/axis-theme.css` | Tokens do design system Axis (claro/navy, raios, sombras, fontes). Não editar `globals.css`. |
| `app/layout.tsx` | 1 import do tema + 3 fontes (`--font-axis-*`) + `preload:false` nas antigas. |
| `app/fonts/inter-variable-latin.woff2` | Inter (OFL), registrada no README de fontes. |
| `docker-compose.axis.yml`, `Caddyfile.axis` | Override de deploy (Traefik do servidor, WAHA externo, imagens locais `:axis`). |
| `lib/waha/client.ts` (+ teste) | Suporte a WAHA compartilhado (commit `93c239063`). |
| `docs/brand/axis/` | Logo e símbolo oficiais (SVG + PNG prontos para subir em `/admin/marca`). |

## Receber atualização do upstream

```bash
git fetch upstream
git switch axis && git switch -c sync/upstream-AAAA-MM-DD
git merge upstream/main            # conflito provável só em app/layout.tsx (fontes)
pnpm test:unit && pnpm typecheck   # inclui tailwind-tokens e branding
git switch axis && git merge --no-ff sync/upstream-AAAA-MM-DD
```

Depois do merge: conferir se `globals.css` ganhou token novo (`git diff ORIG_HEAD -- app/globals.css`)
e, se sim, definir o valor Axis dele em `app/axis-theme.css` nos DOIS temas.

## Marca em runtime (não é código)

Nome, cor e logo vêm do banco (`/admin/marca`) com `.env` como semente: `APP_NAME`,
`APP_ACCENT_HEX`. O accent passa pela derivação de contraste de `lib/branding`, que escurece
o laranja `#F04801` até o texto branco caber — ver a decisão registrada na sessão do tema.

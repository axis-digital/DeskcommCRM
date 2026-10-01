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
`APP_ACCENT_HEX`. O accent passa pela derivação de contraste de `lib/branding`.

**Use `APP_ACCENT_HEX=#C03800`** (o `accent-strong` do design system, branco sobre ele = 5,5:1):
a derivação o mantém. Com o `#F04801` puro ela escurece o botão até `#913214` (marrom). No tema
escuro a própria derivação clareia o accent (`#F96B40`, texto escuro no botão).

Tokens do tema seguem a seção "Cor e contraste" do design system (escalas 50–950, texto em
níveis, `line-control` nas bordas de campo). Exceções registradas em `app/axis-theme.css`:
`text-subtle` fica em ≥4,5:1 (o `ink-subtle` do DS é só 3:1) e `danger` no escuro compartilha o
matiz do accent, como o DS declara.

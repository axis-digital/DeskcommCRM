# 05 — Iconografia Axis/Lucide

> **Source of truth:** catálogo curado do Axis Design System, implementado por `lucide-react` e
> exposto no produto somente por `@/lib/ui/icons`.

O nome deste arquivo é mantido por compatibilidade com links existentes. O contrato vigente é
Axis/Lucide; Phosphor não faz mais parte da iconografia canônica.

## Princípios

- **Outline monocromático.** O ícone usa `currentColor`, sem preenchimento decorativo, duotone ou
  gradiente.
- **Traço consistente.** O padrão é `1.75px`; `2px` é o máximo e fica reservado a ênfase em
  controles pequenos. Nunca use traço acima de `2px`.
- **Catálogo curado.** Use apenas símbolos exportados por `@/lib/ui/icons`. Um ícone ausente entra
  primeiro no barrel e neste mapeamento; não importe diretamente do pacote nem desenhe um SVG
  local.
- **Função antes da marca.** Plataformas terceiras recebem um ícone genérico que descreve o canal
  ou a ação. Não redesenhe logotipos dentro da família Lucide.
- **Texto continua soberano.** O ícone reforça uma ação, um estado ou um destino; não substitui um
  rótulo necessário para compreensão.

## Uso no código

O pacote oficial é `lucide-react`, mas componentes do produto importam apenas o barrel canônico:

```tsx
import { ChatCircle, MagnifyingGlass, Plus } from "@/lib/ui/icons";

<ChatCircle size={20} aria-hidden="true" />
<MagnifyingGlass size={20} className="text-text-muted" aria-hidden="true" />
<Plus size={16} strokeWidth={2} aria-hidden="true" />
```

Não faça:

```tsx
import { Search } from "lucide-react";
```

O barrel mantém os nomes semânticos usados pelo produto e permite evoluir a implementação sem
espalhar dependência de pacote pelas telas.

## Tamanhos canônicos

Quatro tamanhos. Não invente intermediários.

| Tamanho |  px | Uso                                               |
| ------- | --: | ------------------------------------------------- |
| `xs`    |  16 | Inline em texto, badge ou link                    |
| `sm`    |  20 | Navegação, toolbar e ícone à esquerda de botão    |
| `md`    |  24 | Ações de cabeçalho, listas e empty state compacto |
| `lg`    |  32 | Empty state grande e feature card                 |

Acima de 32px, prefira ilustração em vez de ampliar um ícone de interface.

## Cor e traço

Ícones herdam `currentColor`. Use tokens semânticos; nunca grave cor hexadecimal ou cor de marca no
componente.

```tsx
// Padrão Axis: 1.75px, herdado do barrel
<MagnifyingGlass className="text-text-muted" aria-hidden="true" />

// Ênfase excepcional em controle pequeno: máximo 2px
<Plus size={16} strokeWidth={2} className="text-accent" aria-hidden="true" />

// Estado semântico continua monocromático
<CheckCircle className="text-success" aria-hidden="true" />
```

Não use `fill`, `strokeWidth` maior que `2`, duas cores no mesmo ícone ou opacidade interna para
simular duotone.

## Mapeamento canônico — função → ícone

Use estes símbolos para manter a mesma linguagem nas telas. Se a função não estiver na lista e não
tiver equivalente claro no catálogo, proponha a inclusão antes de escolher um ícone avulso.

### Navegação principal

| Função                 | Export do barrel | Observação                               |
| ---------------------- | ---------------- | ---------------------------------------- |
| Inbox / conversas      | `Inbox`          | Destino de entrada e triagem             |
| Kanban / pedidos       | `Kanban`         | Fluxo visual por etapas                  |
| Clientes / CRM         | `UsersThree`     | Grupo de pessoas; não use pessoa isolada |
| Catálogo / produtos    | `Storefront`     | Catálogo comercial                       |
| Relatórios / analytics | `ChartLineUp`    | Tendência e desempenho                   |
| Configurações          | `Gear`           | Ajustes do sistema                       |
| Notificações           | `Bell`           | Badge separado quando houver pendência   |

### Ações

| Função                 | Export do barrel        | Observação                             |
| ---------------------- | ----------------------- | -------------------------------------- |
| Buscar                 | `MagnifyingGlass`       | Normalmente dentro do campo            |
| Adicionar / criar      | `Plus`                  | Pode usar `2px` em 16px                |
| Editar                 | `PencilSimple`          | Edição de conteúdo ou configuração     |
| Apagar                 | `Trash`                 | Cor de erro somente na ação destrutiva |
| Mais opções            | `DotsThree`             | Menu contextual                        |
| Filtrar                | `Funnel`                | Refino de lista ou relatório           |
| Atribuir / responsável | `UserCircle`            | Pessoa responsável                     |
| Fechar / dispensar     | `X`                     | Não confundir com exclusão             |
| Avançar                | `ArrowRight`            | Fluxo ou CTA                           |
| Expandir               | `CaretDown`             | Conteúdo recolhível                    |
| Resolver               | `CheckCircle`           | Com texto ou nome acessível            |
| Reabrir                | `ClockCounterClockwise` | Retorno a um estado anterior           |

### Estado e status

| Função              | Export do barrel | Observação                  |
| ------------------- | ---------------- | --------------------------- |
| Sucesso / concluído | `CheckCircle`    | Token de sucesso            |
| Aviso               | `Warning`        | Token de aviso              |
| Erro / urgente      | `WarningOctagon` | Token de erro               |
| Informação          | `Info`           | Token informativo           |
| Carregando          | `CircleNotch`    | Use `animate-spin`          |
| Placeholder         | sem ícone        | Use o componente `Skeleton` |

### Mensagens

| Função          | Export do barrel | Observação                  |
| --------------- | ---------------- | --------------------------- |
| Anexar arquivo  | `Paperclip`      | Ação no compositor          |
| Imagem          | `ImageIcon`      | Tipo de anexo               |
| Áudio           | `Microphone`     | Gravação ou mídia de voz    |
| Enviar          | `PaperPlaneTilt` | Ação primária do compositor |
| Emoji           | `Smiley`         | Seletor de reação           |
| Enviado         | `Check`          | Estado com rótulo acessível |
| Entregue / lido | `Checks`         | A cor diferencia os estados |

### IA e automação

| Função               | Export do barrel | Observação                  |
| -------------------- | ---------------- | --------------------------- |
| Processamento por IA | `Brain`          | Processamento ou raciocínio |
| Sugestão automática  | `Sparkle`        | Apenas sugestão criativa    |
| Fluxo automatizado   | `GitBranch`      | Ramificação ou regra        |

Não use um ícone de raio para representar IA: o símbolo é ambíguo com atalho e velocidade.

### Plataformas terceiras

Não recrie logotipos de mensageria, rede social, agenda ou provedor com traços Lucide. Represente a
função e deixe a identificação da plataforma para o texto adjacente:

| Contexto              | Ícone genérico  |
| --------------------- | --------------- |
| Canal de mensagens    | `ChatCircle`    |
| Telefonia             | `Phone`         |
| Página ou serviço web | `Globe`         |
| Agenda externa        | `CalendarBlank` |
| Integração / webhook  | `WebhooksLogo`  |

Se um logotipo oficial for indispensável por requisito de co-branding, trate-o como asset de marca,
fora do sistema de ícones e conforme as regras de uso do proprietário.

## Quando não usar ícone

- Em rótulo curto que já explica a ação, como `Salvar`.
- Em badge cuja cor e texto já comunicam o estado.
- Antes de um campo cujo contexto já está explícito, salvo quando o ícone for affordance interativa.
- Como decoração sem função de navegação, ação ou estado.

## Acessibilidade

```tsx
// Ícone como única affordance: o controle recebe nome acessível
<button aria-label="Apagar conversa">
  <Trash size={20} aria-hidden="true" />
</button>

// Ícone decorativo ao lado de texto
<button>
  <Plus size={16} strokeWidth={2} aria-hidden="true" />
  <span>Nova conversa</span>
</button>

// Estado: o texto adjacente comunica o significado
<span role="status">
  <CheckCircle size={16} className="text-success" aria-hidden="true" />
  <span>Resolvido</span>
</span>
```

- Botão somente com ícone precisa de `aria-label`.
- Ícone acompanhado por texto usa `aria-hidden="true"`.
- Estado precisa de texto visível ou equivalente para leitor de tela.
- Cor nunca é o único sinal de significado.

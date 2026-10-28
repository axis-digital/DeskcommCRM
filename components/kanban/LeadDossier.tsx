"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useActiveOrg, usePermission, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import { ConversaEmbutida } from "@/components/inbox/ConversaEmbutida";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types/leads";
import type { Stage } from "@/lib/kanban/types";
import { ContatoDoNegocio } from "./ContatoDoNegocio";
import { AbrirConversaDoLead, temAlvoParaAbrir } from "./AbrirConversaDoLead";
import { ConversaNoDossie } from "./ConversaNoDossie";
import { LeadFieldsForm, type ControleDosCamposDoNegocio } from "./LeadFieldsForm";
import { RevisaoDoDocumento } from "./RevisaoDoDocumento";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { PropostasDoNegocio } from "./PropostasDoNegocio";
import { TarefasDoNegocio } from "./TarefasDoNegocio";
import { ResponsavelDoNegocio } from "./ResponsavelDoNegocio";
import { EtapaNoDossie } from "./EtapaNoDossie";
import { SecaoDoDossie, useSecoesRecolhidas } from "./SecaoDoDossie";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import { formatValorDoNegocio, MOEDA_PADRAO } from "@/lib/money";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  stageName: string;
  ownerNames?: Map<string, string | null>;
  /**
   * As etapas do funil e quem move. Presentes (o quadro passa), o cabeçalho
   * troca o nome da etapa por um seletor — ver `EtapaNoDossie`. Ausentes (o
   * calendário, por enquanto), fica o texto de antes.
   */
  etapas?: Pick<Stage, "id" | "name">[];
  onMudarEtapa?: (stageId: string) => void;
}

/** Tipos de `<input>` em que não se digita texto: Esc ali continua fechando o painel. */
const INPUT_SEM_TEXTO = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"]);

function ehCampoDeTexto(el: Element | null): el is HTMLTextAreaElement | HTMLInputElement {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !INPUT_SEM_TEXTO.has(el.type);
}

function formatValor(cents: number | null, currency: string | null): string {
  // Mesma régua e mesmo locale do card e do total da coluna (`formatValorDoNegocio`).
  if (cents === null) return "—";
  return formatValorDoNegocio(cents, currency ?? MOEDA_PADRAO, { semCentavos: true });
}

/**
 * O dossiê do negócio: cabeçalho vivo → Contato → Dados do negócio → Linha do
 * tempo (issue #3181).
 *
 * ─── A ORDEM, e por que ela inverteu ────────────────────────────────────────
 *
 * A ordem antiga era Contato → Linha do tempo → Dados do negócio, e o argumento
 * dela era bom: quem abre um lead quer primeiro saber O QUE ACONTECEU. O que ela
 * não previu foi o crescimento da linha do tempo. Com uso real, mensagens,
 * mudanças de etapa, automações e follow-ups empurram os CAMPOS DO FUNIL para
 * baixo de uma parede de rolagem — e os campos são justamente o que se preenche
 * durante o atendimento (destino, datas, passageiros, produtos vendidos). A
 * ordem dos campos já segue a lógica do atendimento; com a linha do tempo no
 * meio, essa lógica se perdia e os campos ficavam vazios.
 *
 * A inversão não joga a linha do tempo fora: ela passa a ser a CONSULTA, depois
 * do que se PREENCHE. E as três seções viraram recolhíveis, com o estado
 * lembrado, para quem quiser o contrário de volta.
 *
 * ─── O estado lembrado é POR NAVEGADOR ──────────────────────────────────────
 *
 * A preferência que já existe (`interface_settings`) é da ORGANIZAÇÃO e exige
 * papel de admin para ser escrita — reclinar uma seção mudaria a tela de todo
 * mundo. O pedido foi "por usuário", então o estado vai para o `localStorage`
 * (ver `SecaoDoDossie.tsx`, que declara o custo). Não nasceu schema novo.
 *
 * Fora deste PR: a sugestão 3 do autor (ordem das seções configurável por
 * funil) — ela pede uma preferência por FUNIL, que hoje não existe em lugar
 * nenhum, e não caberia sem inventar schema.
 *
 * ─── A CONVERSA FICA AO LADO, E VEM PRIMEIRO ────────────────────────────────
 *
 * Com conversa (ou com telefone para abrir uma), o painel alarga para duas
 * colunas a partir de `lg` — conversa | negócio — e, abaixo disso, vira a
 * alternância "Conversa | Negócio" no topo, abrindo na conversa. A conversa é a
 * MESMA da Inbox (`ConversaEmbutida`): responder daqui não é uma segunda
 * implementação do composer. Sem contato e sem telefone o dossiê continua
 * estreito, sem painel que prometa conversa que não existe. As seções acima
 * moram na coluna do negócio.
 *
 * SALVAR NÃO FECHA. Quem edita precisa ver a atividade que acabou de gerar
 * entrar na timeline; fechar esconderia o registro justamente de quem o
 * produziu, e a funcionalidade que prova "sua ação fica registrada" provaria
 * isso para todo mundo menos para o autor.
 */

/** Quantas entradas a linha do tempo mostra com a seção recolhida (#3181). */
const ENTRADAS_COM_A_LINHA_RECOLHIDA = 3;

export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  fieldDefs = [],
  stageName,
  ownerNames,
  etapas,
  onMudarEtapa,
}: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const campos = useRef<HTMLDivElement | null>(null);
  const formulario = useRef<ControleDosCamposDoNegocio | null>(null);
  // Conversa escolhida AQUI (aberta pelo botão ou trocada pelo "número fora do
  // ar"); sem escolha vale a do negócio, que acompanha o quadro quando ele
  // atualiza. Não é cópia da prop: copiar congelaria o valor da primeira
  // renderização.
  const [conversaEscolhida, setConversaEscolhida] = useState<string | null>(null);
  const conversaId = conversaEscolhida ?? lead.conversa?.id ?? null;
  const temPainel = Boolean(conversaId) || temAlvoParaAbrir(lead.contact_id, lead.contact_phone);
  const [aba, setAba] = useState<"conversa" | "negocio">("conversa");
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const { fechadas, alternar, abrir } = useSecoesRecolhidas();
  const timelineRecolhida = fechadas.has("linha-do-tempo");
  // As três MAIS RECENTES: a rota devolve `performed_at` decrescente, então o
  // corte é no início da lista, não no fim.
  const itensDaTimeline = timelineRecolhida
    ? timeline.itens.slice(0, ENTRADAS_COM_A_LINHA_RECOLHIDA)
    : timeline.itens;
  const temMaisNaTimeline = timeline.itens.length > ENTRADAS_COM_A_LINHA_RECOLHIDA;
  // O atalho do cabeçalho precisa rolar DEPOIS de a seção estar aberta: rolar
  // num mesmo tique mediria a altura de antes, com os campos ainda escondidos.
  const [pedidoDeRolagem, setPedidoDeRolagem] = useState(0);
  useEffect(() => {
    if (pedidoDeRolagem === 0) return;
    campos.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pedidoDeRolagem]);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;
  // N1 — o atalho "Nova proposta" é manager+ (mesmo gate do envio, mesma
  // régua do BulkActionBar). O dossiê não tinha nenhuma checagem de papel;
  // esta é a primeira, no padrão já estabelecido do kanban.
  const user = useUser();
  const activeOrg = useActiveOrg();
  const podeCriarProposta =
    user.is_platform_admin || (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager) || false;
  // Atribuir o responsável é ≥ manager NA ROTA (a do lote, que o seletor usa);
  // a mesma régua da proposta acima. Sem isto o selo é só leitura.
  const podeAtribuir = podeCriarProposta;
  // A MESMA régua do arrasto e do "Mover para…" do card (`KanbanCardActions`).
  const podeMoverCard = usePermission("pipeline.move_card");
  // Tarefas são `agent`+, a mesma régua da tela de Tarefas e da rota — e o
  // suporte temporário só lê, como lá (`requireSupportWrite`).
  const podeEditarTarefas =
    (user.is_platform_admin && !user.support) ||
    (activeOrg ? ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent : false);
  // Editar nome e e-mail do contato é `agent`+ e respeita o suporte somente-leitura,
  // como a rota (`requireRole("agent")` + `requireSupportWrite`): a mesma régua das tarefas.
  const podeEditarContato = podeEditarTarefas;
  // Confirmar o que o documento disse é EDITAR O CARD: `agent`+, a MESMA régua
  // que a rota de decisão exige (`requireRole("agent")`). Abaixo disso a fila
  // ainda aparece — ler o que a IA leu é informação —, mas sem os botões.
  const podeConfirmarDoDocumento = podeEditarTarefas;

  /**
   * As props da linha do tempo, montadas UMA vez e usadas nos dois estados da
   * seção. Duplicar o bloco seria a maneira mais fácil de os dois divergirem —
   * e o recolhido é justamente o estado menos olhado por quem revisa.
   *
   * São as props, e não o elemento da linha do tempo já montado numa variável
   * lá em cima: `tests/unit/dossie-atalho-conversa` prova que o bloco da
   * conversa aparece ANTES da linha do tempo lendo a posição do primeiro
   * elemento dela no arquivo, e uma variável içada para o topo do componente
   * inverteria essa leitura sem nada ter mudado na tela — o teste passaria a
   * medir a posição de uma variável, e não da seção.
   */
  const propsDaLinhaDoTempo = {
    itens: itensDaTimeline,
    chegouAoVivo: timeline.chegouAoVivo,
    isLoading: timeline.isLoading,
    isError: timeline.isError,
  };

  const painelDaConversa = conversaId ? (
    <ConversaEmbutida conversationId={conversaId} onTrocarConversa={setConversaEscolhida} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">{t("Este negócio ainda não tem conversa.")}</p>
      <AbrirConversaDoLead
        contactId={lead.contact_id}
        phone={lead.contact_phone}
        variante="dossie"
        onAberta={setConversaEscolhida}
      />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
          temPainel && "lg:max-w-[min(72rem,95vw)]",
        )}
        // Esc num campo de texto tira o foco do campo, não fecha o painel: quem
        // digita uma resposta e aperta Esc para fechar um emoji ou uma menção
        // não pode perder o dossiê inteiro. Um segundo Esc, já fora do campo,
        // fecha.
        onEscapeKeyDown={(e) => {
          const alvo = document.activeElement;
          if (ehCampoDeTexto(alvo)) {
            e.preventDefault();
            alvo.blur();
          }
        }}
        // Observável pelo mesmo motivo do board: "a assinatura morreu" e "nada
        // aconteceu" têm a mesma aparência, que é silêncio.
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        // Observável como no board: "a entrega morreu" e "nada aconteceu"
        // têm a mesma aparência, e no dossiê a segunda é ainda mais crível —
        // negócio sem novidade é um estado normal.
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        {temPainel && (
          // `pr-12` deixa o X de fechar (canto do painel) livre das abas.
          <div
            role="tablist"
            aria-label={t("Seções do negócio")}
            className="flex gap-1 border-b border-border p-2 pr-12 lg:hidden"
          >
            {(["conversa", "negocio"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={aba === a}
                onClick={() => setAba(a)}
                className={cn(
                  "min-h-11 flex-1 rounded-md text-sm font-medium",
                  aba === a ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {a === "negocio" ? t("Negócio") : t("Conversa")}
                {a === "conversa" && (lead.conversa?.unread ?? 0) > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                    {lead.conversa?.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* A CONVERSA VEM PRIMEIRO (ordem de leitura, de Tab e visual): é o que se
            faz com o negócio aberto — responder —, e o negócio é o contexto ao
            lado. A coluna larga é a dela. */}
        <div className={cn("min-h-0 flex-1", temPainel && "lg:grid lg:grid-cols-[1fr_minmax(22rem,26rem)]")}>
          {temPainel && (
            <section
              aria-label={t("Conversa")}
              className={cn(
                "h-full min-h-0 flex-col border-border lg:flex lg:border-r",
                aba === "conversa" ? "flex" : "hidden",
              )}
            >
              {painelDaConversa}
            </section>
          )}
          <div
            className={cn(
              "flex h-full flex-col overflow-y-auto p-6",
              temPainel && aba !== "negocio" && "hidden lg:flex",
            )}
          >
            <SheetHeader className={cn("pb-4", temPainel && "lg:pr-8")}>
              <SheetTitle className="text-base leading-6">{lead.title}</SheetTitle>
            </SheetHeader>

            {/* ① cabeçalho vivo */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-4 text-xs">
              <span className="font-medium tabular-nums text-text">
                {formatValor(lead.value_cents, lead.currency)}
              </span>
              {etapas && onMudarEtapa ? (
                <EtapaNoDossie
                  etapaAtual={lead.stage_id}
                  etapas={etapas}
                  podeMover={podeMoverCard}
                  onMudar={onMudarEtapa}
                />
              ) : (
                <span className="text-text-muted">{stageName}</span>
              )}
              <ResponsavelDoNegocio
                leadId={lead.id}
                pipelineId={pipelineId}
                donoUserId={lead.owner_user_id}
                owner={{ kind: owner.kind, name: owner.name, agentVersion: owner.agentVersion }}
                podeAtribuir={podeAtribuir}
              />
              {score && (
                // O MESMO componente do card, não uma cópia do medidor.
                // "Superfície nova herda as decisões da antiga" só vale como
                // mecanismo: herdar por cópia é como as duas listas do evidence —
                // funciona hoje e diverge no mês em que alguém mudar um dos dois.
                // De brinde, o rótulo honesto da âncora ("registro que sustenta",
                // nunca "momento da conversa") vem junto, sem eu reescrever nada.
                <ScoreSlot
                  probability={score.probability}
                  band={score.band}
                  reason={score.reason}
                  factors={score.factors.slice(0, 3)}
                />
              )}

              <button
                type="button"
                onClick={() => {
                  // Se os campos estiverem recolhidos, o clique também os abre:
                  // rolar até um título fechado entregaria um destino vazio.
                  abrir("dados-do-negocio");
                  setPedidoDeRolagem((n) => n + 1);
                }}
                className="ml-auto text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                {t("Editar campos")}
              </button>
            </div>

            {/* O score NÃO aparece na timeline: recálculo é telemetria e não emite
                atividade (silêncio para telemetria, pulso para mudança de estado).
                Sem esta linha, quem visse o número mudando no cabeçalho e nunca na
                timeline concluiria que a timeline está incompleta. */}
            {score?.at && (
              <p className="pt-3 text-[11px] text-text-muted">
                {t("Probabilidade recalculada automaticamente")} ·{" "}
                {new Date(score.at).toLocaleString(tagDoIdioma)}
              </p>
            )}

            {/* O link para a Inbox em tela cheia. O botão de INICIAR conversa mora
                no painel ao lado (sem `contactId`/`phone` aqui, para não haver dois
                botões iguais, um deles mandando para fora do funil). */}
            <ConversaNoDossie conversa={lead.conversa} />

            {/* ① Contato — os dados do CLIENTE: telefone e e-mail numa aba, links
                (Instagram, site, Google Meu Negócio…) na outra. Vêm do contato, não
                do lead. Primeira porque é o contexto de quem está falando. O
                `py-5` é o respiro que o dossiê com a conversa ao lado já tinha. */}
            <SecaoDoDossie
              id="contato"
              titulo={t("Contato")}
              recolhida={fechadas.has("contato")}
              aoAlternar={alternar}
              className="py-5"
            >
              <ContatoDoNegocio
                contactId={lead.contact_id}
                pipelineId={pipelineId}
                leadId={lead.id}
                podeEditar={podeEditarContato}
              />
            </SecaoDoDossie>

            {/* ② Dados do negócio — o que se PREENCHE, agora ANTES da linha do
                tempo (#3181). */}
            <SecaoDoDossie
              id="dados-do-negocio"
              titulo={t("Dados do negócio")}
              recolhida={fechadas.has("dados-do-negocio")}
              aoAlternar={alternar}
              className="py-5"
            >
              <div ref={campos}>
                {/* ⚠️ A REVISÃO FICA AQUI, dentro do card, e é esta linha que o
                    mantenedor cobrou no #3415: a fila existia como API e não tinha
                    consumidor na tela — o mesmo que não existir. Acima do
                    formulário porque é o histórico do que o documento disse, e o
                    formulário é o destino do que for confirmado. */}
                <RevisaoDoDocumento
                  leadId={lead.id}
                  podeDecidir={podeConfirmarDoDocumento}
                  aoDecidir={(confirmado) => formulario.current?.confirmarCampo(confirmado)}
                />
                <LeadFieldsForm lead={lead} pipelineId={pipelineId} fieldDefs={fieldDefs} controle={formulario} />
              </div>
            </SecaoDoDossie>

            {/* As tarefas SEGUEM antes da linha do tempo: a timeline conta o que já
                aconteceu, a tarefa é o que ainda falta fazer — e quem abre o card
                para agir procura o próximo passo primeiro. Não entram no
                recolhimento: tarefa é trabalho em curso, não consulta. */}
            <TarefasDoNegocio
              leadId={lead.id}
              contactId={lead.contact_id}
              podeEditar={podeEditarTarefas}
              aberto={open}
            />

            {/* ③ Linha do tempo — a CONSULTA, por último. Recolhida, mostra as três
                entradas mais recentes e o "ver tudo": a seção fecha sem deixar a
                pergunta "e o que aconteceu por último?" sem resposta. */}
            <SecaoDoDossie
              id="linha-do-tempo"
              titulo={t("Linha do tempo")}
              recolhida={timelineRecolhida}
              aoAlternar={alternar}
              className="flex-1 py-5"
              conteudoRecolhido={
                <>
                  <LeadTimeline {...propsDaLinhaDoTempo} />
                  {/* Só quando há o que ver: "ver tudo" numa lista de três seria um
                      botão que não leva a lugar nenhum. */}
                  {temMaisNaTimeline && (
                    <button
                      type="button"
                      onClick={() => alternar("linha-do-tempo")}
                      className="mt-2 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      {t("Ver tudo")}
                    </button>
                  )}
                </>
              }
            >
              <LeadTimeline {...propsDaLinhaDoTempo} />
            </SecaoDoDossie>

            {/* N1 — seção "Propostas", depois da linha do tempo. Some sozinha
                (null) quando a capacidade está desligada — ver PropostasDoNegocio. */}
            <PropostasDoNegocio
              leadId={lead.id}
              pipelineId={pipelineId}
              podeCriar={podeCriarProposta}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Lead } from "@/lib/types/leads";
import type * as AbrirConversa from "./AbrirConversaDoLead";

vi.mock("@/components/inbox/ConversaEmbutida", () => ({
  ConversaEmbutida: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="conversa-embutida">{conversationId}</div>
  ),
}));
// O botão de abrir é o real só no que importa aqui: entrega o id novo a `onAberta`.
vi.mock("./AbrirConversaDoLead", async (original) => ({
  ...(await original<typeof AbrirConversa>()),
  AbrirConversaDoLead: ({ onAberta }: { onAberta?: (id: string) => void }) => (
    <button type="button" onClick={() => onAberta?.("conv-nova")}>
      abrir-aqui
    </button>
  ),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
const papel = vi.hoisted(() => ({ atual: "agent" as "agent" | "manager" }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u-1", is_platform_admin: false, support: null }),
  useActiveOrg: () => ({ orgId: "org-1", role: papel.atual }),
  usePermission: () => true,
}));
vi.mock("@/hooks/leads/useLeadTimeline", () => ({
  useLeadTimeline: () => ({
    itens: [],
    chegouAoVivo: new Set(),
    isLoading: false,
    isError: false,
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
// O que não é assunto deste teste (cada um tem o seu) sai do caminho.
vi.mock("./ContatoDoNegocio", () => ({
  ContatoDoNegocio: ({ podeEditar }: { podeEditar?: boolean }) => (
    <div data-testid="contato" data-pode-editar={String(Boolean(podeEditar))} />
  ),
}));
vi.mock("./ResponsavelDoNegocio", () => ({
  ResponsavelDoNegocio: ({ podeAtribuir, leadId }: { podeAtribuir: boolean; leadId: string }) => (
    <div data-testid="responsavel" data-pode-atribuir={String(podeAtribuir)} data-lead={leadId} />
  ),
}));
vi.mock("./LeadFieldsForm", () => ({ LeadFieldsForm: () => null }));
vi.mock("./LeadTimeline", () => ({ LeadTimeline: () => null }));
vi.mock("./PropostasDoNegocio", () => ({ PropostasDoNegocio: () => null }));
vi.mock("./TarefasDoNegocio", () => ({ TarefasDoNegocio: () => null }));
vi.mock("./ScoreSlot", () => ({ ScoreSlot: () => null }));

import { LeadDossier } from "./LeadDossier";

const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    id: "l-1",
    organization_id: "org-1",
    pipeline_id: "p-1",
    stage_id: "s-1",
    contact_id: "k-1",
    title: "Negócio de teste",
    description: null,
    status: "open",
    lost_reason: null,
    position_in_stage: 1000,
    value_cents: null,
    currency: null,
    owner_user_id: null,
    owner_kind: "none",
    owner_agent_id: null,
    contact_phone: "5585999999999",
    conversa: { id: "c1", preview: "oi", last_message_at: null, unread: 0 },
    ...over,
  }) as unknown as Lead;

const montar = (l: Lead, onOpenChange = vi.fn()) =>
  render(<LeadDossier open onOpenChange={onOpenChange} lead={l} pipelineId="p-1" stageName="Novo" />);

describe("LeadDossier com a conversa ao lado", () => {
  it("negócio com conversa: monta a conversa embutida, numa região nomeada", () => {
    montar(lead());
    expect(screen.getByTestId("conversa-embutida")).toHaveTextContent("c1");
    expect(screen.getByRole("region", { name: "Conversa" })).toBeInTheDocument();
  });

  it("negócio sem contato e sem telefone: sem painel de conversa (o dossiê não alarga)", () => {
    montar(lead({ conversa: null, contact_id: null, contact_phone: undefined }));
    expect(screen.queryByTestId("conversa-embutida")).toBeNull();
    expect(screen.queryByRole("region", { name: "Conversa" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("negócio com telefone e sem conversa: oferece iniciar ali, e a conversa nova aparece no painel", () => {
    montar(lead({ conversa: null }));
    expect(screen.getByText("Este negócio ainda não tem conversa.")).toBeVisible();
    expect(screen.queryByTestId("conversa-embutida")).toBeNull();

    fireEvent.click(screen.getByText("abrir-aqui"));

    expect(screen.getByTestId("conversa-embutida")).toHaveTextContent("conv-nova");
  });

  it("a conversa vem ANTES do negócio: primeiro no documento (ordem de leitura e de Tab) e na primeira coluna", () => {
    montar(lead());
    const conversa = screen.getByRole("region", { name: "Conversa" });
    const titulo = screen.getByText("Negócio de teste");
    // Ordem de leitura = ordem visual: a conversa precede o título do negócio.
    expect(conversa.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // E o grid dá a coluna larga à conversa, a estreita ao negócio.
    expect(conversa.parentElement?.className).toContain("lg:grid-cols-[1fr_minmax(22rem,26rem)]");
  });

  it("no celular a alternância Conversa | Negócio começa na conversa e troca o que aparece", () => {
    montar(lead());
    const abas = screen.getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Conversa", "Negócio"]);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Conversa" }).className).toMatch(/\bflex\b/);

    fireEvent.click(abas[1]!);

    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Conversa" }).className).toMatch(/\bhidden\b/);
  });

  it("a aba Conversa mostra o número de não lidas, e só quando há", () => {
    const { unmount } = montar(lead({ conversa: { id: "c1", preview: null, last_message_at: null, unread: 4 } }));
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("4");
    unmount();
    montar(lead());
    expect(screen.getAllByRole("tab")[0]!.textContent).toBe("Conversa");
  });
});

describe("LeadDossier: responsável e contato editáveis conforme o papel", () => {
  it("agente edita o contato, mas não atribui responsável (atribuir é de gerente, como no lote)", () => {
    papel.atual = "agent";
    montar(lead());
    expect(screen.getByTestId("contato")).toHaveAttribute("data-pode-editar", "true");
    expect(screen.getByTestId("responsavel")).toHaveAttribute("data-pode-atribuir", "false");
    expect(screen.getByTestId("responsavel")).toHaveAttribute("data-lead", "l-1");
  });

  it("gerente atribui o responsável", () => {
    papel.atual = "manager";
    montar(lead());
    expect(screen.getByTestId("responsavel")).toHaveAttribute("data-pode-atribuir", "true");
    papel.atual = "agent";
  });
});

describe("LeadDossier: Esc seguro", () => {
  it("Esc dentro de um campo de texto tira o foco do campo e NÃO fecha o dossiê", () => {
    const onOpenChange = vi.fn();
    montar(lead(), onOpenChange);
    const campo = document.createElement("textarea");
    screen.getByRole("dialog").appendChild(campo);
    campo.focus();

    fireEvent.keyDown(campo, { key: "Escape" });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(document.activeElement).not.toBe(campo);
  });

  it("Esc num checkbox NÃO é 'sair do campo de texto': fecha o dossiê, como sempre", () => {
    const onOpenChange = vi.fn();
    montar(lead(), onOpenChange);
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    screen.getByRole("dialog").appendChild(caixa);
    caixa.focus();

    fireEvent.keyDown(caixa, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc fora de qualquer campo fecha o dossiê", () => {
    const onOpenChange = vi.fn();
    montar(lead(), onOpenChange);
    (document.activeElement as HTMLElement | null)?.blur();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

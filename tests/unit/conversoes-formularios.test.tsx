import { ScriptDoSite } from "@/app/app/settings/conversoes/_scriptDoSite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormularioDeCapturaDeUtm } from "@/app/app/settings/conversoes/_formCapturaDeUtm";
import { FormularioDeConversoesGoogle } from "@/app/app/settings/conversoes/_formGoogle";
import { RegrasDeConversaoGoogle } from "@/app/app/settings/conversoes/_regrasGoogle";
import { FormularioDoGa4 } from "@/app/app/settings/conversoes/_formGa4";
const mock = vi.hoisted(() => ({
  salvarCaptura: vi.fn(),
  salvarGoogle: vi.fn(),
  salvarRegras: vi.fn(),
  criarAcao: vi.fn(),
  salvarGa4: vi.fn(),
  testarGa4: vi.fn(),
}));
vi.mock("@/app/actions/settings/updateGa4Connection", () => ({
  updateGa4Connection: mock.salvarGa4,
  testarConexaoGa4: mock.testarGa4,
}));
vi.mock("@/app/actions/settings/salvarRegrasDeConversaoGoogle", () => ({
  salvarRegrasDeConversaoGoogle: mock.salvarRegras,
}));
vi.mock("@/app/actions/settings/acoesDeConversaoGoogle", () => ({
  criarAcaoDeConversaoGoogle: mock.criarAcao,
}));
vi.mock("@/app/actions/settings/updateCapturaDeUtm", () => ({
  updateCapturaDeUtm: mock.salvarCaptura,
}));
vi.mock("@/app/actions/settings/updateGoogleAdsConnection", () => ({
  updateGoogleAdsConnection: mock.salvarGoogle,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mock.salvarCaptura.mockResolvedValue({ ok: true });
  mock.salvarGoogle.mockResolvedValue({ ok: true });
  mock.salvarRegras.mockResolvedValue({ ok: true });
  mock.criarAcao.mockResolvedValue({ ok: true, dados: { id: "555", nome: "Novo lead #abcde" } });
  mock.salvarGa4.mockResolvedValue({ ok: true });
  mock.testarGa4.mockResolvedValue({ ok: true });
});

describe("FormularioDoGa4", () => {
  it("não mostra o secret gravado e indica que existe", () => {
    render(
      <FormularioDoGa4
        estado={{
          configurada: true,
          enabled: true,
          measurementId: "G-ABC123",
          wonEvent: "purchase",
          temSegredo: true,
        }}
        idioma="pt-BR"
      />,
    );
    expect(screen.getByLabelText("Measurement ID")).toHaveValue("G-ABC123");
    expect(screen.getByLabelText("API secret")).toHaveValue("");
    expect(screen.getByText("Secret gravado. Deixe em branco para manter.")).toBeInTheDocument();
  });

  it("salvar chama a ação com o que foi digitado", async () => {
    render(
      <FormularioDoGa4
        estado={{
          configurada: false,
          enabled: false,
          measurementId: null,
          wonEvent: "close_convert_lead",
          temSegredo: false,
        }}
        idioma="pt-BR"
      />,
    );
    fireEvent.change(screen.getByLabelText("Measurement ID"), {
      target: { value: "G-XYZ987" },
    });
    fireEvent.change(screen.getByLabelText("API secret"), {
      target: { value: "segredo-123456" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Enviar ao GA4" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(mock.salvarGa4).toHaveBeenCalledWith({
        measurement_id: "G-XYZ987",
        api_secret: "segredo-123456",
        won_event: "close_convert_lead",
        enabled: true,
      }),
    );
  });
});
describe("FormularioDoGa4 — evento enviado no ganho", () => {
  const base = {
    configurada: true,
    enabled: true,
    measurementId: "G-ABC123",
    temSegredo: true,
  } as const;

  it("oferece os dois eventos e carrega o valor gravado", () => {
    render(<FormularioDoGa4 estado={{ ...base, wonEvent: "purchase" }} idioma="pt-BR" />);
    const select = screen.getByLabelText("Evento enviado na venda");
    expect(select).toHaveValue("purchase");
    const opcoes = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(opcoes).toEqual(["close_convert_lead", "purchase"]);
  });

  it("padrão close_convert_lead sugere purchase para loja ou funil de pedidos", () => {
    render(<FormularioDoGa4 estado={{ ...base, wonEvent: "close_convert_lead" }} idioma="pt-BR" />);
    expect(screen.getByLabelText("Evento enviado na venda")).toHaveValue("close_convert_lead");
    expect(screen.getByLabelText("Evento enviado na venda")).toHaveAccessibleDescription(
      "Loja ou funil de pedidos? Escolha Compra (purchase): a venda entra nos relatórios de e-commerce do GA4.",
    );
  });

  it("trocar para purchase salva o evento escolhido e explica o transaction_id", async () => {
    render(<FormularioDoGa4 estado={{ ...base, wonEvent: "close_convert_lead" }} idioma="pt-BR" />);
    fireEvent.change(screen.getByLabelText("Evento enviado na venda"), {
      target: { value: "purchase" },
    });
    expect(screen.getByLabelText("Evento enviado na venda")).toHaveAccessibleDescription(
      "O id do negócio vai como transaction_id, e o GA4 não conta a mesma venda duas vezes.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(mock.salvarGa4).toHaveBeenCalledWith({
        measurement_id: "G-ABC123",
        won_event: "purchase",
        enabled: true,
      }),
    );
  });

  it("em espanhol, rótulo, opções e ajuda vêm traduzidos", () => {
    render(<FormularioDoGa4 estado={{ ...base, wonEvent: "purchase" }} idioma="es" />);
    const select = screen.getByLabelText("Evento enviado en la venta") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Lead convertido (embudo de leads) (close_convert_lead)",
      "Compra (e-commerce) (purchase)",
    ]);
    expect(select).toHaveAccessibleDescription(
      "El id del negocio va como transaction_id, y GA4 no cuenta la misma venta dos veces.",
    );
  });
});

describe("formulários de conversão", () => {
  it("a captura Google salva destino e referência na plataforma certa", async () => {
    render(
      <FormularioDeCapturaDeUtm
        plataforma="google"
        estado={null}
        idioma="pt-BR"
        slug="loja"
        numerosConectados={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Para qual WhatsApp mandar"), {
      target: { value: "+5511999999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar endereço de captura" }));
    await waitFor(() =>
      expect(mock.salvarCaptura).toHaveBeenCalledWith(
        expect.objectContaining({
          plataforma: "google_ads",
          whatsapp_e164: "+5511999999999",
          message_template: expect.stringContaining("[ref:{token}]"),
        }),
      ),
    );
    expect(screen.getByText(/O botão do site precisa repassar/)).toBeTruthy();
  });
  it("a conexão salva venda sem valor, categoria e telefone criptografado", async () => {
    render(
      <FormularioDeConversoesGoogle
        estado={{
          temRefreshToken: true,
          habilitada: true,
          customerId: "1234567890",
          loginCustomerId: null,
          conversionActionId: "11",
          modoDeValorDaVenda: "obrigatorio",
          categoriaDaVenda: "PURCHASE",
          enviarTelefone: false,
        }}
        idioma="pt-BR"
        configurado
        falta={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Valor do negócio"), {
      target: { value: "quando_houver" },
    });
    fireEvent.click(screen.getByLabelText("Enviar o telefone do contato criptografado"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(mock.salvarGoogle).toHaveBeenCalledWith(
        expect.objectContaining({
          conversion_action_id: "11",
          purchase_value_mode: "quando_houver",
          purchase_category: "PURCHASE",
          send_hashed_phone: true,
        }),
      ),
    );
    // Sem developer token, "Criar no Google" aparece mas desligado — o ID segue colável.
    expect(
      (screen.getByRole("button", { name: "Criar no Google" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("as regras por etapa ligam o recomendado, criam a ação no Google e salvam a lista inteira", async () => {
    render(
      <RegrasDeConversaoGoogle
        etapas={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            nome: "Novo",
            funil: "Vendas",
            primeira: true,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            nome: "Qualificado",
            funil: "Vendas",
            primeira: false,
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            nome: "Negociação",
            funil: "Vendas",
            primeira: false,
          },
        ]}
        regras={[]}
        idioma="pt-BR"
        podeCriarAcao
      />,
    );
    expect(screen.getByTestId("etapas-enviando").textContent).toContain("0 de 3");
    fireEvent.click(screen.getByRole("button", { name: "Usar o recomendado" }));
    expect(screen.getByTestId("etapas-enviando").textContent).toContain("2 de 3");
    const criar = screen.getAllByRole("button", { name: "Criar no Google" });
    fireEvent.click(criar[0]!);
    await waitFor(() =>
      expect(mock.criarAcao).toHaveBeenCalledWith({
        nome: "Novo lead",
        categoria: "CONTACT",
        incluir_em_conversoes: true,
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Ação de conversão (ID)", {
        selector: "#acao-22222222-2222-4222-8222-222222222222",
      }),
      {
        target: { value: "42" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar regras" }));
    await waitFor(() => expect(mock.salvarRegras).toHaveBeenCalledOnce());
    const enviadas = mock.salvarRegras.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(enviadas).toHaveLength(3);
    expect(enviadas[0]).toMatchObject({
      enabled: true,
      google_action_id: "555",
      category: "CONTACT",
    });
    expect(enviadas[1]).toMatchObject({
      enabled: true,
      google_action_id: "42",
      category: "QUALIFIED_LEAD",
      label: "Lead qualificado",
    });
    expect(enviadas[2]).toMatchObject({ enabled: false });
  });
});

it("só gera o script com captura ativa salva, sem credenciais", () => {
  const { rerender } = render(
    <ScriptDoSite slug="loja" google={null} meta={null} ga4MeasurementId={null} idioma="pt-BR" />,
  );
  expect(screen.queryByRole("button", { name: "Copiar script do site" })).toBeNull();
  rerender(
    <ScriptDoSite
      slug="loja"
      google={{
        whatsappE164: "+5511999999999",
        messageTemplate: "Olá [ref:{token}]",
        habilitada: true,
      }}
      meta={null}
      ga4MeasurementId={null}
      idioma="pt-BR"
    />,
  );
  const code = screen.getByTestId("script-do-site").querySelector("code")!.textContent!;
  expect(code).toContain(window.location.origin + "/rastreio/v1.js");
  expect(code).toContain('data-google-whatsapp="5511999999999"');
  expect(code).not.toContain("data-meta-whatsapp");
  expect(screen.getByRole("button", { name: "Copiar script do site" })).toBeTruthy();
});

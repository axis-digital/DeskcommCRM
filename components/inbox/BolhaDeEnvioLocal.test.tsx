import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { novoEnvio } from "@/lib/messaging/media/envio-otimista";

import { BolhaDeEnvioLocal } from "./BolhaDeEnvioLocal";

const base = (tipo = "image/jpeg", previa: string | null = "blob:x") =>
  novoEnvio({
    id: "k-1",
    conversationId: "conv-1",
    arquivo: new File([new Uint8Array([1, 2, 3])], tipo === "image/jpeg" ? "foto.jpg" : "proposta.pdf", { type: tipo }),
    legenda: "segue a proposta",
    previa,
    agora: "",
  });

describe("BolhaDeEnvioLocal", () => {
  it("enviando: mostra a prévia do próprio arquivo, a legenda e o estado — sem botões", () => {
    render(<BolhaDeEnvioLocal envio={base()} onTentarDeNovo={vi.fn()} onDescartar={vi.fn()} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:x");
    expect(screen.getByText("segue a proposta")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Enviando…");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("documento: nome e tamanho no lugar da prévia", () => {
    render(<BolhaDeEnvioLocal envio={base("application/pdf", null)} onTentarDeNovo={vi.fn()} onDescartar={vi.fn()} />);
    expect(screen.getByText("proposta.pdf")).toBeInTheDocument();
  });

  it("falhou: diz o motivo e oferece tentar de novo e descartar", () => {
    const tentar = vi.fn();
    const descartar = vi.fn();
    render(
      <BolhaDeEnvioLocal
        envio={{ ...base(), fase: "falhou", erro: "Arquivo acima de 50MB." }}
        onTentarDeNovo={tentar}
        onDescartar={descartar}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Não enviada");
    expect(screen.getByText("Arquivo acima de 50MB.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(tentar).toHaveBeenCalledOnce();
    expect(descartar).toHaveBeenCalledOnce();
  });
});

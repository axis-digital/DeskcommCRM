/**
 * Os grupos do perfil do negócio (boas-vindas + Configurações): acessíveis
 * (fieldset/legend, checkbox com rótulo), enviáveis por `FormData.getAll` e
 * guardando a ORDEM em que a pessoa marcou — o 1º objetivo é o do funil padrão.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CamposDoPerfil, type ValorDoPerfil } from "@/components/perfil-de-negocio/CamposDoPerfil";

function Harness({ inicial }: { inicial: ValorDoPerfil }) {
  const [valor, setValor] = useState(inicial);
  return (
    <form data-testid="form">
      <CamposDoPerfil valor={valor} onChange={setValor} />
    </form>
  );
}

function enviado(): { canais: string[]; objetivos: string[] } {
  const fd = new FormData(screen.getByTestId("form") as HTMLFormElement);
  return { canais: fd.getAll("canais").map(String), objetivos: fd.getAll("objetivos").map(String) };
}

describe("CamposDoPerfil", () => {
  it("expõe os dois grupos com legenda e checkbox rotulado", () => {
    render(<Harness inicial={{ canais: [], objetivos: [] }} />);

    const canais = screen.getByRole("group", { name: "Por onde vocês vendem?" });
    const objetivos = screen.getByRole("group", {
      name: "O que vocês querem que a conversa vire?",
    });
    expect(within(canais).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(objetivos).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(objetivos).getByRole("checkbox", { name: "Vender produtos" })).not.toBeChecked();
  });

  it("marca na ordem do clique e envia por FormData", () => {
    render(<Harness inicial={{ canais: [], objetivos: [] }} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Agendar horários" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vender produtos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "WhatsApp" }));

    expect(enviado()).toEqual({ canais: ["whatsapp"], objetivos: ["agendar", "vender_produto"] });
  });

  it("pré-preenche e desmarca", () => {
    render(
      <Harness inicial={{ canais: ["instagram"], objetivos: ["captar_lead", "vender_servico"] }} />,
    );

    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Captar contatos interessados" }));

    expect(enviado()).toEqual({ canais: ["instagram"], objetivos: ["vender_servico"] });
  });
});

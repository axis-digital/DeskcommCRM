import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeletorDeFunil } from "./SeletorDeFunil";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const funis = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `Funil ${i}`, is_default: i === 0 }));

describe("SeletorDeFunil", () => {
  it("com um funil só, mostra o título puro e nenhum controle", () => {
    render(<SeletorDeFunil funis={funis(1)} atualId="f0" nomeAtual="Funil 0" />);
    expect(screen.getByRole("heading", { level: 1, name: "Funil 0" })).toBeVisible();
    expect(screen.queryByTestId("trocar-funil")).toBeNull();
  });

  it("até 4 funis, mostra pílulas-link com o atual marcado", () => {
    render(<SeletorDeFunil funis={funis(3)} atualId="f1" nomeAtual="Funil 1" />);
    const nav = screen.getByTestId("trocar-funil");
    expect(nav.tagName).toBe("NAV");
    const atual = screen.getByTestId("trocar-funil-opcao-f1");
    expect(atual).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("trocar-funil-opcao-f2")).toHaveAttribute("href", "/app/pipelines/f2");
    // o h1 continua existindo para leitor de tela
    expect(screen.getByRole("heading", { level: 1, name: "Funil 1" })).toBeInTheDocument();
  });

  it("acima de 4 funis, volta ao Select (não estoura a linha)", () => {
    render(<SeletorDeFunil funis={funis(5)} atualId="f0" nomeAtual="Funil 0" />);
    expect(screen.getByTestId("trocar-funil")).toHaveAttribute("role", "combobox");
  });
});

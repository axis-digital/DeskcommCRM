import { describe, expect, it } from "vitest";
import { enviarSemOrigemLigado, hashNormalizado } from "@/lib/conversoes/enviar-sem-origem";

describe("fallback offline", () => {
  it("é desligado quando a chave não existe", () => {
    expect(enviarSemOrigemLigado({})).toBe(false);
    expect(enviarSemOrigemLigado(null)).toBe(false);
    expect(enviarSemOrigemLigado({ conversions: { enviar_sem_origem: "true" } })).toBe(false);
  });

  it("liga só com true booleano", () => {
    expect(enviarSemOrigemLigado({ conversions: { enviar_sem_origem: true } })).toBe(true);
  });

  it("o hash normaliza antes de gerar o SHA-256", () => {
    expect(hashNormalizado("  Maria@Exemplo.com ")).toBe(hashNormalizado("maria@exemplo.com"));
  });

  it("gera SHA-256 hexadecimal do valor normalizado", () => {
    expect(hashNormalizado("A")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashNormalizado("A")).toBe(hashNormalizado("a"));
  });
});

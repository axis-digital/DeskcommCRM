import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MagnifyingGlass } from "@/lib/ui/icons";

describe("lib/ui/icons", () => {
  it("expõe um catálogo curado de ícones", async () => {
    const mod = await import("@/lib/ui/icons");
    const keys = Object.keys(mod).filter((k) => k !== "default");
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it("renderiza Lucide outline com o traço Axis padrão", () => {
    const markup = renderToStaticMarkup(createElement(MagnifyingGlass, { "aria-hidden": true }));

    expect(markup).toContain("lucide-search");
    expect(markup).toContain('stroke-width="1.75"');
    expect(markup).not.toContain('fill="currentColor"');
  });

  it.each([
    ["thin", "1.75"],
    ["regular", "1.75"],
    ["duotone", "1.75"],
    ["bold", "2"],
    ["fill", "2"],
  ] as const)("traduz weight=%s sem abandonar o estilo outline", (weight, strokeWidth) => {
    const markup = renderToStaticMarkup(
      createElement(MagnifyingGlass, { weight, "aria-hidden": true }),
    );

    expect(markup).toContain(`stroke-width="${strokeWidth}"`);
    expect(markup).not.toContain('fill="currentColor"');
  });

  it("limita strokeWidth explícito ao intervalo Axis", () => {
    const fino = renderToStaticMarkup(
      createElement(MagnifyingGlass, { strokeWidth: 1, "aria-hidden": true }),
    );
    const grosso = renderToStaticMarkup(
      createElement(MagnifyingGlass, { strokeWidth: 4, "aria-hidden": true }),
    );

    expect(fino).toContain('stroke-width="1.75"');
    expect(grosso).toContain('stroke-width="2"');
  });
});

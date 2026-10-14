/**
 * `res.json()` sem rede de segurança: uma resposta que não é JSON (proxy que
 * cortou, middleware que estourou, corpo vazio) fazia o `SyntaxError` do parse
 * escapar cru do `mutationFn` — não é `instanceof ApiError`, então
 * `ApiErrorToast` cai no fallback genérico ("Erro inesperado. Tente
 * novamente.") sem código, sem requestId, sem nada que aponte a causa real.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/types";
import { useUploadMedia } from "./useUploadMedia";

function montar() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUploadMedia(), { wrapper });
}

describe("useUploadMedia", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolve com os dados quando a API devolve JSON válido", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { storage_path: "a/b/c", media_mime: "image/png", media_size_bytes: 1, kind: "image" } }),
    }) as unknown as typeof fetch;

    const { result } = montar();
    result.current.mutate({ conversationId: "conv-1", file: new Blob(["x"]), filename: "a.png" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.storage_path).toBe("a/b/c");
  });

  it("resposta não-OK sem corpo JSON (proxy/edge cortou) lança ApiError com o status real, não SyntaxError cru", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    }) as unknown as typeof fetch;

    const { result } = montar();
    result.current.mutate({ conversationId: "conv-1", file: new Blob(["x"]), filename: "a.png" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(502);
  });

  it("200 com corpo vazio (sem `data`) também lança ApiError, nunca deixa o parse estourar cru", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    }) as unknown as typeof fetch;

    const { result } = montar();
    result.current.mutate({ conversationId: "conv-1", file: new Blob(["x"]), filename: "a.png" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});

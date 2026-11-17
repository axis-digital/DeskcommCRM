import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

// O `proxy.ts` bufferiza o corpo antes do handler e, no padrão do Next, corta em
// 10MB. Mídia de até MAX_MEDIA_BYTES (+1MiB de margem do multipart, ver
// `/conversations/[id]/media`) precisa caber inteira, ou o handler recebe um
// multipart truncado e responde 422 "Campo 'file' obrigatório".
describe("next.config: teto do corpo no proxy", () => {
  it("proxyClientMaxBodySize cobre o maior upload de mídia aceito", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBeGreaterThanOrEqual(
      MAX_MEDIA_BYTES + 1_048_576,
    );
  });
});

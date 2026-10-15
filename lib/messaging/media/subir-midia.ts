import { ApiError, type ApiErrorBody } from "@/lib/api/types";

export interface UploadedMedia {
  storage_path: string;
  media_mime: string;
  media_size_bytes: number;
  kind: "image" | "video" | "audio" | "document";
}

/**
 * Onde o arquivo VAI SUBIR — e é aqui que o caminho se decide, não no render.
 *
 * `mensagem` (padrão) é a rota de sempre: bucket `whatsapp-media`, o arquivo
 * vira mensagem e vai para o cliente. `nota` é a rota nova
 * `/notes/media`, bucket `internal-media` — o arquivo vira anexo de nota
 * interna e NUNCA sai do nosso Storage. A bifurcação é uma escolha do caller
 * (o composer, que sabe em que modo está) porque é a única decisão que não dá
 * para derivar do arquivo: o mesmo PDF pode ser os dois.
 */
export type DestinoDoUpload = "mensagem" | "nota";

export interface ArgsDoUpload {
  conversationId: string;
  file: File | Blob;
  filename?: string;
  destino?: DestinoDoUpload;
}

/**
 * O upload em si, fora de qualquer `useMutation`.
 *
 * Mora aqui, e não dentro do hook, porque são dois chamadores: o
 * `useUploadMedia` (nota interna e áudio, que esperam o upload com a tela
 * presa) e a fila da bolha otimista (`envio-otimista.ts`), que sobe em segundo
 * plano. Se a fila usasse o hook, o `isPending` dele travaria o Composer — que
 * é exatamente o que a bolha otimista existe para não fazer.
 */
export async function subirMidia(args: ArgsDoUpload): Promise<UploadedMedia> {
  const form = new FormData();
  form.append(
    "file",
    args.file,
    args.filename ?? (args.file instanceof File ? args.file.name : "audio"),
  );
  const rota = args.destino === "nota" ? "notes/media" : "media";
  const res = await fetch(`/api/v1/conversations/${args.conversationId}/${rota}`, {
    method: "POST",
    body: form,
  });
  // `res.json()` pode estourar em corpo que não é JSON — proxy que cortou
  // a resposta, middleware que quebrou antes do handler, corpo vazio. Sem
  // o `.catch`, esse `SyntaxError` escapava cru do `mutationFn`: não é
  // `ApiError`, então `ApiErrorToast` caía no fallback genérico sem
  // código, sem requestId e sem o status real que a resposta HTTP já tinha.
  const json = (await res.json().catch(() => null)) as
    (Partial<ApiErrorBody> & { data?: UploadedMedia }) | null;
  if (!res.ok || !json?.data) {
    const e = json?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "upload_failed",
      e?.details,
      e?.request_id ?? "",
      e?.message ?? res.statusText ?? undefined,
    );
  }
  return json.data;
}

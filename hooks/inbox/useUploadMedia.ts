"use client";
import { useMutation } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { subirMidia, type ArgsDoUpload } from "@/lib/messaging/media/subir-midia";

// O tipo e o destino moram com a função de upload; reexportados aqui porque
// é daqui que o Composer e o gravador de áudio sempre importaram.
export type { DestinoDoUpload, UploadedMedia } from "@/lib/messaging/media/subir-midia";

export function useUploadMedia() {
  return useMutation({
    mutationFn: (args: ArgsDoUpload) => subirMidia(args),
    onError: (err) => showApiError(err),
  });
}

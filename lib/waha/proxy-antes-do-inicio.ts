/** Contrato interno proposto. Não aciona nenhum provisionador por si só. */
export type ProvisionarProxy = (nome: string) => Promise<{ sessao: string; server: string; confirmado: boolean }>;

type LeitorDaSessao = {
  getVerifiedSession(nome: string): Promise<{ name: string; status: string; config?: Record<string, unknown> | null } | null>;
};

/**
 * Só confirma a barreira com recibo para a identidade exata e GET posterior da
 * mesma sessão, ainda parada. A confirmação não prova o IP efetivo de saída.
 * Qualquer resultado ambíguo é uma falha; segredos não entram na exceção.
 */
export async function confirmarProxyAntesDoInicio(
  nome: string,
  provisionar: ProvisionarProxy,
  transporte: LeitorDaSessao,
): Promise<void> {
  try {
    const recibo = await provisionar(nome);
    if (recibo.confirmado !== true || recibo.sessao !== nome || typeof recibo.server !== "string" || !recibo.server.trim()) {
      throw new Error("recibo inválido");
    }
    const sessao = await transporte.getVerifiedSession(nome);
    const proxy = sessao?.config?.proxy;
    if (sessao?.name !== nome || sessao.status !== "STOPPED" || !proxy || typeof proxy !== "object" || Array.isArray(proxy) ||
      (proxy as Record<string, unknown>).server !== recibo.server) {
      throw new Error("pós-condição inválida");
    }
  } catch {
    throw new Error("proxy_nao_confirmado");
  }
}

/** Códigos seguros que o CRM pode mostrar ao operador; nunca carregam endereço nem credencial. */
export const CODIGOS_DE_PROXY = ["pool_esgotado", "conflito", "incerto", "indisponivel"] as const;
export type CodigoDeProxy = (typeof CODIGOS_DE_PROXY)[number];

export class ErroDeProxy extends Error {
  readonly codigo: CodigoDeProxy;
  constructor(mensagem: string, codigo: CodigoDeProxy) {
    super(mensagem);
    this.name = "ErroDeProxy";
    this.codigo = codigo;
  }
}

function codigoSeguro(erro: unknown): CodigoDeProxy {
  const codigo = (erro as { codigo?: unknown } | null)?.codigo;
  return CODIGOS_DE_PROXY.find((c) => c === codigo) ?? "incerto";
}

/** Contrato interno (v1). O segundo argumento identifica a tentativa de conexão. */
export type ProvisionarProxy = (
  nome: string,
  operacao?: string,
) => Promise<{ sessao: string; server: string; confirmado: boolean }>;

type LeitorDaSessao = {
  getVerifiedSession(
    nome: string,
  ): Promise<{ name: string; status: string; config?: Record<string, unknown> | null } | null>;
};

/**
 * Só confirma a barreira com recibo para a identidade exata e GET posterior da
 * mesma sessão, ainda parada. A confirmação não prova o IP efetivo de saída.
 * Qualquer resultado ambíguo é uma falha com código seguro; segredos não entram
 * na exceção. Falha sem código conhecido vira `incerto`: o chamador repete a
 * mesma identidade e nunca inicia a sessão.
 */
export async function confirmarProxyAntesDoInicio(
  nome: string,
  provisionar: ProvisionarProxy,
  transporte: LeitorDaSessao,
): Promise<void> {
  try {
    const recibo = await provisionar(nome);
    if (
      recibo.confirmado !== true ||
      recibo.sessao !== nome ||
      typeof recibo.server !== "string" ||
      !recibo.server.trim()
    ) {
      throw new Error("recibo inválido");
    }
    const sessao = await transporte.getVerifiedSession(nome);
    const proxy = sessao?.config?.proxy;
    if (
      sessao?.name !== nome ||
      sessao.status !== "STOPPED" ||
      !proxy ||
      typeof proxy !== "object" ||
      Array.isArray(proxy) ||
      (proxy as Record<string, unknown>).server !== recibo.server
    ) {
      throw new Error("pós-condição inválida");
    }
  } catch (erro) {
    throw new ErroDeProxy("proxy_nao_confirmado", codigoSeguro(erro));
  }
}

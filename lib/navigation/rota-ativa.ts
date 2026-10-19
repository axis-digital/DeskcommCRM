/**
 * Um item da navegação está ATIVO na própria rota, nas filhas dela e nas rotas
 * que declarou em `ativoEm`.
 *
 * Existe porque o quadro de um funil mora em `/app/pipelines/<id>`, fora do
 * prefixo de "Funis" (`/app/kanban`): quem estava no quadro via a sidebar sem
 * nenhum item marcado e perdia a referência de onde estava. Sidebar e barra
 * inferior usam esta MESMA função; duas regras de "ativo" divergiriam.
 */
export function rotaEstaAtiva(
  pathname: string,
  item: { href: string; ativoEm?: readonly string[] },
): boolean {
  return [item.href, ...(item.ativoEm ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

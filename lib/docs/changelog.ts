/**
 * Changelog público da instalação (`/docs/changelog`).
 *
 * Escrito na voz de quem USA o produto. O que fica de fora de propósito: número
 * de PR (o repositório é privado), promoção de imagem, digest, rollback,
 * sincronização com a upstream, migrations e documentos internos. Quem garante
 * a fronteira é `changelog.test.ts`, que reprova o vazamento de vocabulário.
 *
 * Para acrescentar uma versão: ponha o período novo NO TOPO de `PERIODOS` (a
 * ordem é do mais recente para o mais antigo, e o teste cobra).
 */

export const TIPOS_DE_MUDANCA = ["novo", "corrigido", "interface"] as const;

export type TipoDeMudanca = (typeof TIPOS_DE_MUDANCA)[number];

export interface Mudanca {
  readonly tipo: TipoDeMudanca;
  readonly texto: string;
}

export interface Periodo {
  /** Âncora da seção (`#id`): só letras minúsculas, dígitos e hífen. */
  readonly id: string;
  readonly titulo: string;
  /** Faixa de datas em texto, como o leitor lê (ex.: "03 a 06/11"). */
  readonly intervalo: string;
  /** Primeiro dia do período em ISO (AAAA-MM-DD); só serve para ordenar. */
  readonly inicio: string;
  readonly mudancas: readonly Mudanca[];
}

export const PERIODOS: readonly Periodo[] = [
  {
    id: "novembro-2026",
    titulo: "Novembro",
    intervalo: "03 a 06/11",
    inicio: "2026-11-03",
    mudancas: [
      { tipo: "novo", texto: "Inbox: convite para ligar as notificações da área de trabalho." },
      {
        tipo: "novo",
        texto:
          "WhatsApp: cada sessão do pool pode usar um proxy próprio, confirmado antes de a sessão iniciar (opcional).",
      },
      { tipo: "corrigido", texto: "Equipe: o convite vale 7 dias, em vez de 24 horas." },
      {
        tipo: "corrigido",
        texto:
          "Acervo do agente: PDF acima de 10 MB é recusado antes de ser processado, o que evita que o processamento dos documentos caia por falta de memória.",
      },
    ],
  },
  {
    id: "fim-de-outubro-2026",
    titulo: "Fim de outubro",
    intervalo: "23 a 30/10",
    inicio: "2026-10-23",
    mudancas: [
      { tipo: "novo", texto: "Nuvemshop: o catálogo de produtos da loja é espelhado no CRM." },
      { tipo: "novo", texto: "Contatos: os pedidos da loja aparecem na linha do tempo." },
      {
        tipo: "novo",
        texto: "Contatos: o cadastro e o carrinho abandonado aparecem na linha do tempo.",
      },
      {
        tipo: "novo",
        texto:
          "Contatos: o contato mostra de qual campanha veio, lida da página de entrada do pedido.",
      },
      {
        tipo: "corrigido",
        texto: "WhatsApp: o webhook da sessão é reafirmado quando some da configuração.",
      },
      {
        tipo: "corrigido",
        texto:
          "LGPD: o apagamento e a cópia dos dados passam a encontrar o cliente da loja, e o carimbo do WhatsApp preserva a origem do contato.",
      },
      { tipo: "corrigido", texto: "Nuvemshop: o catálogo da loja chega ao acervo do agente." },
    ],
  },
  {
    id: "meio-de-outubro-2026",
    titulo: "Meio de outubro",
    intervalo: "14 a 19/10",
    inicio: "2026-10-14",
    mudancas: [
      {
        tipo: "novo",
        texto: "Funil: a aba abre o funil padrão, e dá para responder pelo dossiê.",
      },
      { tipo: "novo", texto: "Funil: a conversa vem antes do negócio no dossiê." },
      {
        tipo: "novo",
        texto: "Funil: responsável e contato ficam editáveis no dossiê, com mais respiro visual.",
      },
      { tipo: "novo", texto: "Inbox: a imagem é comprimida no navegador antes do upload." },
      {
        tipo: "novo",
        texto:
          "Inbox: o anexo enviado aparece na conversa na hora, sem travar o campo de resposta.",
      },
      { tipo: "corrigido", texto: "Inbox: foto acima de 10 MB sobe inteira." },
      { tipo: "corrigido", texto: "Inbox: logos reais de WhatsApp, Instagram e Messenger." },
      {
        tipo: "corrigido",
        texto:
          "WhatsApp: o envio de mídia usa o endereço interno quando o servidor não alcança o próprio endereço público.",
      },
      {
        tipo: "corrigido",
        texto:
          "WhatsApp: o endereço público da mídia é lido ao rodar, não fixado na hora do build.",
      },
      { tipo: "interface", texto: "Interface: ícones no estilo Lucide em todo o produto." },
    ],
  },
  {
    id: "inicio-de-outubro-2026",
    titulo: "Início de outubro",
    intervalo: "08 a 16/10",
    inicio: "2026-10-08",
    mudancas: [
      {
        tipo: "novo",
        texto:
          "WhatsApp: suporte opcional a um servidor de conexão compartilhado entre instalações, com webhook por sessão.",
      },
      {
        tipo: "novo",
        texto: "Conversões: as conversões do CRM vão para o GA4, e a venda sem origem é opcional.",
      },
      {
        tipo: "novo",
        texto: "Onboarding: perfil do negócio, funil por objetivo e eventos do GA4 por etapa.",
      },
      {
        tipo: "interface",
        texto: "Interface: iconografia alinhada ao design system, de Phosphor para Lucide.",
      },
    ],
  },
];

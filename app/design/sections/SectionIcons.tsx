import {
  Archive,
  CalendarBlank,
  ChatCircle,
  Inbox,
  MagnifyingGlass,
  PaperPlaneTilt,
  UsersThree,
  Warning,
} from "@/lib/ui/icons";

const ICONES_CURADOS = [
  { nome: "inbox", Icone: Inbox },
  { nome: "conversa", Icone: ChatCircle },
  { nome: "clientes", Icone: UsersThree },
  { nome: "agenda", Icone: CalendarBlank },
  { nome: "buscar", Icone: MagnifyingGlass },
  { nome: "enviar", Icone: PaperPlaneTilt },
  { nome: "arquivar", Icone: Archive },
  { nome: "aviso", Icone: Warning },
];

const REGRAS = [
  {
    titulo: "Contorno monocromático",
    descricao: "O ícone herda currentColor e não usa fill, duotone ou gradiente.",
  },
  {
    titulo: "Traço de 1,75px",
    descricao: "É o padrão da interface. Use 2px apenas para ênfase em controles pequenos.",
  },
  {
    titulo: "Catálogo curado",
    descricao: "Toda tela importa do barrel canônico; não desenhe SVGs locais.",
  },
  {
    titulo: "Plataforma pela função",
    descricao: "Canais externos usam ícones genéricos com texto, sem redesenhar logotipos.",
  },
];

export function SectionIcons() {
  return (
    <div className="ds-section">
      <h2 className="ds-display">Iconografia</h2>
      <p className="ds-lede">
        O sistema usa o catálogo curado Axis/Lucide: formas outline, monocromáticas e consistentes
        em toda a interface.
      </p>

      <div className="ds-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Axis/Lucide</div>
            <div style={{ fontSize: 12.5, color: "var(--ds-text-muted)", marginTop: 2 }}>
              Outline · traço padrão de 1,75px · máximo de 2px
            </div>
          </div>
          <span className="ds-badge ds-badge--accent">padrão</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
            gap: 12,
          }}
        >
          {ICONES_CURADOS.map(({ nome, Icone }) => (
            <div
              key={nome}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 12,
                border: "1px solid var(--ds-border)",
                borderRadius: 8,
              }}
            >
              <div style={{ color: "var(--ds-accent)" }}>
                <Icone size={22} aria-hidden="true" />
              </div>
              <span className="ds-key">{nome}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 18,
        }}
      >
        {REGRAS.map((regra) => (
          <div className="ds-card" key={regra.titulo}>
            <h3 style={{ margin: 0, fontSize: 14 }}>{regra.titulo}</h3>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12.5,
                color: "var(--ds-text-muted)",
                lineHeight: 1.6,
              }}
            >
              {regra.descricao}
            </p>
          </div>
        ))}
      </div>

      <div className="ds-card" style={{ marginTop: 18, borderLeft: "3px solid var(--ds-accent)" }}>
        <h3 style={{ marginTop: 0 }}>Contrato de implementação</h3>
        <p style={{ fontSize: 13.5, color: "var(--ds-text-muted)", lineHeight: 1.6 }}>
          Importe os componentes de <span className="ds-mono">@/lib/ui/icons</span>. O barrel aplica
          o traço padrão e concentra o catálogo aprovado. Um símbolo novo entra ali antes de chegar
          a uma tela; imports diretos do pacote e SVGs artesanais não fazem parte do sistema.
        </p>
      </div>
    </div>
  );
}

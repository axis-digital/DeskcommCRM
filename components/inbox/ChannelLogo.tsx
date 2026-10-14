"use client";

import { ChatCircle } from "@/lib/ui/icons";
import { channelBrand } from "@/lib/channels/presentation";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import type { ChannelSummary } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Logos de marca, deliberadamente FORA do barrel canônico (`lib/ui/icons.ts`):
 * o design system Lucide é genérico/outline, e marca de rede tem forma e cor
 * fixas por identidade visual — não se encaixa na troca de peso/weight do
 * resto do sistema. Path data do Phosphor Icons (MIT), variante "fill",
 * viewBox 256.
 */
function WhatsappLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M152.58,145.23l23,11.48A24,24,0,0,1,152,176a72.08,72.08,0,0,1-72-72A24,24,0,0,1,99.29,80.46l11.48,23L101,118a8,8,0,0,0-.73,7.51,56.47,56.47,0,0,0,30.15,30.15A8,8,0,0,0,138,155ZM232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-40,24a8,8,0,0,0-4.42-7.16l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88A40,40,0,0,0,192,152Z" />
    </svg>
  );
}

function InstagramLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24ZM128,176a48,48,0,1,1,48-48A48.05,48.05,0,0,1,128,176Zm60-96a12,12,0,1,1,12-12A12,12,0,0,1,188,80Zm-28,48a32,32,0,1,1-32-32A32,32,0,0,1,160,128Z" />
    </svg>
  );
}

function MessengerLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm53.66,93.66-32,32a8,8,0,0,1-11.32,0L112,123.31,85.66,149.66a8,8,0,0,1-11.32-11.32l32-32a8,8,0,0,1,11.32,0L144,132.69l26.34-26.35a8,8,0,0,1,11.32,11.32Z" />
    </svg>
  );
}

const brands = {
  whatsapp: { Icon: WhatsappLogo, label: "WhatsApp", color: "text-[#128c4a] dark:text-[#25d366]" },
  instagram: {
    Icon: InstagramLogo,
    label: "Instagram",
    color: "text-[#c13584] dark:text-[#f472b6]",
  },
  messenger: {
    Icon: MessengerLogo,
    label: "Messenger",
    color: "text-[#0866ff] dark:text-[#60a5fa]",
  },
  unknown: { Icon: ChatCircle, label: "Canal", color: "text-muted-foreground" },
};

export function ChannelLogo({
  channel,
  size = 18,
  className,
}: {
  channel?: ChannelSummary | null;
  size?: number;
  className?: string;
}) {
  const t = useT();
  const { Icon, label, color } = brands[channelBrand(channel)];
  const name = label === "Canal" ? t("Canal") : label;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center", color, className)}
    >
      <Icon size={size} />
    </span>
  );
}

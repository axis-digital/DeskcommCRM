"use client";

import { ChatCircle } from "@/lib/ui/icons";
import { channelBrand } from "@/lib/channels/presentation";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import type { ChannelSummary } from "@/hooks/inbox/useConversationsRealtime";

const brands = {
  whatsapp: { label: "WhatsApp" },
  instagram: { label: "Instagram" },
  messenger: { label: "Messenger" },
  unknown: { label: "Canal" },
};

export function ChannelLogo({ channel, size = 18, className }: {
  channel?: ChannelSummary | null;
  size?: number;
  className?: string;
}) {
  const t = useT();
  const { label } = brands[channelBrand(channel)];
  const name = label === "Canal" ? t("Canal") : label;
  return <span role="img" aria-label={name} title={name} className={cn("inline-flex shrink-0 items-center justify-center text-muted-foreground", className)}>
    <ChatCircle size={size} aria-hidden />
  </span>;
}

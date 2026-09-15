import {
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  type LucideIcon,
} from "lucide-react";

import type { DeliveryState } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * Delivery state indicator (spec §99).
 *
 * Always pairs an icon with a word. A read receipt that is only a colour
 * change is unreadable to a third of the people who will use this.
 */
const DELIVERY: Record<
  DeliveryState,
  { label: string; icon: LucideIcon; className: string }
> = {
  sending: {
    label: "Sending",
    icon: Clock,
    className: "text-muted-foreground",
  },
  sent: { label: "Sent", icon: Check, className: "text-muted-foreground" },
  delivered: {
    label: "Delivered",
    icon: CheckCheck,
    className: "text-muted-foreground",
  },
  read: {
    label: "Read",
    icon: CheckCheck,
    className: "text-channel-whatsapp-on-subtle",
  },
  failed: {
    label: "Failed",
    icon: CircleAlert,
    className: "text-danger-on-subtle",
  },
};

export function DeliveryTag({
  state,
  time,
  className,
}: {
  state: DeliveryState;
  time?: string;
  className?: string;
}) {
  const meta = DELIVERY[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {time ? <span className="text-muted-foreground">{time}</span> : null}
      {time ? (
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
      ) : null}
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** WhatsApp channel mark. The only place the channel green is used at full strength. */
export function ChannelMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full bg-channel-whatsapp text-channel-whatsapp-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.12c-.25.69-1.45 1.32-1.99 1.36-.53.04-1.03.23-3.47-.72-2.92-1.15-4.77-4.15-4.91-4.34-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.11 1-2.39.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.25.6.83 2.07.9 2.22.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.35 1.45.29.15.46.12.63-.07.17-.19.73-.85.92-1.15.19-.29.39-.24.65-.14.26.09 1.67.79 1.95.93.29.15.48.22.55.34.07.12.07.69-.18 1.38Z" />
      </svg>
    </span>
  );
}

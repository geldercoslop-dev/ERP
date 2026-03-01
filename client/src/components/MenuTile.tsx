import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type Tone = "primary" | "success" | "warning" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  primary: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function MenuTile({
  icon,
  title,
  subtitle,
  onClick,
  tone = "neutral",
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => !disabled && onClick()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={[
        "transition-all",
        "hover:shadow-md",
        "active:scale-[0.99]",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <CardContent className="p-4 flex gap-3 items-start">
        <div className={["h-10 w-10 rounded-full flex items-center justify-center shrink-0", toneClass[tone]].join(" ")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-slate-900 leading-tight">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

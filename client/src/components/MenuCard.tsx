import React from "react";
import { useLocation } from "wouter";

const iconEmojiMap: Record<string, string> = {
  plus: "➕",
  users: "👥",
  package: "📦",
  "clipboard-list": "📋",
  "user-cog": "👤",
  "dollar-sign": "💲",
  receipt: "🧾",
  truck: "🚚",
  "credit-card": "💳",
  "bar-chart-3": "📊",
  "book-open": "📖",
  "building-2": "🏢",
};

interface MenuCardProps {
  icon?: string;
  title: string;
  description: string;
  href?: string;
  onClick?: (() => void) | undefined;
  badge?: string | number;
  highlight?: boolean;
}

export function MenuCard({ icon, title, description, href, onClick, badge, highlight }: MenuCardProps) {
  const [, setLocation] = useLocation();

  const iconRender = icon ? iconEmojiMap[icon] ?? iconEmojiMap[icon.toLowerCase()] ?? "✨" : "✨";

  function handleClick() {
    if (onClick) return onClick();
    if (href) return setLocation(href);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      className={[
        "group relative overflow-hidden",
        "bg-white dark:bg-slate-900",
        "border-2 rounded-2xl p-6",
        "transition-all duration-300 cursor-pointer",
        "hover:-translate-y-1",
        highlight
          ? "border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950"
          : "border-gray-200 dark:border-slate-700 hover:border-blue-400",
      ].join(" ")}
      style={{
        boxShadow: "0 10px 25px rgba(0,0,0,0.15), 0 6px 10px rgba(0,0,0,0.1), 0 3px 6px rgba(0,0,0,0.05)",
      }}
    >
      {/* Background decorativo */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-purple-200/20 dark:from-blue-800/20 dark:to-purple-800/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-500" />

      <div className="relative flex items-start gap-4">
        <div className="text-4xl leading-none flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
          {iconRender}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-extrabold text-base sm:text-lg bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
              {title}
            </h3>
            {badge !== undefined && badge !== null && badge !== "" && (
              <span className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-lg">
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{description}</p>
        </div>
        <div className="text-xl text-blue-500 flex-shrink-0 group-hover:translate-x-1 transition-transform duration-300">→</div>
      </div>
    </div>
  );
}

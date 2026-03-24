"use client";

import { useEffect, useMemo, useCallback } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { menuConfig } from "@/config/menuConfig";
import type { MenuItem, MenuItemChild } from "@/config/menuConfig";
import {
  Home,
  Plus,
  ShoppingCart,
  Users,
  Percent,
  Boxes,
  Package,
  ClipboardList,
  ClipboardCheck,
  Truck,
  Receipt,
  DollarSign,
  CreditCard,
  BarChart3,
  UserCog,
  Building2,
  Sliders,
  AlertTriangle,
  Activity,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  plus: Plus,
  "file-text": ShoppingCart,
  users: Users,
  tag: Percent,
  package: Boxes,
  "clipboard-list": ClipboardList,
  "clipboard-check": ClipboardCheck,
  "alert-triangle": AlertTriangle,
  truck: Truck,
  receipt: Receipt,
  "dollar-sign": DollarSign,
  "credit-card": CreditCard,
  "bar-chart-3": BarChart3,
  "user-cog": UserCog,
  "building-2": Building2,
  sliders: Sliders,
  activity: Activity,
  "shield-check": ShieldCheck,
};

type Role = "admin" | "vendedor";

export type CommandEntry = {
  label: string;
  href: string;
  group: string;
  keywords: string;
  iconName: string;
};

/** Ações prioritárias para busca rápida: digitar "cli" → Clientes, "ped" → Pedidos, etc. */
const QUICK_ACTIONS: CommandEntry[] = [
  { label: "Novo Pedido", href: "/nova-venda", group: "Ações", keywords: "novo pedido venda ped n", iconName: "plus" },
  { label: "Pedidos", href: "/vendas", group: "Ações", keywords: "pedidos ped lista vendas", iconName: "file-text" },
  { label: "Clientes", href: "/clientes", group: "Ações", keywords: "clientes cli cadastro", iconName: "users" },
  { label: "Produtos", href: "/produtos", group: "Ações", keywords: "produtos prod catálogo", iconName: "package" },
  { label: "Cargas", href: "/cargas", group: "Ações", keywords: "cargas car lista entrega", iconName: "truck" },
  { label: "Nova Carga", href: "/cargas", group: "Ações", keywords: "nova carga car criar", iconName: "truck" },
  { label: "Baixa de Carga", href: "/cargas", group: "Ações", keywords: "baixa carga car entrega dar baixa", iconName: "truck" },
  { label: "Estoque", href: "/estoque", group: "Ações", keywords: "estoque est saldo", iconName: "package" },
  { label: "Nota de Entrada", href: "/nota-entrada", group: "Ações", keywords: "nota entrada recebimento", iconName: "receipt" },
  { label: "Financeiro", href: "/financeiro", group: "Ações", keywords: "financeiro fin contas receber pagar", iconName: "dollar-sign" },
  { label: "Dashboard", href: "/", group: "Ações", keywords: "dashboard home início painel", iconName: "home" },
];

function flattenMenu(role: Role | undefined): CommandEntry[] {
  const seen = new Set<string>();
  const entries: CommandEntry[] = [];

  // Inserir ações rápidas primeiro (sempre visíveis para busca "cli", "ped", etc.)
  for (const e of QUICK_ACTIONS) {
    const key = `${e.href}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }

  const roleFilter = role === "admin" ? ["admin", "vendedor"] : ["vendedor"];

  for (const group of menuConfig) {
    for (const item of group.items) {
      if (!item.roles.some((r) => roleFilter.includes(r))) continue;

      const iconName = item.iconName;
      const groupLabel = group.group;

      if (item.children && item.children.length > 0) {
        for (const child of item.children as MenuItemChild[]) {
          const key = `${child.href}|${child.label}`;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({
            label: child.label,
            href: child.href,
            group: groupLabel,
            keywords: [item.label, child.label].join(" ").toLowerCase(),
            iconName,
          });
        }
      } else {
        const key = `${item.href}|${item.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          label: item.label,
          href: item.href,
          group: groupLabel,
          keywords: item.label.toLowerCase(),
          iconName,
        });
      }
    }
  }

  return entries;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: string) => void;
  userRole?: Role | null;
}

export function CommandPalette({ open, onOpenChange, onNavigate, userRole }: CommandPaletteProps) {
  const commands = useMemo(() => flattenMenu(userRole ?? undefined), [userRole]);

  const run = useCallback(
    (href: string) => {
      onNavigate(href);
      onOpenChange(false);
    },
    [onNavigate, onOpenChange]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "/" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, CommandEntry[]>();
    const seen = new Set<string>();
    for (const c of commands) {
      const key = `${c.href}|${c.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = byGroup.get(c.group) ?? [];
      list.push(c);
      byGroup.set(c.group, list);
    }
    return Array.from(byGroup.entries()).map(([group, items]) => ({ group, items }));
  }, [commands]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Busca e atalhos"
      description="Digite para buscar: cli → Clientes, ped → Pedidos, car → Cargas, est → Estoque, fin → Financeiro"
    >
      <CommandInput placeholder="Ex: cli, ped, car, est, fin, novo pedido, dashboard..." />
      <CommandList>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
        {groups.map(({ group, items }) => (
          <CommandGroup key={group} heading={group}>
            {items.map((cmd) => {
              const Icon = ICON_MAP[cmd.iconName] ?? Receipt;
              return (
                <CommandItem
                  key={`${cmd.group}-${cmd.label}-${cmd.href}`}
                  value={`${cmd.label} ${cmd.keywords}`}
                  onSelect={() => run(cmd.href)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{cmd.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

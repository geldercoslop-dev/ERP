import React from "react";
import { 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Copy, 
  Eye, 
  History, 
  FileText, 
  Printer, 
  CheckCircle2, 
  Ban,
  DollarSign,
  AlertTriangle,
  Truck
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

interface Action {
  label: string;
  icon: any;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}

interface TableActionsProps {
  actions: Action[];
}

/**
 * TableActions: Menu dropdown padronizado para ações em linhas de tabela.
 * Melhora a organização visual em telas com muitas colunas.
 */
export const TableActions = ({ actions }: TableActionsProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors">
          <MoreVertical className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl border-slate-200">
        {actions.map((action, idx) => {
          const Icon = action.icon;
          return (
            <React.Fragment key={idx}>
              <DropdownMenuItem
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded-lg transition-colors ${
                  action.variant === "destructive" 
                    ? "text-rose-600 focus:text-rose-700 focus:bg-rose-50" 
                    : "text-slate-700 focus:text-primary focus:bg-primary/5"
                }`}
              >
                <Icon className={`h-4 w-4 ${action.variant === "destructive" ? "text-rose-600" : "text-slate-400 group-hover:text-primary"}`} />
                <span className="text-sm font-medium">{action.label}</span>
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Ícones reexportados para facilitar uso nas páginas
export { 
  Pencil, 
  Trash2, 
  Copy, 
  Eye, 
  History, 
  FileText, 
  Printer, 
  CheckCircle2, 
  Ban,
  DollarSign,
  AlertTriangle,
  Truck
};

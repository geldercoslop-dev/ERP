import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Conteúdo à direita do título (botões, badge, etc.) */
  actions?: React.ReactNode;
  /** Ícone à esquerda do título (opcional) */
  icon?: React.ReactNode;
  /** Rota ao clicar em Voltar. Padrão: "/" */
  backTo?: string;
};

const defaultBackTo = "/";

export function PageHeader({ title, subtitle, actions, icon, backTo = defaultBackTo }: PageHeaderProps) {
  const [, setLocation] = useLocation();

  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
      <div className="container py-4 flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => setLocation(backTo)} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Package, Users, Palette, Calculator, Truck, CreditCard, FileText, ShieldCheck } from "lucide-react";
import { MenuSection } from "@/components/MenuSection";
import { MenuTile } from "@/components/MenuTile";

export default function Cadastros() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-extrabold tracking-tight text-slate-900">Cadastros</div>
            <div className="text-xs text-muted-foreground">Tudo que é base do sistema fica aqui.</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <MenuSection icon={<Package className="h-4 w-4" />} title="Produtos" subtitle="Cadastro e regras de precificação">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuTile
              icon={<Package className="h-5 w-5" />}
              title="Produtos"
              subtitle="Cadastro completo"
              tone="primary"
              onClick={() => setLocation("/produtos")}
            />
            <MenuTile
              icon={<Calculator className="h-5 w-5" />}
              title="Grupos de Precificação"
              subtitle="Cálculos, garantia e regras"
              tone="neutral"
              onClick={() => setLocation("/grupos-precificacao")}
            />
            <MenuTile
              icon={<Palette className="h-5 w-5" />}
              title="Cores"
              subtitle="Variações e estoque por cor"
              tone="neutral"
              onClick={() => setLocation("/cores")}
            />
          </div>
        </MenuSection>

        <MenuSection icon={<Users className="h-4 w-4" />} title="Pessoas" subtitle="Equipe e fornecedores">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuTile
              icon={<Users className="h-5 w-5" />}
              title="Vendedores"
              subtitle="Cadastro e permissões (fase 2)"
              tone="neutral"
              onClick={() => setLocation("/vendedores")}
            />
            <MenuTile
              icon={<Truck className="h-5 w-5" />}
              title="Fornecedores"
              subtitle="Marcas e contatos"
              tone="neutral"
              onClick={() => setLocation("/fornecedores")}
            />
          </div>
        </MenuSection>

        <MenuSection icon={<CreditCard className="h-4 w-4" />} title="Financeiro" subtitle="Estrutura de contas e rotinas">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuTile
              icon={<FileText className="h-5 w-5" />}
              title="Plano de Contas"
              subtitle="Classificações"
              tone="neutral"
              onClick={() => setLocation("/plano-contas")}
            />
            <MenuTile
              icon={<CreditCard className="h-5 w-5" />}
              title="Contas Fixas"
              subtitle="Mensais recorrentes"
              tone="neutral"
              onClick={() => setLocation("/contas-fixas")}
            />
            <MenuTile
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Configurações Banco"
              subtitle="Integrações e parâmetros"
              tone="neutral"
              onClick={() => setLocation("/configuracoes-banco")}
            />
          </div>
        </MenuSection>
      </main>
    </div>
  );
}

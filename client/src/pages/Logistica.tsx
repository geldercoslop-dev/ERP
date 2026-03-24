import { useLocation } from "wouter";
import { Truck, Package, Map, FileText, History, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

/**
 * Hub do menu Logística: links para Gerar carga, Roteiro, Mapa, Baixa, Histórico, Relatório.
 */
export default function Logistica() {
  const [, setLocation] = useLocation();

  const links = [
    { label: "Gerar carga", href: "/logistica/carga", icon: Package, desc: "Criar nova carga (cidade, data, pedidos)" },
    { label: "Cargas / Roteiro", href: "/cargas", icon: ClipboardList, desc: "Lista de cargas e editar roteiro" },
    { label: "Mapa da rota", href: "/logistica/mapa", desc: "Selecione uma carga para ver o mapa", icon: Map },
    { label: "Baixa de carga", href: "/cargas", icon: Truck, desc: "Dar baixa nos pedidos (abrir uma carga EM ROTA)" },
    { label: "Histórico de rotas", href: "/logistica/historico", icon: History, desc: "Consultar rotas executadas" },
    { label: "Relatório de viagem", href: "/logistica/relatorio-viagem", icon: FileText, desc: "Relatório por carga" },
  ];

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Logística"
        subtitle="Cargas, roteiros, mapa e baixa de entrega"
        icon={<Truck className="h-5 w-5 text-primary" />}
        backTo="/"
      />
      <main className={PAGE_MAIN}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <Card
              key={item.href}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(item.href)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{item.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

/**
 * Página de vendas: sem cards; uso pelo menu lateral (submenus).
 */
export default function Vendas() {
  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader title="Pedidos" subtitle="Gestão de pedidos" />
      <main className={PAGE_MAIN}>
        <p className="text-muted-foreground">Use o menu lateral para acessar Meus Pedidos, Nova Venda, Clientes e Estoque.</p>
      </main>
    </div>
  );
}

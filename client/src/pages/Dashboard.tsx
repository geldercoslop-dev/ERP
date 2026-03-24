import { TrendingUp, Users, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import {
  MOCK_FATURAMENTO_MES,
  MOCK_TOTAL_CLIENTES,
  MOCK_TOTAL_VENDAS,
  MOCK_VENDAS_RECENTES,
} from "@/mocks/dashboardMock";

export default function Dashboard() {
  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral (dados de demonstração — substituir pela API quando integrar)"
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <div className={PAGE_MAIN}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase">
              <ShoppingCart className="h-4 w-4" />
              Total vendas
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{MOCK_TOTAL_VENDAS}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase">
              <Users className="h-4 w-4" />
              Total clientes
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{MOCK_TOTAL_CLIENTES}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase">
              <TrendingUp className="h-4 w-4" />
              Faturamento (mês)
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-700">
              {MOCK_FATURAMENTO_MES.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
      </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-3">Vendas recentes (mock)</h3>
          <ul className="divide-y divide-slate-100">
            {MOCK_VENDAS_RECENTES.map((v) => (
              <li key={v.id} className="py-3 flex justify-between gap-4 text-sm">
                <span className="font-medium text-slate-800">{v.clienteNome}</span>
                <span className="text-slate-500">{v.data}</span>
                <span className="font-semibold text-slate-900">
                  {v.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
          </div>
    </div>
  );
}

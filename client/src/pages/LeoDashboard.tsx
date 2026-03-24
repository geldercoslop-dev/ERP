import { useAuthStore } from "@/store/authStore";
import { LeoDashboard as LeoDashboardCore } from "@/components/ai/LeoDashboard";

/**
 * Painel de inteligência do LEO: insights, alertas, previsões, indicadores, status de entregas.
 */
export default function LeoDashboard() {
  const { isAuthenticated } = useAuthStore();
  
  // Se não estiver autenticado, mostrar loading em vez de redirecionar
  if (!isAuthenticated) {
    return <div>Carregando...</div>;
  }
  return (
    <div className="p-4 md:p-6">
      <LeoDashboardCore />
    </div>
  );
}

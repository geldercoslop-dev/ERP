import { useApiHealth } from "@/contexts/ApiHealthContext";
import ClientesConnected from "@/pages/clientes/ClientesConnected";
import ClientesOfflinePanel from "@/pages/clientes/ClientesOfflinePanel";

export default function Clientes() {
  const { status } = useApiHealth();
  if (status === "offline") {
    return <ClientesOfflinePanel />;
  }
  return <ClientesConnected />;
}

import { useApiHealth } from "../contexts/ApiHealthContext";
import ClientesConnected from "./clientes/ClientesConnected";
import ClientesOfflinePanel from "./clientes/ClientesOfflinePanel";

export default function Clientes() {
  const { status } = useApiHealth();
  if (status === "offline") {
    return <ClientesOfflinePanel />;
  }
  return <ClientesConnected />;
}

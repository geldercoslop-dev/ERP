import { useApiHealth } from "@/contexts/ApiHealthContext";
import ProdutosConnected from "@/pages/produtos/ProdutosConnected";
import ProdutosOfflinePanel from "@/pages/produtos/ProdutosOfflinePanel";

export default function Produtos() {
  const { status } = useApiHealth();
  if (status === "offline") {
    return <ProdutosOfflinePanel />;
  }
  return <ProdutosConnected />;
}

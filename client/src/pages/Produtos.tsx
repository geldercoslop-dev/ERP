import { useApiHealth } from "../contexts/ApiHealthContext";
import ProdutosConnected from "./produtos/ProdutosConnected";
import ProdutosOfflinePanel from "./produtos/ProdutosOfflinePanel";

export default function Produtos() {
  const { status } = useApiHealth();
  if (status === "offline") {
    return <ProdutosOfflinePanel />;
  }
  return <ProdutosConnected />;
}

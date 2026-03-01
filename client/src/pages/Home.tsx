import { useAuth } from "@/hooks/useAuth";

/**
 * Tela inicial: área de conteúdo limpa (sem cards), conforme especificação visual.
 * Navegação é feita pelo menu lateral.
 */
export default function Home() {
  const { isAuthenticated, isLoading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });

  if (!isAuthenticated || isLoading) return null;

  return <div className="min-h-[200px]" />;
}

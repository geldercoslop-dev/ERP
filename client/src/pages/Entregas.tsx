import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Compatibilidade: a rota `/entregas` aponta para o fluxo estável atual em `/cargas`.
 * Mantém a URL sem quebrar favoritos/menus antigos.
 */
export default function Entregas() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/cargas");
  }, [setLocation]);

  return null;
}


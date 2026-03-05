import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Placeholder seguro:
 * - O schema atual não possui entidade "fornecedores" dedicada.
 * - Mantemos a rota para não quebrar menu/URLs e redirecionamos para Cadastros.
 */
export default function Fornecedores() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/cadastros");
  }, [setLocation]);

  return null;
}


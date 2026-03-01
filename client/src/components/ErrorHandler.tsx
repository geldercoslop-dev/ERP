import { useEffect } from 'react';
import { toast } from 'sonner';

export function ErrorHandler() {
  useEffect(() => {
    // Capturar erros não tratados
    const handleError = (event: ErrorEvent) => {
      console.error('Erro não tratado:', event.error);
      
      // Exibir mensagem de erro
      toast.error('Ocorreu um erro inesperado', {
        description: event.error?.message || 'Tente novamente ou contate o suporte',
      });
      
      // Evitar que o erro seja exibido no console novamente
      event.preventDefault();
    };
    
    // Adicionar listener para erros não tratados
    window.addEventListener('error', handleError);
    
    // Remover listener ao desmontar
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui/input';

interface GlobalSearchProps {
  onNavigate: (path: string) => void;
  placeholder?: string;
  variant?: 'light' | 'dark';
  className?: string;
}

export function GlobalSearch({ 
  onNavigate, 
  placeholder = "Buscar...", 
  variant = 'light',
  className = ''
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Implementar lógica de busca
    if (query.trim()) {
      // Por enquanto, apenas simular navegação
      onNavigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className}`}>
      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${
        variant === 'dark' ? 'text-white/60' : 'text-slate-400'
      }`} />
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-9 ${
          variant === 'dark' 
            ? 'bg-white/10 border-white/10 text-white placeholder:text-white/40 focus:border-white/20 focus:bg-white/15' 
            : 'bg-white border-slate-200 text-slate-800'
        } h-10 rounded-xl`}
      />
    </form>
  );
}
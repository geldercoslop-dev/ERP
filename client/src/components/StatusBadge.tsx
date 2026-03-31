import React from 'react';
import { Badge } from './ui/badge';

interface StatusBadgeProps {
  status: 'ok' | 'warning' | 'critical' | 'loading' | 'unknown';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'ok':
        return { 
          label: 'Saudável', 
          icon: '🟢',
          className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200' 
        };
      case 'warning':
        return { 
          label: 'Alerta', 
          icon: '🟡',
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200' 
        };
      case 'critical':
        return { 
          label: 'Crítico', 
          icon: '🔴',
          className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200' 
        };
      case 'loading':
        return { 
          label: 'Carregando', 
          icon: '⏳',
          className: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200' 
        };
      default:
        return { 
          label: 'Desconhecido', 
          icon: '❓',
          className: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200' 
        };
    }
  };

  const getSizeClass = () => {
    switch (size) {
      case 'sm': return 'text-xs px-2 py-0.5';
      case 'lg': return 'text-base px-4 py-2';
      default: return 'text-sm px-3 py-1';
    }
  };

  const config = getStatusConfig();
  
  return (
    <Badge className={`${config.className} ${getSizeClass()} transition-colors duration-200`}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}

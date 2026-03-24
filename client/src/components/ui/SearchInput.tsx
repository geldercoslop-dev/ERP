import React, { useState, useEffect, ChangeEvent } from 'react';
import { useDebounce } from '../../hooks/useDebounce';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Componente de input com debounce integrado
 * Otimizado para buscas em tempo real
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  delay = 300,
  className = '',
  disabled = false
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  
  // Aplicar debounce na função onChange
  const debouncedOnChange = useDebounce(onChange, delay);

  // Sincronizar valor externo com local
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    debouncedOnChange(newValue);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${className}
        `}
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default SearchInput;

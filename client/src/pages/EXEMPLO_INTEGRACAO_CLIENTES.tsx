/**
 * Exemplo de Integração: Página de Clientes
 * Demonstra como usar os services e hooks corretamente
 */

import { useState } from 'react';
import { useApiGet, useApiMutation } from '@/hooks/useApi';

interface Cliente {
  id: number;
  nome: string;
  email: string;
  telefone?: string;
  created_at?: string;
}

/**
 * Componente: Lista de Clientes
 * - Carrega lista com useApiGet
 * - Permite criar novo client com useApiMutation
 * - Tipagem forte, sem `any`
 */
export function ExemploClientesList() {
  // GET: Listar clientes
  const {
    data: clientesData,
    loading: loadingList,
    error: errorList,
    refetch: refetchList,
  } = useApiGet<{ items: Cliente[] }>('/api/clientes', {
    immediate: true,
  });

  // POST: Criar cliente
  const { loading: loadingCreate, execute: criarCliente } = useApiMutation<Cliente>('post');

  // Form state
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');

  const clientes = clientesData?.items || [];

  // Handle submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim() || !email.trim()) {
      alert('Preencha nome e email');
      return;
    }

    const novoCliente = await criarCliente('/api/clientes', {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefone.trim() || undefined,
    });

    if (novoCliente) {
      // Limpar form
      setNome('');
      setEmail('');
      setTelefone('');

      // Recarregar lista
      await refetchList();
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Clientes</h1>

      {/* Form: Criar Cliente */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-lg font-semibold mb-4">Novo Cliente</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="João Silva"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="joao@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Telefone (opcional)</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="(11) 99999-9999"
            />
          </div>

          <button
            type="submit"
            disabled={loadingCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {loadingCreate ? 'Criando...' : 'Criar'}
          </button>
        </form>
      </div>

      {/* List: Clientes */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Lista ({clientes.length})</h2>
          <button
            onClick={refetchList}
            disabled={loadingList}
            className="text-blue-600 hover:underline"
          >
            {loadingList ? 'Recarregando...' : 'Recarregar'}
          </button>
        </div>

        {errorList && (
          <div className="p-4 mb-4 bg-red-100 text-red-700 rounded">
            {errorList}
          </div>
        )}

        {loadingList && !clientes.length && (
          <p className="text-gray-500">Carregando...</p>
        )}

        {clientes.length === 0 && !loadingList && (
          <p className="text-gray-500">Nenhum cliente cadastrado</p>
        )}

        {clientes.length > 0 && (
          <table className="w-full border-collapse border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">ID</th>
                <th className="border p-2 text-left">Nome</th>
                <th className="border p-2 text-left">Email</th>
                <th className="border p-2 text-left">Telefone</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id} className="hover:bg-gray-50">
                  <td className="border p-2">{cliente.id}</td>
                  <td className="border p-2">{cliente.nome}</td>
                  <td className="border p-2">{cliente.email}</td>
                  <td className="border p-2">{cliente.telefone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ExemploClientesList;

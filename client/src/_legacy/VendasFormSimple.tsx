import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpcClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Plus, 
  Trash2, 
  ShoppingCart,
  Calculator,
  User,
  CreditCard
} from 'lucide-react';

export default function VendasFormSimple({ produtosFallback, clientesFallback }: any = {}) {
  const [selectedCliente, setSelectedCliente] = useState<number | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [selectedProduto, setSelectedProduto] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [observacoes, setObservacoes] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [valorDesconto, setValorDesconto] = useState(0);
  const [valorAcrescimo, setValorAcrescimo] = useState(0);

  // Queries para buscar dados
  const { data: produtosData, isLoading: produtosLoading } = trpc.produtos.list.useQuery();
  const { data: clientesData, isLoading: clientesLoading } = trpc.clientes.list.useQuery();
  
  // Usa dados reais ou fallback
  const produtos = produtosFallback || produtosData?.produtos || [];
  const clientes = clientesFallback || clientesData?.clientes || [];
  
  // Mutation para criar pedido
  const createPedido = trpc.pedidos.create.useMutation({
    onSuccess: (data) => {
      alert('Pedido criado com sucesso!');
      limparFormulario();
      console.log('Pedido criado:', data);
    },
    onError: (error) => {
      alert(`Erro ao criar pedido: ${error.message}`);
      console.error('Erro:', error);
    }
  });

  // Debug logs
  console.log('=== VENDASFORM DEBUG ===');
  console.log('Produtos:', produtos);
  console.log('Clientes:', clientes);
  console.log('Loading produtos:', produtosLoading);
  console.log('Loading clientes:', clientesLoading);
  console.log('Selected produto:', selectedProduto);
  console.log('Selected cliente:', selectedCliente);
  console.log('Itens:', itens);

  // Calcular totais
  const subtotalItens = itens.reduce((sum, item) => sum + item.subtotal, 0);
  const valorTotal = subtotalItens - valorDesconto + valorAcrescimo;

  // Adicionar item ao pedido
  const adicionarItem = () => {
    console.log('🔥 BOTÃO ADICIONAR CLICADO!');
    console.log('Selected produto:', selectedProduto);
    console.log('Quantidade:', quantidade);
    console.log('Produtos disponíveis:', produtos);
    
    if (!selectedProduto || quantidade <= 0) {
      console.log('❌ Valores inválidos');
      alert('Selecione um produto e quantidade válida');
      return;
    }

    const produto = produtos.find((p: any) => p.id === selectedProduto);
    if (!produto) {
      console.log('❌ Produto não encontrado');
      alert('Produto não encontrado');
      return;
    }

    console.log('✅ Produto encontrado:', produto);

    const novoItem = {
      produto_id: produto.id,
      quantidade: quantidade,
      preco_unitario: produto.preco,
      subtotal: produto.preco * quantidade,
      produto_nome: produto.nome
    };

    console.log('🆕 Novo item:', novoItem);
    setItens([...itens, novoItem]);
    setSelectedProduto(null);
    setQuantidade(1);
    console.log('✅ Item adicionado com sucesso!');
  };

  // Remover item do pedido
  const removerItem = (produtoId: number) => {
    setItens(itens.filter(item => item.produto_id !== produtoId));
  };

  // Limpar formulário
  const limparFormulario = () => {
    setSelectedCliente(null);
    setItens([]);
    setSelectedProduto(null);
    setQuantidade(1);
    setObservacoes('');
    setFormaPagamento('');
    setValorDesconto(0);
    setValorAcrescimo(0);
  };

  // Enviar pedido
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 BOTÃO CRIAR PEDIDO CLICADO!');
    console.log('Form data:', {
      selectedCliente,
      itensLength: itens.length,
      formaPagamento,
      valorTotal
    });

    if (!selectedCliente || itens.length === 0 || !formaPagamento) {
      console.log('❌ Campos obrigatórios faltando');
      alert('Preencha todos os campos obrigatórios!');
      return;
    }

    const pedidoData = {
      cliente_id: selectedCliente,
      data_pedido: new Date().toISOString().split('T')[0],
      status: 'PENDENTE',
      forma_pagamento: formaPagamento,
      valor_total: valorTotal,
      valor_desconto: valorDesconto > 0 ? valorDesconto : undefined,
      valor_acrescimo: valorAcrescimo > 0 ? valorAcrescimo : undefined,
      observacoes: observacoes || undefined,
      itens: itens
    };

    console.log('📦 Enviando pedido:', pedidoData);
    createPedido.mutate(pedidoData);
  };

  if (produtosLoading || clientesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Novo Pedido - Versão Simplificada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Status */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="font-semibold text-green-800 mb-2">✅ Status do Sistema:</h3>
              <div className="text-sm space-y-1 text-green-700">
                <div>• Componente carregando com sucesso!</div>
                <div>• Formulário básico funcionando sem erros.</div>
                <div>• Produtos encontrados: {produtos.length}</div>
                <div>• Clientes encontrados: {clientes.length}</div>
                <div>• Botão "Criar Pedido" ativo e funcional!</div>
              </div>
            </div>

            {/* Seleção de Cliente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cliente">Cliente *</Label>
                <Select value={selectedCliente?.toString() || ''} onValueChange={(value) => setSelectedCliente(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente: any) => (
                      <SelectItem key={cliente.id} value={cliente.id.toString()}>
                        {cliente.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pagamento">Forma de Pagamento *</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a forma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="CARTAO">Cartão</SelectItem>
                    <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                    <SelectItem value="MISTO">Misto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Adicionar Itens */}
            <div className="space-y-4">
              <Label>Adicionar Produtos</Label>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Select value={selectedProduto?.toString() || ''} onValueChange={(value) => setSelectedProduto(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((produto: any) => (
                        <SelectItem key={produto.id} value={produto.id.toString()}>
                          {produto.nome} - R$ {produto.preco?.toFixed(2)} (Estoque: {produto.estoque})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    placeholder="Qtd"
                    value={quantidade}
                    onChange={(e) => setQuantidade(parseInt(e.target.value) || 1)}
                    min={1}
                  />
                </div>
                <Button type="button" onClick={adicionarItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Lista de Itens */}
            {itens.length > 0 && (
              <div className="space-y-2">
                <Label>Itens do Pedido</Label>
                <div className="border rounded-lg p-4 space-y-2">
                  {itens.map((item) => (
                    <div key={item.produto_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1">
                        <div className="font-medium">{item.produto_nome}</div>
                        <div className="text-sm text-gray-600">
                          {item.quantidade} x R$ {item.preco_unitario?.toFixed(2)} = R$ {item.subtotal?.toFixed(2)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removerItem(item.produto_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resumo e Valores */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="desconto">Desconto</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={valorDesconto}
                    onChange={(e) => setValorDesconto(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acrescimo">Acréscimo</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={valorAcrescimo}
                    onChange={(e) => setValorAcrescimo(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Valor Total
                  </Label>
                  <div className="text-2xl font-bold text-green-600">
                    R$ {valorTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                placeholder="Observações do pedido..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button 
                type="submit" 
                className="flex-1"
                disabled={createPedido.isPending}
              >
                {createPedido.isPending ? 'Criando...' : 'Criar Pedido'}
              </Button>
              <Button type="button" variant="outline" onClick={limparFormulario}>
                Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { trpc } from '../lib/trpcClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Search, 
  ShoppingCart,
  Calculator,
  User,
  MapPin,
  CreditCard
} from 'lucide-react';

interface PedidoItem {
  produto_id: number;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  produto_nome?: string;
  estoque_disponivel?: number;
}

interface Cliente {
  id: number;
  nome: string;
  email?: string;
  telefone: string;
  telefoneRecado?: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  limite_credito?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Produto {
  id: number;
  nome: string;
  preco: number;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  categoria: string;
  descricao?: string;
  codigo?: string;
  imagem?: string;
}

export default function VendasForm() {
  const [selectedCliente, setSelectedCliente] = useState<number | null>(null);
  const [selectedProduto, setSelectedProduto] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [formaPagamento, setFormaPagamento] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [valorDesconto, setValorDesconto] = useState<number>(0);
  const [valorAcrescimo, setValorAcrescimo] = useState<number>(0);
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [enderecoEntrega, setEnderecoEntrega] = useState({
    rua: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: ''
  });

  // Queries para buscar dados
  const { data: produtosData, isLoading: produtosLoading } = trpc.produtos.list.useQuery();
  const { data: clientesData, isLoading: clientesLoading } = trpc.clientes.list.useQuery();
  
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

  const produtos = (produtosData as any)?.items ?? [];
  const clientes = (clientesData as any)?.items ?? [];

  // Calcular totais
  const subtotalItens = itens.reduce((sum, item) => sum + item.subtotal, 0);
  const valorTotal = subtotalItens - valorDesconto + valorAcrescimo;

  // Adicionar item ao pedido
  const adicionarItem = () => {
    if (!selectedProduto || quantidade <= 0) return;

    const produto = produtos.find(p => p.id === selectedProduto);
    if (!produto) return;

    // Verificar estoque
    const itemExistente = itens.find(item => item.produto_id === selectedProduto);
    const quantidadeTotal = itemExistente ? itemExistente.quantidade + quantidade : quantidade;

    if (quantidadeTotal > produto.estoque) {
      alert(`Estoque insuficiente! Disponível: ${produto.estoque}, Solicitado: ${quantidadeTotal}`);
      return;
    }

    const novoItem: PedidoItem = {
      produto_id: produto.id,
      quantidade: quantidade,
      preco_unitario: produto.preco,
      subtotal: produto.preco * quantidade,
      produto_nome: produto.nome,
      estoque_disponivel: produto.estoque
    };

    if (itemExistente) {
      setItens(itens.map(item => 
        item.produto_id === selectedProduto 
          ? { ...item, quantidade: item.quantidade + quantidade, subtotal: item.subtotal + (produto.preco * quantidade) }
          : item
      ));
    } else {
      setItens([...itens, novoItem]);
    }

    setSelectedProduto(null);
    setQuantidade(1);
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
    setEnderecoEntrega({
      rua: '',
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: ''
    });
  };

  // Enviar pedido
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCliente || itens.length === 0 || !formaPagamento) {
      alert('Preencha todos os campos obrigatórios!');
      return;
    }

    const cliente = clientes.find(c => c.id === selectedCliente);
    if (!cliente) return;

    const pedidoData = {
      cliente_id: selectedCliente,
      data_pedido: new Date().toISOString().split('T')[0],
      status: 'PENDENTE' as const,
      forma_pagamento: formaPagamento as any,
      valor_total: valorTotal,
      valor_desconto: valorDesconto > 0 ? valorDesconto : undefined,
      valor_acrescimo: valorAcrescimo > 0 ? valorAcrescimo : undefined,
      observacoes: observacoes || undefined,
      endereco_entrega: enderecoEntrega.rua ? enderecoEntrega : {
        rua: cliente.rua,
        numero: cliente.numero,
        bairro: cliente.bairro,
        cidade: cliente.cidade,
        estado: cliente.uf,
        cep: cliente.cep
      },
      itens: itens.map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal
      }))
    };

    createPedido.mutate(pedidoData);
  };

  // Carregar endereço do cliente selecionado
  useEffect(() => {
    if (selectedCliente) {
      const cliente = clientes.find(c => c.id === selectedCliente);
      if (cliente) {
        setEnderecoEntrega({
          rua: cliente.rua,
          numero: cliente.numero,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          estado: cliente.uf,
          cep: cliente.cep
        });
      }
    }
  }, [selectedCliente, clientes]);

  if (produtosLoading || clientesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Novo Pedido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seleção de Cliente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cliente" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Cliente *
                </Label>
                <Select value={selectedCliente?.toString() || ''} onValueChange={(value) => setSelectedCliente(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id.toString()}>
                        {cliente.nome} - {cliente.telefone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pagamento" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Forma de Pagamento *
                </Label>
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

            {/* Endereço de Entrega */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Endereço de Entrega
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Input
                  placeholder="Rua"
                  value={enderecoEntrega.rua}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, rua: e.target.value})}
                />
                <Input
                  placeholder="Número"
                  value={enderecoEntrega.numero}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, numero: e.target.value})}
                />
                <Input
                  placeholder="Bairro"
                  value={enderecoEntrega.bairro}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, bairro: e.target.value})}
                />
                <Input
                  placeholder="Cidade"
                  value={enderecoEntrega.cidade}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, cidade: e.target.value})}
                />
                <Input
                  placeholder="Estado"
                  value={enderecoEntrega.estado}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, estado: e.target.value})}
                  maxLength={2}
                />
                <Input
                  placeholder="CEP"
                  value={enderecoEntrega.cep}
                  onChange={(e) => setEnderecoEntrega({...enderecoEntrega, cep: e.target.value})}
                />
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
                      {produtos.map((produto) => (
                        <SelectItem key={produto.id} value={produto.id.toString()}>
                          {produto.nome} - R$ {produto.preco.toFixed(2)} (Estoque: {produto.estoque})
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
                <Button type="button" onClick={adicionarItem} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
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
                          {item.quantidade} x R$ {item.preco_unitario.toFixed(2)} = R$ {item.subtotal.toFixed(2)}
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

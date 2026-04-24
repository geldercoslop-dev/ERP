import { z } from 'zod';
import { TRPCError } from '@trpc/server';
const clienteSchema = z.object({
    id: z.number().optional(),
    nome: z.string().min(1, 'Nome é obrigatório'),
    email: z.string().email('Email inválido').optional(),
    telefone: z.string().min(8, 'Telefone deve ter pelo menos 8 dígitos'),
    cpf_cnpj: z.string().min(11, 'CPF/CNPJ deve ter pelo menos 11 dígitos'),
    endereco: z.object({
        rua: z.string().min(1, 'Rua é obrigatória'),
        numero: z.string().min(1, 'Número é obrigatório'),
        bairro: z.string().min(1, 'Bairro é obrigatório'),
        cidade: z.string().min(1, 'Cidade é obrigatória'),
        estado: z.string().length(2, 'Estado deve ter 2 dígitos'),
        cep: z.string().min(8, 'CEP deve ter pelo menos 8 dígitos')
    }),
    tipo_pessoa: z.enum(['FISICA', 'JURIDICA']),
    limite_credito: z.number().min(0, 'Limite de crédito deve ser maior ou igual a 0').optional(),
    data_cadastro: z.string().optional()
});
let clientes = [
    {
        id: 1,
        nome: 'João Silva',
        email: 'joao@email.com',
        telefone: '11987654321',
        cpf_cnpj: '12345678901',
        endereco: {
            rua: 'Rua das Flores',
            numero: '123',
            bairro: 'Centro',
            cidade: 'São Paulo',
            estado: 'SP',
            cep: '01234567'
        },
        tipo_pessoa: 'FISICA',
        limite_credito: 5000.00,
        data_cadastro: '2024-01-15'
    },
    {
        id: 2,
        nome: 'Maria Santos Ltda',
        email: 'contato@marialtda.com.br',
        telefone: '11912345678',
        cpf_cnpj: '12345678000195',
        endereco: {
            rua: 'Av. Principal',
            numero: '1000',
            bairro: 'Industrial',
            cidade: 'São Paulo',
            estado: 'SP',
            cep: '045678901'
        },
        tipo_pessoa: 'JURIDICA',
        limite_credito: 15000.00,
        data_cadastro: '2024-02-20'
    },
    {
        id: 3,
        nome: 'Carlos Oliveira',
        email: 'carlos@email.com',
        telefone: '11987654322',
        cpf_cnpj: '98765432100',
        endereco: {
            rua: 'Rua Verde',
            numero: '456',
            bairro: 'Jardins',
            cidade: 'São Paulo',
            estado: 'SP',
            cep: '02345678'
        },
        tipo_pessoa: 'FISICA',
        limite_credito: 3000.00,
        data_cadastro: '2024-03-10'
    }
];
export async function getClientes(_request) {
    try {
        return { clientes, total: clientes.length };
    }
    catch (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar clientes' });
    }
}
export async function getClienteById(request) {
    try {
        const { id } = request.params;
        const cliente = clientes.find(c => c.id === parseInt(id));
        if (!cliente) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        return cliente;
    }
    catch (error) {
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar cliente' });
    }
}
export async function createCliente(request) {
    try {
        const clienteData = clienteSchema.parse(request.body);
        const novoCliente = {
            ...clienteData,
            id: clientes.length + 1,
            data_cadastro: clienteData.data_cadastro || new Date().toISOString().split('T')[0]
        };
        clientes.push(novoCliente);
        return { message: 'Cliente criado com sucesso', cliente: novoCliente };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
        }
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar cliente' });
    }
}
export async function updateCliente(request) {
    try {
        const { id } = request.params;
        const clienteData = clienteSchema.parse(request.body);
        const index = clientes.findIndex(c => c.id === parseInt(id));
        if (index === -1) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        clientes[index] = { ...clienteData, id: parseInt(id) };
        return { message: 'Cliente atualizado com sucesso', cliente: clientes[index] };
    }
    catch (error) {
        if (error instanceof z.ZodError)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar cliente' });
    }
}
export async function deleteCliente(request) {
    try {
        const { id } = request.params;
        const index = clientes.findIndex(c => c.id === parseInt(id));
        if (index === -1) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        const clienteRemovido = clientes.splice(index, 1)[0];
        return { message: 'Cliente removido com sucesso', cliente: clienteRemovido };
    }
    catch (error) {
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao remover cliente' });
    }
}
export async function buscarClientes(request) {
    try {
        const { query, tipo } = request.query;
        let clientesFiltrados = clientes;
        if (query) {
            const queryLower = query.toLowerCase();
            clientesFiltrados = clientesFiltrados.filter(cliente => cliente.nome.toLowerCase().includes(queryLower) ||
                cliente.email?.toLowerCase().includes(queryLower) ||
                cliente.cpf_cnpj.includes(query) ||
                cliente.endereco.cidade.toLowerCase().includes(queryLower));
        }
        if (tipo) {
            clientesFiltrados = clientesFiltrados.filter(cliente => cliente.tipo_pessoa === tipo.toUpperCase());
        }
        return { clientes: clientesFiltrados, total: clientesFiltrados.length };
    }
    catch (error) {
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar clientes' });
    }
}
export async function getHistoricoPedidos(request) {
    try {
        const { id } = request.params;
        const cliente = clientes.find(c => c.id === parseInt(id));
        if (!cliente) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        // Mock de histórico de pedidos
        const historicoPedidos = [
            {
                id: 101,
                data: '2024-06-15',
                total: 1200.00,
                status: 'ENTREGUE',
                produtos: ['Sofá 3 Lugares']
            },
            {
                id: 102,
                data: '2024-05-20',
                total: 850.00,
                status: 'ENTREGUE',
                produtos: ['Mesa de Jantar']
            }
        ];
        return {
            cliente: cliente.nome,
            pedidos: historicoPedidos,
            totalPedidos: historicoPedidos.length,
            valorTotal: historicoPedidos.reduce((sum, pedido) => sum + pedido.total, 0)
        };
    }
    catch (error) {
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar histórico de pedidos' });
    }
}
export async function verificarLimiteCredito(request) {
    try {
        const { id } = request.params;
        const cliente = clientes.find(c => c.id === parseInt(id));
        if (!cliente) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        // Mock de pedidos em aberto
        const pedidosEmAberto = [
            { total: 800.00 },
            { total: 500.00 }
        ];
        const totalEmAberto = pedidosEmAberto.reduce((sum, pedido) => sum + pedido.total, 0);
        const limiteDisponivel = (cliente.limite_credito || 0) - totalEmAberto;
        return {
            cliente: cliente.nome,
            limite_credito: cliente.limite_credito || 0,
            total_em_aberto: totalEmAberto,
            limite_disponivel: limiteDisponivel,
            status: limiteDisponivel > 0 ? 'OK' : 'LIMITE EXCEDIDO',
            alerta: limiteDisponivel < (cliente.limite_credito || 0) * 0.2
                ? 'Atenção: Limite de crédito próximo do limite!'
                : null
        };
    }
    catch (error) {
        if (error instanceof TRPCError)
            throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao verificar limite de crédito' });
    }
}

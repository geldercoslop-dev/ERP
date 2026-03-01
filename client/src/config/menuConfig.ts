export type MenuItemChild = { label: string; href: string };

export type MenuItem = {
  label: string;
  href: string;
  iconName: string;
  roles: ("admin" | "vendedor")[];
  children?: MenuItemChild[];
};

export type MenuGroup = { group: string; items: MenuItem[] };

export const menuConfig: MenuGroup[] = [
  {
    group: "PAINEL",
    items: [
      { label: "Dashboard", href: "/", iconName: "home", roles: ["admin", "vendedor"] },
    ],
  },
  {
    group: "COMERCIAL",
    items: [
      { label: "Novo Pedido", href: "/nova-venda", iconName: "plus", roles: ["admin", "vendedor"] },
      {
        label: "Pedidos",
        href: "/vendas",
        iconName: "file-text",
        roles: ["admin", "vendedor"],
        children: [
          { label: "Todos / Lista", href: "/vendas" },
          { label: "Meus Pedidos", href: "/meus-pedidos" },
        ],
      },
      {
        label: "Clientes",
        href: "/clientes",
        iconName: "users",
        roles: ["admin", "vendedor"],
        children: [
          { label: "Lista de clientes", href: "/clientes" },
          { label: "Novo cliente", href: "/clientes?modo=cadastro" },
        ],
      },
      { label: "Promoções", href: "/promocoes", iconName: "tag", roles: ["admin", "vendedor"] },
    ],
  },
  {
    group: "OPERACIONAL",
    items: [
      {
        label: "Produtos",
        href: "/produtos",
        iconName: "package",
        roles: ["admin", "vendedor"],
        children: [
          { label: "Catálogo", href: "/produtos" },
          { label: "Estoque", href: "/estoque" },
        ],
      },
      { label: "Pendências de Compra", href: "/pendencias", iconName: "clipboard-list", roles: ["admin"] },
      { label: "Cerco de Cargas", href: "/cargas", iconName: "truck", roles: ["admin", "vendedor"] },
      { label: "Nota de Entrada", href: "/nota-entrada", iconName: "receipt", roles: ["admin"] },
    ],
  },
  {
    group: "LOGÍSTICA",
    items: [
      { label: "Entregas", href: "/entregas", iconName: "truck", roles: ["admin", "vendedor"] },
    ],
  },
  {
    group: "FINANCEIRO",
    items: [
      { label: "Minhas Comissões", href: "/comissao", iconName: "dollar-sign", roles: ["vendedor"] },
      { label: "Boletos", href: "/boletos", iconName: "credit-card", roles: ["admin", "vendedor"] },
      { label: "Financeiro", href: "/financeiro", iconName: "dollar-sign", roles: ["admin"] },
      { label: "Histórico de Caixa", href: "/financeiro/historico", iconName: "bar-chart-3", roles: ["admin"] },
      { label: "Contas a Receber", href: "/contas-receber", iconName: "credit-card", roles: ["admin"] },
      { label: "Contas a Pagar", href: "/contas-pagar", iconName: "credit-card", roles: ["admin"] },
      { label: "Contas Fixas", href: "/contas-fixas", iconName: "book-open", roles: ["admin"] },
      { label: "Plano de Contas", href: "/plano-contas", iconName: "book-open", roles: ["admin"] },
    ],
  },
  {
    group: "RELATÓRIOS",
    items: [
      { label: "Relatórios", href: "/relatorios", iconName: "bar-chart-3", roles: ["admin"] },
    ],
  },
  {
    group: "CADASTROS",
    items: [
      { label: "Cadastro geral", href: "/cadastros", iconName: "user-cog", roles: ["admin", "vendedor"] },
      { label: "Vendedores", href: "/vendedores", iconName: "users", roles: ["admin", "vendedor"] },
      { label: "Fornecedores", href: "/fornecedores", iconName: "building-2", roles: ["admin", "vendedor"] },
      { label: "Grupos de Precificação", href: "/grupos-precificacao", iconName: "clipboard-list", roles: ["admin", "vendedor"] },
      { label: "Cores", href: "/cores", iconName: "tag", roles: ["admin", "vendedor"] },
      { label: "Configurações do Banco", href: "/configuracoes-banco", iconName: "credit-card", roles: ["admin", "vendedor"] },
    ],
  },
];
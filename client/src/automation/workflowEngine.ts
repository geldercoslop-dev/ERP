import { eventBus, ERP_EVENTS } from "../utils/eventBus";
import { toast } from "sonner";

/**
 * WorkflowEngine: Motor de automação baseado em eventos.
 * Reage a mudanças no sistema para sugerir ações ou automatizar fluxos.
 */
export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  init() {
    if (this.isInitialized) return;
    this.setupListeners();
    this.isInitialized = true;
  }

  private setupListeners() {
    // 1. Quando pedido é criado -> Sugerir criação de carga ou impressão
    eventBus.on(ERP_EVENTS.PEDIDO_CRIADO, (pedido) => {
      toast.info("Novo Pedido Gerado", {
        description: `Deseja imprimir o pedido #${pedido?.numero}?`,
        action: {
          label: "Imprimir",
          onClick: () => eventBus.emit("action:imprimir_pedido", pedido?.id)
        },
      });
      
      // Lógica de sugestão de carga
      if (pedido?.total > 1000) {
        eventBus.emit("suggestion:new", {
          id: `carga-${pedido.id}`,
          title: "Sugerir Carga",
          message: `Pedido #${pedido.numero} de alto valor detectado. Adicionar à próxima rota?`,
          type: "operacional",
          actionLabel: "Ver Cargas",
          actionHref: "/cargas"
        });
      }
    });

    // 2. Quando estoque está baixo -> Sugerir reposição
    eventBus.on(ERP_EVENTS.ESTOQUE_BAIXO, (produtos) => {
      const count = Array.isArray(produtos) ? produtos.length : 1;
      eventBus.emit("suggestion:new", {
        id: "estoque-baixo-auto",
        title: "Reposição de Estoque",
        message: `${count} produtos atingiram o nível crítico. Gerar lista de compras?`,
        type: "estoque",
        actionLabel: "Ver Estoque",
        actionHref: "/estoque?filtro=baixo"
      });
    });

    // 3. Quando pagamento é recebido -> Notificar financeiro
    eventBus.on(ERP_EVENTS.PAGAMENTO_RECEBIDO, (pagamento) => {
      toast.success("Pagamento Confirmado", {
        description: `Recebimento de R$ ${pagamento?.valor?.toFixed(2)} registrado com sucesso.`
      });
    });

    // 4. Integração com Alertas do LEO
    eventBus.on(ERP_EVENTS.NOTIFICACAO_RECEBIDA, (notificacao) => {
      if (notificacao.type === "error") {
        toast.error(notificacao.title, { description: notificacao.description });
      }
    });
  }
}

export const workflowEngine = WorkflowEngine.getInstance();

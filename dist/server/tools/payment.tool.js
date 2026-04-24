/**
 * PAYMENT TOOL
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 *
 * Orquestra chamadas entre LEO e PaymentService
 * Inclui validação leve, enriquecimento e logging
 */
export class PaymentTool {
    service;
    constructor(service) {
        this.service = service;
    }
    /**
     * Create payment with enrichment and logging
     */
    async create(input) {
        console.log(`[PaymentTool] Creating payment:`, input);
        // Enrich with metadata
        const enriched = {
            ...input,
            createdAt: new Date().toISOString(),
            status: input.status || 'pending'
        };
        const result = await this.service.create(enriched);
        console.log(`[PaymentTool] Payment created:`, result);
        if (!result.success) {
            console.log(`[PaymentTool] Erro na criação de pagamento:`, {
                error: result.error,
                timestamp: new Date().toISOString()
            });
            return result;
        }
        return result;
    }
    /**
     * List payments with filtering and pagination
     */
    async list(input) {
        console.log(`[PaymentTool] Listing payments:`, input);
        // Normalize and validate input
        const normalized = {
            page: Math.max(1, input.page || 1),
            limit: Math.min(100, Math.max(1, input.limit || 50)),
            search: input.search,
            tipo: input.tipo,
            status: input.status,
            tenantId: input.tenantId
        };
        const result = await this.service.list(normalized);
        console.log(`[PaymentTool] Listed ${Array.isArray(result) ? result.length : 0} payments`);
        return result;
    }
    /**
     * Update payment with validation
     */
    async update(input) {
        console.log(`[PaymentTool] Updating payment:`, input);
        // Enrich with update metadata
        const enriched = {
            ...input,
            updatedAt: new Date().toISOString()
        };
        const result = await this.service.update(enriched);
        console.log(`[PaymentTool] Payment updated:`, result);
        return result;
    }
}

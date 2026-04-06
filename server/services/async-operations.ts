/**
 * Serviço de Operações Assíncronas - Async Operations Service
 * 
 * Facilita o envio de operações pesadas para as filas BullMQ
 * OCR, screenshots, análises do LEO, relatórios, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import { queueManager } from '../queue/queue.js';
import { QUEUE_NAMES, JobData } from '../queue/queue.js';
import { Job } from 'bullmq';
import { logInfo, logError } from '../_core/logger.js';

export interface AsyncOperation {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

export interface OcrRequest {
  imagePath: string;
  options?: {
    language?: string;
    oem?: number;
    psm?: number;
    whitelist?: string;
  };
}

export interface ScreenshotRequest {
  options?: {
    format?: 'png' | 'jpg';
    quality?: number;
    filename?: string;
    folder?: string;
  };
  area?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LeoAnalysisRequest {
  analysisType: string;
  context: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface ReportGenerationRequest {
  reportType: string;
  filters?: Record<string, unknown>;
  format?: 'pdf' | 'excel' | 'csv';
}

export interface NotificationRequest {
  notificationType: string;
  recipients: string[];
  message: string;
  channels?: string[];
}

/**
 * Serviço para operações assíncronas
 */
class AsyncOperationsService {
  private static instance: AsyncOperationsService;
  private operations: Map<string, AsyncOperation> = new Map();

  private constructor() {}

  public static getInstance(): AsyncOperationsService {
    if (!AsyncOperationsService.instance) {
      AsyncOperationsService.instance = new AsyncOperationsService();
    }
    return AsyncOperationsService.instance;
  }

  /**
   * Envia operação OCR para fila
   */
  public async processOcr(
    request: OcrRequest,
    userId?: string,
    priority: number = 0
  ): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
    const operationId = uuidv4();
    const jobId = uuidv4();

    try {
      logInfo('Enviando operação OCR para fila', {
        operationId,
        jobId,
        imagePath: request.imagePath,
        userId,
      });

      // Registrar operação
      this.operations.set(operationId, {
        id: operationId,
        type: 'ocr',
        status: 'pending',
        createdAt: new Date(),
      });

      // Preparar dados do job
      const jobData: JobData = {
        type: 'ocr_process',
        payload: {
          ...request,
          operationId,
        },
        userId,
        traceId: operationId,
        priority,
      };

      // Adicionar à fila
      const job = await queueManager.addJob(
        QUEUE_NAMES.OCR,
        `ocr_${jobId}`,
        jobData,
        { priority }
      );

      if (!job) {
        return { success: false, error: 'Falha ao criar job na fila', jobId: '', operationId };
      }

      logInfo('Operação OCR enviada para fila', {
        operationId,
        jobId: job.id,
        queueJobId: job.id,
      });

      return {
        success: true,
        jobId: job.id || '',
        operationId,
      };

    } catch (error) {
      logError('Falha ao enviar operação OCR para fila', error as Error);

      // Atualizar status para falha
      const operation = this.operations.get(operationId);
      if (operation) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Erro desconhecido';
        operation.completedAt = new Date();
      }

      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido', jobId: '', operationId };
    }
  }

  /**
   * Envia operação de screenshot para fila
   */
  public async captureScreenshot(
    request: ScreenshotRequest,
    userId?: string,
    priority: number = 0
  ): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
    const operationId = uuidv4();
    const jobId = uuidv4();

    try {
      logInfo('Enviando operação de screenshot para fila', {
        operationId,
        jobId,
        hasArea: !!request.area,
        userId,
      });

      // Registrar operação
      this.operations.set(operationId, {
        id: operationId,
        type: 'screenshot',
        status: 'pending',
        createdAt: new Date(),
      });

      // Preparar dados do job
      const jobData: JobData = {
        type: 'screenshot_capture',
        payload: {
          ...request,
          operationId,
        },
        userId,
        traceId: operationId,
        priority,
      };

      // Adicionar à fila
      const job = await queueManager.addJob(
        QUEUE_NAMES.SCREENSHOT,
        `screenshot_${jobId}`,
        jobData,
        { priority }
      );

      if (!job) {
        return { success: false, error: 'Falha ao criar job na fila', jobId: '', operationId };
      }

      logInfo('Operação de screenshot enviada para fila', {
        operationId,
        jobId: job.id,
      });

      return {
        success: true,
        jobId: job.id || '',
        operationId,
      };

    } catch (error) {
      logError('Falha ao enviar operação de screenshot para fila', error as Error);

      // Atualizar status para falha
      const operation = this.operations.get(operationId);
      if (operation) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Erro desconhecido';
        operation.completedAt = new Date();
      }

      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido', jobId: '', operationId };
    }
  }

  /**
   * Envia análise do LEO para fila
   */
  public async processLeoAnalysis(
    request: LeoAnalysisRequest,
    userId?: string,
    priority: number = 0
  ): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
    const operationId = uuidv4();
    const jobId = uuidv4();

    try {
      logInfo('Enviando análise do LEO para fila', {
        operationId,
        jobId,
        analysisType: request.analysisType,
        userId,
      });

      // Registrar operação
      this.operations.set(operationId, {
        id: operationId,
        type: 'leo_analysis',
        status: 'pending',
        createdAt: new Date(),
      });

      // Preparar dados do job
      const jobData: JobData = {
        type: 'leo_analysis',
        payload: {
          ...request,
          operationId,
        },
        userId,
        traceId: operationId,
        priority,
      };

      // Adicionar à fila
      const job = await queueManager.addJob(
        QUEUE_NAMES.LEO_ANALYSIS,
        `leo_analysis_${jobId}`,
        jobData,
        { priority }
      );

      if (job === null || job === undefined) {
        return { success: false, error: 'Falha ao criar job na fila', jobId: '', operationId };
      }

      logInfo('Análise do LEO enviada para fila', {
        operationId,
        jobId: job.id,
      });

      return {
        success: true,
        jobId: job.id || '',
        operationId,
      };

    } catch (error) {
      logError('Falha ao enviar análise do LEO para fila', error as Error);

      // Atualizar status para falha
      const operation = this.operations.get(operationId);
      if (operation) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Erro desconhecido';
        operation.completedAt = new Date();
      }

      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido', jobId: '', operationId };
    }
  }

  /**
   * Envia geração de relatório para fila
   */
  public async generateReport(
    request: ReportGenerationRequest,
    userId?: string,
    priority: number = 0
  ): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
    const operationId = uuidv4();
    const jobId = uuidv4();

    try {
      logInfo('Enviando geração de relatório para fila', {
        operationId,
        jobId,
        reportType: request.reportType,
        format: request.format,
        userId,
      });

      // Registrar operação
      this.operations.set(operationId, {
        id: operationId,
        type: 'report_generation',
        status: 'pending',
        createdAt: new Date(),
      });

      // Preparar dados do job
      const jobData: JobData = {
        type: 'report_generation',
        payload: {
          ...request,
          operationId,
        },
        userId,
        traceId: operationId,
        priority,
      };

      // Adicionar à fila
      const job = await queueManager.addJob(
        QUEUE_NAMES.REPORT_GENERATION,
        `report_${jobId}`,
        jobData,
        { priority }
      );

      if (job === null || job === undefined) {
        return { success: false, error: 'Falha ao criar job na fila', jobId: '', operationId };
      }

      logInfo('Geração de relatório enviada para fila', {
        operationId,
        jobId: job.id,
      });

      return {
        success: true,
        jobId: job.id || '',
        operationId,
      };

    } catch (error) {
      logError('Falha ao enviar geração de relatório para fila', error as Error);

      // Atualizar status para falha
      const operation = this.operations.get(operationId);
      if (operation) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Erro desconhecido';
        operation.completedAt = new Date();
      }

      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido', jobId: '', operationId };
    }
  }

  /**
   * Envia notificação para fila
   */
  public async sendNotification(
    request: NotificationRequest,
    userId?: string,
    priority: number = 0
  ): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
    const operationId = uuidv4();
    const jobId = uuidv4();

    try {
      logInfo('Enviando notificação para fila', {
        operationId,
        jobId,
        notificationType: request.notificationType,
        recipientsCount: request.recipients.length,
        userId,
      });

      // Registrar operação
      this.operations.set(operationId, {
        id: operationId,
        type: 'notification',
        status: 'pending',
        createdAt: new Date(),
      });

      // Preparar dados do job
      const jobData: JobData = {
        type: 'notification_send',
        payload: {
          ...request,
          operationId,
        },
        userId,
        traceId: operationId,
        priority,
      };

      // Adicionar à fila
      const job = await queueManager.addJob(
        QUEUE_NAMES.NOTIFICATIONS,
        `notification_${jobId}`,
        jobData,
        { priority }
      );

      if (job === null || job === undefined) {
        return { success: false, error: 'Falha ao criar job na fila', jobId: '', operationId };
      }

      logInfo('Notificação enviada para fila', {
        operationId,
        jobId: job.id,
      });

      return {
        success: true,
        jobId: job.id || '',
        operationId,
      };

    } catch (error) {
      logError('Falha ao enviar notificação para fila', error as Error);

      // Atualizar status para falha
      const operation = this.operations.get(operationId);
      if (operation) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Erro desconhecido';
        operation.completedAt = new Date();
      }

      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido', jobId: '', operationId };
    }
  }

  /**
   * Obtém status de uma operação
   */
  public getOperationStatus(operationId: string): AsyncOperation | null {
    return this.operations.get(operationId) || null;
  }

  /**
   * Lista todas as operações
   */
  public listOperations(): AsyncOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Limpa operações antigas (manter apenas últimas 24 horas)
   */
  public cleanupOperations(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [id, operation] of Array.from(this.operations)) {
      if (operation.createdAt.getTime() < oneDayAgo) {
        this.operations.delete(id);
      }
    }
  }

  /**
   * Atualiza status de operação (chamado pelos workers)
   */
  public updateOperationStatus(
    operationId: string,
    status: 'processing' | 'completed' | 'failed',
    result?: unknown,
    error?: string
  ): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = status;
      if (status === 'completed' || status === 'failed') {
        operation.completedAt = new Date();
      }
      if (result) operation.result = result;
      if (error) operation.error = error;
    }
  }
}

// Exportar instância singleton
export const asyncOperations = AsyncOperationsService.getInstance();

// Exportar funções de utilidade
export async function processOcrAsync(
  request: OcrRequest,
  userId?: string,
  priority?: number
): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
  return asyncOperations.processOcr(request, userId, priority);
}

export async function captureScreenshotAsync(
  request: ScreenshotRequest,
  userId?: string,
  priority?: number
): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
  return asyncOperations.captureScreenshot(request, userId, priority);
}

export async function processLeoAnalysisAsync(
  request: LeoAnalysisRequest,
  userId?: string,
  priority?: number
): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
  return asyncOperations.processLeoAnalysis(request, userId, priority);
}

export async function generateReportAsync(
  request: ReportGenerationRequest,
  userId?: string,
  priority?: number
): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
  return asyncOperations.generateReport(request, userId, priority);
}

export async function sendNotificationAsync(
  request: NotificationRequest,
  userId?: string,
  priority?: number
): Promise<{ success: boolean; jobId?: string; operationId?: string; error?: string }> {
  return asyncOperations.sendNotification(request, userId, priority);
}

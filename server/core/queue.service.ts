import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { assertTenantId } from '../_core/errors/assertions.js';
import { logger } from "../_core/logger.js";
import { queueConfig } from '../infra/queue/queue.config.js';

let _redis: any = null;

function getQueueRedis(): any {
  if (!_redis) {
    _redis = queueConfig.getConnection();
  }
  return _redis;
}

type TenantPayload = {
  tenantId: number;
  traceId: string;
} & Record<string, unknown>;

type JobHandler = (payload: TenantPayload) => Promise<void>;

const QUEUE_PREFIX = "tenant-queue";


const queueRegistry = new Map<string, Queue<TenantPayload>>();
const workerRegistry = new Map<string, Worker<TenantPayload>>();

function assertTraceId(traceId: string): void {
  if (!traceId || traceId.trim().length === 0) {
    throw new InfrastructureError("TRACE_ID_REQUIRED");
  }
}

function getQueueName(jobName: string): string {
  return `${QUEUE_PREFIX}:${jobName}`;
}

function getOrCreateQueue(jobName: string): Queue<TenantPayload> {
  const queueName = getQueueName(jobName);
  const existing = queueRegistry.get(queueName);
  if (existing) return existing;

  const queue = new Queue<TenantPayload>(queueName, { connection: getQueueRedis() });
  queueRegistry.set(queueName, queue);
  return queue;
}

export async function enqueue(
  jobName: string,
  payload: TenantPayload,
  options?: JobsOptions
): Promise<Job<TenantPayload>> {
  assertTenantId(payload.tenantId);
  assertTraceId(payload.traceId);

  const queue = getOrCreateQueue(jobName);
  const job = await queue.add(jobName, payload, options);

  logger.info(
    { traceId: payload.traceId, tenantId: payload.tenantId, action: "QUEUE_ENQUEUE", jobName, jobId: job.id },
    "queue_job_enqueued"
  );

  return job;
}

export function process(
  jobName: string,
  handler: JobHandler
): Worker<TenantPayload> {
  const queueName = getQueueName(jobName);

  const existing = workerRegistry.get(queueName);
  if (existing) {
    return existing;
  }

  const worker = new Worker<TenantPayload>(
    queueName,
    async (job) => {
      assertTenantId(job.data.tenantId);
      assertTraceId(job.data.traceId);

      logger.info(
        { traceId: job.data.traceId, tenantId: job.data.tenantId, action: "QUEUE_PROCESS", jobName, jobId: job.id },
        "queue_job_processing"
      );

      await handler(job.data);
    },
    { connection: getQueueRedis() }
  );

  workerRegistry.set(queueName, worker);
  return worker;
}

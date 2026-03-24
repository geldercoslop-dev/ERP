/**
 * Declarações globais para módulos sem tipos
 * Evita uso de 'any' e mantém tipagem segura
 */


declare module "screenshot-desktop" {
  export function listDisplays(): Promise<Array<{ id: number; name: string }>>;
  export function screenshot(options?: { screenId?: number; format?: string }): Promise<Buffer>;
  export function screenshotSync(options?: { screenId?: number; format?: string }): Buffer;
}

declare module "tesseract.js" {
  export interface TesseractResult {
    data: {
      text: string;
      confidence: number;
      words: Array<{
        text: string;
        confidence: number;
        bbox: {
          x0: number;
          y0: number;
          x1: number;
          y1: number;
        };
      }>;
    };
  }

  export function recognize(image: Buffer | string, options?: {
    lang?: string;
    oem?: number;
    psm?: number;
  }): Promise<TesseractResult>;

  export function createWorker(options?: {
    lang?: string;
    oem?: number;
    psm?: number;
    logger?: (message: any) => void;
  }): Promise<{
    recognize: (image: Buffer | string) => Promise<TesseractResult>;
    terminate: () => Promise<void>;
  }>;
}

declare module "sharp" {
  export interface Sharp {
    resize(width: number, height?: number): Sharp;
    jpeg(options?: { quality?: number }): Sharp;
    png(options?: { compressionLevel?: number }): Sharp;
    webp(options?: { quality?: number }): Sharp;
    toBuffer(): Promise<Buffer>;
    toFile(path: string): Promise<{ info: any }>;
    metadata(): Promise<{ width: number; height: number; format: string }>;
  }

  export default function sharp(input: Buffer | string): Sharp;
}

declare module "pdf-parse" {
  export function parse(dataBuffer: Buffer): Promise<{
    text: string;
    info: any;
    metadata: any;
    numpages: number;
  }>;
}

declare module "canvas" {
  export interface Canvas {
    width: number;
    height: number;
    getContext(type: '2d'): CanvasRenderingContext2D;
    toBuffer(): Buffer;
    toDataURL(): string;
  }

  export interface CanvasRenderingContext2D {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    font: string;
    fillRect(x: number, y: number, width: number, height: number): void;
    strokeRect(x: number, y: number, width: number, height: number): void;
    fillText(text: string, x: number, y: number): void;
    measureText(text: string): { width: number };
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
    closePath(): void;
    stroke(): void;
    fill(): void;
  }

  export function createCanvas(width: number, height: number): Canvas;
}

declare module "node-cron" {
  export function schedule(cronExpression: string, task: () => void): {
    start(): void;
    stop(): void;
    destroy(): void;
  };
}

declare module "bull" {
  export interface Job<Data = unknown> {
    id: string;
    name?: string;
    data: Data;
    opts: {
      delay?: number;
      priority?: number;
    };
    progress(data: unknown): void;
    completed(result?: unknown): Promise<void> | void;
    failed(err: Error): Promise<void> | void;
    remove(): Promise<void>;
  }

  export interface Queue<Data = unknown> {
    add(
      name: string,
      data: Data,
      opts?: {
        delay?: number;
        priority?: number;
      }
    ): Promise<Job<Data>>;

    process(
      name: string,
      processor: (job: Job<Data>) => Promise<void>
    ): void;

    getJob(jobId: string): Promise<Job<Data> | null>;
    getJobs(
      types?: string[],
      start?: number,
      end?: number
    ): Promise<Job<Data>[]>;

    clean(grace: number, status?: string): Promise<string[]>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    close(): Promise<void>;
    drain?(): Promise<void>;
  }

  export function Queue<Data = unknown>(
    name: string,
    redisUrl?: string
  ): Queue<Data>;
}

declare module "bullmq" {
  export interface Job<
    Data = unknown,
    Result = unknown,
    Name extends string = string
  > {
    id: string;
    name: Name;
    data: Data;
    returnvalue?: Result;
    attemptsMade: number;
    opts: {
      delay?: number;
      priority?: number;
      removeOnComplete?: number | boolean;
      removeOnFail?: number | boolean;
    };
  }

  export class Queue<
    Data = unknown,
    Result = unknown,
    Name extends string = string
  > {
    constructor(
      name: string,
      options?: {
        connection?: unknown;
        defaultJobOptions?: {
          attempts?: number;
          backoff?: { type?: string; delay?: number };
          removeOnComplete?: number;
          removeOnFail?: number;
          delay?: number;
        };
        settings?: unknown;
      }
    );
    add(
      name: Name,
      data: Data,
      opts?: {
        delay?: number;
        priority?: number;
        removeOnComplete?: number;
        removeOnFail?: number;
      }
    ): Promise<Job<Data, Result, Name>>;

    getJob(jobId: string): Promise<Job<Data, Result, Name> | null>;
    getJobs(
      types?: string[],
      start?: number,
      end?: number
    ): Promise<Job<Data, Result, Name>[]>;

    pause(): Promise<void>;
    resume(): Promise<void>;
    close(): Promise<void>;

    clean?(grace: number, status?: string): Promise<string[]>;

    getWaitingCount?(): Promise<number>;
    getActiveCount?(): Promise<number>;
    getCompletedCount?(): Promise<number>;
    getFailedCount?(): Promise<number>;
    getDelayedCount?(): Promise<number>;
    isPaused?(): Promise<boolean>;

    drain?(): Promise<void>;

    on?(event: string, handler: (arg: unknown) => void): void;
  }

  export type JobType = string;

  export class Worker<
    Data = unknown,
    Result = unknown,
    Name extends string = string
  > {
    constructor(
      queueName: string,
      processor: (job: Job<Data, Result, Name>) => Promise<Result>,
      options?: {
        connection?: unknown;
        concurrency?: number;
        maxStalledCount?: number;
        stalledInterval?: number;
      }
    );

    on(
      event: "ready",
      handler: () => void
    ): void;

    on(
      event: "error",
      handler: (error: Error) => void
    ): void;

    on(
      event: "completed",
      handler: (job: Job<Data, Result, Name>) => void
    ): void;

    on(
      event: "failed",
      handler: (job: Job<Data, Result, Name>, error: Error) => void
    ): void;

    on(
      event: "stalled",
      handler: (job: Job<Data, Result, Name>) => void
    ): void;

    on(
      event: string,
      handler: (arg: unknown) => void
    ): void;

    isRunning(): boolean;
    close(): Promise<void>;
    closing?: boolean;
  }
}

declare module "ioredis" {
  export class Redis {
    constructor(options?: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      maxRetriesPerRequest?: number | null;
      retryStrategy?: (times: number) => number;
    });

    // String operations
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    
    // Hash operations
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<number>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    
    // List operations
    lpush(key: string, ...values: string[]): Promise<number>;
    rpush(key: string, ...values: string[]): Promise<number>;
    lpop(key: string): Promise<string | null>;
    rpop(key: string): Promise<string | null>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    
    // Set operations
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    
    // Sorted set operations
    zadd(key: string, ...args: (string | number)[]): Promise<number>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    
    // Server operations
    flushdb(): Promise<string>;
    ping(): Promise<string>;
    quit(): Promise<void>;
    
    // Event handling
    on(event: string, handler: (err: Error) => void): void;
    on(event: string, handler: () => void): void;
  }
}

declare module "nodemailer" {
  export interface Transporter {
    sendMail(mailOptions: MailOptions): Promise<{ messageId: string }>;
    verify(): Promise<boolean>;
  }

  export interface MailOptions {
    from: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
    }>;
  }

  export function createTransport(config: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  }): Transporter;
}

declare module "qrcode" {
  export function toDataURL(text: string, options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }): string;

  export function toBuffer(text: string, options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }): Promise<Buffer>;
}

declare module "bcryptjs" {
  export function hash(password: string, saltRounds: number): Promise<string>;
  export function compare(password: string, hash: string): Promise<boolean>;
  export function genSalt(saltRounds: number): Promise<string>;
}

declare module "jsonwebtoken" {
  export function sign(
    payload: object,
    secret: string,
    options?: { expiresIn?: string; algorithm?: string; issuer?: string; audience?: string }
  ): string;
  export function verify(
    token: string,
    secret: string,
    options?: { algorithms?: string[]; issuer?: string; audience?: string }
  ): object;
  export function decode(token: string, options?: { complete?: boolean }): object | null;
}

declare module "multer" {
  export interface Multer {
    single(fieldName: string): (req: any, res: any, next: any) => void;
    array(fieldName: string, maxCount?: number): (req: any, res: any, next: any) => void;
    fields(fields: { name: string; maxCount?: number }[]): (req: any, res: any, next: any) => void;
  }

  export function Multer(options?: {
    dest?: string;
    storage?: any;
    fileFilter?: (req: any, file: any, callback: (error: Error | null, acceptFile: boolean) => void) => void;
    limits?: {
      fileSize?: number;
      files?: number;
    };
  }): Multer;
}

declare module "csv-parser" {
  export function csv(options?: {
    separator?: string;
    headers?: boolean | string[];
  }): NodeJS.ReadableStream;
}

declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }

  export interface WorkSheet {
    [key: string]: any;
  }

  export function read(data: Buffer, options?: { type?: string }): WorkBook;
  export function write(workbook: WorkBook, options?: { bookType?: string; type?: string }): Buffer;
  export const utils: {
    sheet_to_json(sheet: WorkSheet): object[];
    json_to_sheet(data: object[]): WorkSheet;
  };
}

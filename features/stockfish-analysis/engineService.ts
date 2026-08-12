import { detectEngineCapability, type EngineCapability, type EngineCapabilityProbe } from '../../lib/engine/capabilities';
import type { EvaluationLimit, EvaluationResult } from '../../lib/engine/stockfishAdapter';
import { selectEngineResources, type EngineResources } from '../../lib/engine/resourcePolicy';
import { EngineScheduler } from '../../lib/engine/scheduler/engineScheduler';
import type { EngineJobPriority, ScheduledEngineAdapter } from '../../lib/engine/scheduler/types';
import { ENGINE_WORKER_PROTOCOL_VERSION, type EngineWorkerRequest, type EngineWorkerResponse } from '../../workers/stockfish.protocol';

export interface EngineEvaluationRequest {
  fen: string;
  limit: EvaluationLimit;
  multiPv: number;
}

export interface SubmitEngineEvaluation extends EngineEvaluationRequest {
  id: string;
  priority: EngineJobPriority;
  relevanceToken: string;
  deadlineAt: number;
  signal?: AbortSignal;
  parentSignal?: AbortSignal;
}

export interface WorkerLike {
  postMessage(message: EngineWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error', listener: EventListener): void;
  removeEventListener(type: 'message' | 'error', listener: EventListener): void;
}

export interface EngineServiceOptions {
  createWorker?: () => WorkerLike;
  capabilityProbe?: Partial<EngineCapabilityProbe>;
}

/** Browser-only façade: one worker-backed adapter and one global scheduler per service. */
export class EngineService {
  private readonly resources: EngineResources;
  private readonly createWorker: () => WorkerLike;
  private adapter: WorkerEngineAdapter | undefined;
  private scheduler: EngineScheduler<EngineEvaluationRequest, EvaluationResult> | undefined;
  private capability: EngineCapability | undefined;

  constructor(private readonly options: EngineServiceOptions = {}) {
    this.resources = selectEngineResources(options.capabilityProbe ?? {});
    this.createWorker = options.createWorker ?? (() => new Worker(new URL('../../workers/stockfish.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
  }

  async initialize(): Promise<EngineCapability> {
    if (this.capability) return this.capability;
    const probe = browserProbe(this.options.capabilityProbe);
    const tryMode = async (mode: 'threaded' | 'single-thread'): Promise<boolean> => {
      const candidate = new WorkerEngineAdapter(this.createWorker(), mode, mode === 'threaded' ? this.resources : { ...this.resources, threads: 1 });
      try {
        await candidate.initialize();
        this.adapter = candidate;
        return true;
      } catch {
        candidate.dispose();
        return false;
      }
    };
    let threadedInitialized = false;
    if (probe.crossOriginIsolated && probe.sharedArrayBuffer && probe.simd) threadedInitialized = await tryMode('threaded');
    const singleThreadInitialized = threadedInitialized ? false : await tryMode('single-thread');
    this.capability = detectEngineCapability({ ...probe, threadedInitialized, singleThreadInitialized });
    if (this.adapter && this.capability.mode !== 'unavailable') {
      this.scheduler = new EngineScheduler(this.adapter, {
        createAdapter: () => this.recreateAdapter(),
      });
    }
    return this.capability;
  }

  evaluate(request: SubmitEngineEvaluation): Promise<EvaluationResult> {
    if (!this.scheduler) return Promise.reject(new Error('EngineService has not initialized an engine.'));
    return this.scheduler.schedule({
      id: request.id,
      priority: request.priority,
      relevanceToken: request.relevanceToken,
      createdAt: Date.now(),
      deadlineAt: request.deadlineAt,
      payload: { fen: request.fen, limit: request.limit, multiPv: request.multiPv },
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.parentSignal ? { parentSignal: request.parentSignal } : {}),
    });
  }

  setDocumentHidden(hidden: boolean): void { this.scheduler?.setDocumentHidden(hidden); }
  notifyUserActivity(): void { this.scheduler?.notifyUserActivity(); }
  dispose(): void { this.scheduler?.dispose(); this.scheduler = undefined; this.adapter = undefined; this.capability = undefined; }

  private recreateAdapter(): WorkerEngineAdapter {
    const mode = this.capability?.mode === 'threaded' ? 'threaded' : 'single-thread';
    const adapter = new WorkerEngineAdapter(this.createWorker(), mode, mode === 'threaded' ? this.resources : { ...this.resources, threads: 1 });
    this.adapter = adapter;
    return adapter;
  }
}

class WorkerEngineAdapter implements ScheduledEngineAdapter<EngineEvaluationRequest, EvaluationResult> {
  private readonly pending = new Map<string, { resolve: (result: EvaluationResult) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private readonly onMessage: EventListener;
  private readonly onError: EventListener;

  constructor(private readonly worker: WorkerLike, private readonly mode: 'threaded' | 'single-thread', private readonly resources: EngineResources) {
    this.onMessage = (event) => this.receive((event as MessageEvent<unknown>).data);
    this.onError = () => this.rejectAll(new Error('Stockfish worker crashed.'));
    worker.addEventListener('message', this.onMessage);
    worker.addEventListener('error', this.onError);
  }
  initialize(): Promise<void> { return this.request({ type: 'INITIALIZE', mode: this.mode, resources: this.resources }).then(() => undefined); }
  evaluate(value: EngineEvaluationRequest, signal?: AbortSignal): Promise<EvaluationResult> {
    const promise = this.request({ type: 'EVALUATE', ...value });
    if (signal) signal.addEventListener('abort', () => this.stop(), { once: true });
    return promise as Promise<EvaluationResult>;
  }
  stop(): void { void this.request({ type: 'STOP' }).catch(() => undefined); }
  dispose(): void { this.rejectAll(new Error('Stockfish worker disposed.')); this.worker.removeEventListener('message', this.onMessage); this.worker.removeEventListener('error', this.onError); this.worker.terminate(); }

  private request(request: { type: 'INITIALIZE'; mode: 'threaded' | 'single-thread'; resources: EngineResources } | { type: 'EVALUATE'; fen: string; limit: EvaluationLimit; multiPv: number } | { type: 'STOP' }): Promise<EvaluationResult | void> {
    const jobId = `engine-${this.sequence++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve: resolve as (value: EvaluationResult) => void, reject });
      this.worker.postMessage({ ...request, protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION, jobId } as EngineWorkerRequest);
    });
  }
  private receive(value: unknown): void {
    const response = value as Partial<EngineWorkerResponse>;
    if (response.protocolVersion !== ENGINE_WORKER_PROTOCOL_VERSION || typeof response.jobId !== 'string') return;
    const pending = this.pending.get(response.jobId);
    if (!pending) return;
    if (response.type === 'READY' || response.type === 'STOPPED') { this.pending.delete(response.jobId); pending.resolve(undefined as unknown as EvaluationResult); }
    else if (response.type === 'RESULT' && response.result) { this.pending.delete(response.jobId); pending.resolve(response.result); }
    else if (response.type === 'FAILED') { this.pending.delete(response.jobId); pending.reject(new Error(response.message ?? 'Stockfish worker failed.')); }
  }
  private rejectAll(error: Error): void { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
}

function browserProbe(overrides: Partial<EngineCapabilityProbe> | undefined): Omit<EngineCapabilityProbe, 'threadedInitialized' | 'singleThreadInitialized'> {
  const browser = typeof window === 'undefined' ? undefined : window;
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const result: Omit<EngineCapabilityProbe, 'threadedInitialized' | 'singleThreadInitialized'> = {
    crossOriginIsolated: overrides?.crossOriginIsolated ?? browser?.crossOriginIsolated === true,
    sharedArrayBuffer: overrides?.sharedArrayBuffer ?? typeof SharedArrayBuffer !== 'undefined',
    simd: overrides?.simd ?? typeof WebAssembly !== 'undefined',
  };
  const hardwareConcurrency = overrides?.hardwareConcurrency ?? nav?.hardwareConcurrency;
  if (hardwareConcurrency !== undefined) result.hardwareConcurrency = hardwareConcurrency;
  if (overrides?.deviceMemoryGb !== undefined) result.deviceMemoryGb = overrides.deviceMemoryGb;
  if (overrides?.mobile !== undefined) result.mobile = overrides.mobile;
  return result;
}

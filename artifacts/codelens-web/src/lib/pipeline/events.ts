import { EventEmitter } from "events";

export type PipelineEventType =
  | "stage_start"
  | "stage_complete"
  | "abstraction_identified"
  | "chapter_start"
  | "chapter_complete"
  | "chapter_failed"
  | "error"
  | "completed"
  | "failed";

export interface PipelineEvent {
  type: PipelineEventType;
  stage: string;
  message: string;
  progress: { current: number; total: number };
  data?: unknown;
}

export class PipelineEmitter extends EventEmitter {
  lastActivity: number = Date.now();

  emitEvent(payload: PipelineEvent): boolean {
    this.lastActivity = Date.now();
    return super.emit("pipeline_event", payload);
  }

  onEvent(listener: (payload: PipelineEvent) => void): this {
    return super.on("pipeline_event", listener);
  }

  offEvent(listener: (payload: PipelineEvent) => void): this {
    return super.off("pipeline_event", listener);
  }

  emitStageStart(stage: string, message: string, current: number, total: number) {
    this.emitEvent({
      type: "stage_start",
      stage,
      message,
      progress: { current, total },
    });
  }

  emitStageComplete(stage: string, message: string, current: number, total: number, data?: unknown) {
    this.emitEvent({
      type: "stage_complete",
      stage,
      message,
      progress: { current, total },
      data,
    });
  }

  emitAbstractionIdentified(name: string, current: number, total: number) {
    this.emitEvent({
      type: "abstraction_identified",
      stage: "identify_abstractions",
      message: `Identified: ${name}`,
      progress: { current, total },
    });
  }

  emitChapterStart(index: number, title: string, total: number) {
    this.emitEvent({
      type: "chapter_start",
      stage: "write_chapters",
      message: `Writing chapter ${index + 1}: ${title}`,
      progress: { current: index, total },
    });
  }

  emitChapterComplete(index: number, title: string, total: number) {
    this.emitEvent({
      type: "chapter_complete",
      stage: "write_chapters",
      message: `Completed chapter ${index + 1}: ${title}`,
      progress: { current: index + 1, total },
    });
  }

  emitChapterFailed(index: number, title: string, total: number, error: string) {
    this.emitEvent({
      type: "chapter_failed",
      stage: "write_chapters",
      message: `Failed chapter ${index + 1}: ${title} — ${error}`,
      progress: { current: index, total },
    });
  }

  emitCompleted(message: string) {
    this.emitEvent({
      type: "completed",
      stage: "assembly",
      message,
      progress: { current: 1, total: 1 },
    });
  }

  emitFailed(stage: string, error: string) {
    this.emitEvent({
      type: "failed",
      stage,
      message: error,
      progress: { current: 0, total: 1 },
    });
  }
}

const activeEmitters = new Map<string, PipelineEmitter>();

const STALE_EMITTER_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let sweepStarted = false;

function startSweep() {
  if (sweepStarted) return;
  sweepStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [courseId, emitter] of activeEmitters) {
      if (
        now - emitter.lastActivity > STALE_EMITTER_TTL_MS &&
        emitter.listenerCount("pipeline_event") === 0
      ) {
        emitter.removeAllListeners();
        activeEmitters.delete(courseId);
      }
    }
  }, SWEEP_INTERVAL_MS).unref();
}

export function getOrCreateEmitter(courseId: string): PipelineEmitter {
  startSweep();
  let emitter = activeEmitters.get(courseId);
  if (!emitter) {
    emitter = new PipelineEmitter();
    activeEmitters.set(courseId, emitter);
  }
  return emitter;
}

export function removeEmitter(courseId: string) {
  const emitter = activeEmitters.get(courseId);
  if (emitter) {
    emitter.removeAllListeners();
    activeEmitters.delete(courseId);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getOrCreateEmitter } from "@/lib/pipeline/events";
import type { PipelineEvent } from "@/lib/pipeline/events";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapStage(stage: string): string {
  switch (stage) {
    case "extraction":
      return "extracting";
    case "identify_abstractions":
    case "analyze_relationships":
      return "analyzing";
    case "order_chapters":
      return "designing";
    case "write_chapters":
      return "generating";
    case "assembly":
      return "completed";
    default:
      return stage;
  }
}

function percentFromProgress(current: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function toStatusPayload(event: PipelineEvent) {
  const status =
    event.type === "failed"
      ? "failed"
      : event.type === "completed"
        ? "completed"
        : "generating";
  return {
    status,
    progress: {
      stage: status === "completed" ? "completed" : mapStage(event.stage),
      detail: event.message,
      percent:
        status === "completed"
          ? 100
          : percentFromProgress(event.progress.current, event.progress.total),
    },
    errorMessage: status === "failed" ? event.message : undefined,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Invalid course ID", { status: 400 });
  }

  const [course] = await db
    .select({
      status: courses.status,
      progress: courses.progress,
      errorMessage: courses.errorMessage,
      createdBy: courses.createdBy,
    })
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
    .limit(1);

  if (!course) {
    return new Response("Course not found", { status: 404 });
  }

  if (course.createdBy !== user.id) {
    return new Response("Not authorized", { status: 403 });
  }

  if (course.status === "completed" || course.status === "failed") {
    const body = JSON.stringify({
      status: course.status,
      progress: course.progress || {
        stage: course.status === "completed" ? "completed" : "failed",
        detail:
          course.status === "completed"
            ? "Course generation complete"
            : course.errorMessage || "Generation failed",
        percent: course.status === "completed" ? 100 : 0,
      },
      errorMessage:
        course.status === "failed" ? course.errorMessage : undefined,
    });
    return new Response(`data: ${body}\n\n`, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const emitter = getOrCreateEmitter(id);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let sendEvent: ((event: PipelineEvent) => void) | null = null;

  function cleanup() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (sendEvent) {
      emitter.offEvent(sendEvent);
      sendEvent = null;
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      sendEvent = (event: PipelineEvent) => {
        try {
          const data = JSON.stringify(toStatusPayload(event));
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

          if (event.type === "completed" || event.type === "failed") {
            cleanup();
            setTimeout(() => {
              try {
                controller.close();
              } catch {}
            }, 500);
          }
        } catch {
          cleanup();
        }
      };

      emitter.onEvent(sendEvent);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      timeout = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      }, 600000);

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            status: course.status,
            progress: course.progress || {
              stage: "pending",
              detail: "Connected to pipeline stream",
              percent: 0,
            },
            errorMessage:
              course.status === "failed" ? course.errorMessage : undefined,
          })}\n\n`,
        ),
      );
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

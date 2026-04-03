export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import {
  flashcards,
  flashcardReviews,
  courses,
  courseAssignments,
} from "@workspace/db/schema";
import { eq, and, isNull, lte, or, isNull as isNullCol } from "drizzle-orm";
import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { awardXp } from "@/lib/xp";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkCourseAccess(courseId: string, userId: string) {
  const [courseRecord] = await db
    .select({ id: courses.id, createdBy: courses.createdBy, isPublic: courses.isPublic, organizationId: courses.organizationId })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) return null;

  let hasAccess = courseRecord.createdBy === userId || courseRecord.isPublic;
  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, userId)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  return hasAccess ? courseRecord : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  const url = new URL(request.url);
  const moduleIndexParam = url.searchParams.get("moduleIndex");
  const moduleFilter = moduleIndexParam !== null ? parseInt(moduleIndexParam, 10) : null;

  const whereConditions = moduleFilter !== null && !isNaN(moduleFilter)
    ? and(eq(flashcards.courseId, courseId), eq(flashcards.moduleIndex, moduleFilter))
    : eq(flashcards.courseId, courseId);

  const cards = await db
    .select({
      id: flashcards.id,
      moduleIndex: flashcards.moduleIndex,
      front: flashcards.front,
      back: flashcards.back,
      codeSnippet: flashcards.codeSnippet,
      reviewId: flashcardReviews.id,
      due: flashcardReviews.due,
      stability: flashcardReviews.stability,
      difficulty: flashcardReviews.difficulty,
      elapsedDays: flashcardReviews.elapsedDays,
      scheduledDays: flashcardReviews.scheduledDays,
      reps: flashcardReviews.reps,
      lapses: flashcardReviews.lapses,
      state: flashcardReviews.state,
      lastReview: flashcardReviews.lastReview,
    })
    .from(flashcards)
    .leftJoin(
      flashcardReviews,
      and(eq(flashcardReviews.flashcardId, flashcards.id), eq(flashcardReviews.userId, user.id))
    )
    .where(whereConditions);

  const now = new Date();
  const f = fsrs();

  const dueCards = cards.filter((c) => {
    if (!c.reviewId) return true;
    return c.due && c.due <= now;
  });

  const totalCards = cards.length;
  const dueCount = dueCards.length;

  const dueCardsWithPreview = dueCards.map((c) => {
    let currentCard: Card;
    if (c.reviewId && c.stability !== null && c.difficulty !== null) {
      const emptyRef = createEmptyCard(now);
      currentCard = {
        ...emptyRef,
        due: c.due ?? now,
        stability: c.stability,
        difficulty: c.difficulty,
        elapsed_days: c.elapsedDays ?? 0,
        scheduled_days: c.scheduledDays ?? 0,
        reps: c.reps ?? 0,
        lapses: c.lapses ?? 0,
        state: (c.state ?? 0) as 0 | 1 | 2 | 3,
        last_review: c.lastReview ?? undefined,
      };
    } else {
      currentCard = createEmptyCard(now);
    }
    const sched = f.repeat(currentCard, now) as unknown as Record<number, { card: Card; log: { scheduled_days: number } }>;
    return {
      id: c.id,
      moduleIndex: c.moduleIndex,
      front: c.front,
      back: c.back,
      codeSnippet: c.codeSnippet,
      reviewId: c.reviewId,
      due: c.due,
      reps: c.reps,
      schedulingPreview: {
        again: sched[1]?.log.scheduled_days ?? 0,
        hard: sched[2]?.log.scheduled_days ?? 1,
        good: sched[3]?.log.scheduled_days ?? 3,
        easy: sched[4]?.log.scheduled_days ?? 7,
      },
    };
  });

  return NextResponse.json({
    cards: dueCardsWithPreview,
    totalCards,
    dueCount,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  let body: { flashcardId: string; rating: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { flashcardId, rating } = body;
  if (!UUID_RE.test(flashcardId)) {
    return NextResponse.json({ error: "Invalid flashcard ID" }, { status: 400 });
  }
  if (typeof rating !== "number" || ![1, 2, 3, 4].includes(rating)) {
    return NextResponse.json({ error: "rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)" }, { status: 400 });
  }

  const [card] = await db
    .select()
    .from(flashcards)
    .where(and(eq(flashcards.id, flashcardId), eq(flashcards.courseId, courseId)))
    .limit(1);

  if (!card) return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });

  const [existingReview] = await db
    .select()
    .from(flashcardReviews)
    .where(and(eq(flashcardReviews.flashcardId, flashcardId), eq(flashcardReviews.userId, user.id)))
    .limit(1);

  const f = fsrs();
  const now = new Date();
  const ratingEnum = rating as Rating;

  let currentCard: Card;
  if (existingReview) {
    const emptyRef = createEmptyCard(now);
    currentCard = {
      ...emptyRef,
      due: existingReview.due,
      stability: existingReview.stability,
      difficulty: existingReview.difficulty,
      elapsed_days: existingReview.elapsedDays,
      scheduled_days: existingReview.scheduledDays,
      reps: existingReview.reps,
      lapses: existingReview.lapses,
      state: existingReview.state as 0 | 1 | 2 | 3,
      last_review: existingReview.lastReview ?? undefined,
    };
  } else {
    currentCard = createEmptyCard(now);
  }

  const schedulingCards = f.repeat(currentCard, now);
  const numericRating = ratingEnum as unknown as 1 | 2 | 3 | 4;
  const result = schedulingCards[numericRating];
  const nextCard = result.card;
  const nextInterval = result.log.scheduled_days;

  const reviewData = {
    due: nextCard.due,
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsedDays: nextCard.elapsed_days,
    scheduledDays: nextCard.scheduled_days,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: nextCard.state,
    lastReview: now,
    updatedAt: now,
  };

  if (existingReview) {
    await db.update(flashcardReviews).set(reviewData).where(eq(flashcardReviews.id, existingReview.id));
  } else {
    await db.insert(flashcardReviews).values({
      flashcardId,
      userId: user.id,
      ...reviewData,
    });
  }

  return NextResponse.json({
    success: true,
    nextInterval,
    nextDue: nextCard.due,
    card: nextCard,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [ownerCheck] = await db
    .select({ createdBy: courses.createdBy })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!ownerCheck || ownerCheck.createdBy !== user.id) {
    return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });
  }

  let body: { cards: Array<{ front: string; back: string; codeSnippet?: string; moduleIndex: number }> };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { cards } = body;
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: "cards array is required" }, { status: 400 });
  }

  const validCards = cards.filter(
    (c) => typeof c.front === "string" && c.front.trim() &&
      typeof c.back === "string" && c.back.trim() &&
      typeof c.moduleIndex === "number"
  );

  if (validCards.length === 0) {
    return NextResponse.json({ error: "No valid cards provided" }, { status: 400 });
  }

  const inserted = await db
    .insert(flashcards)
    .values(validCards.map((c) => ({
      courseId,
      moduleIndex: c.moduleIndex,
      front: c.front.trim(),
      back: c.back.trim(),
      codeSnippet: c.codeSnippet?.trim() || null,
    })))
    .returning({ id: flashcards.id });

  return NextResponse.json({ success: true, inserted: inserted.length });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const clientTz = request.headers.get("x-timezone") || "";

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  let xpResult = null;
  try {
    xpResult = await awardXp(user.id, "flashcard_session", courseId, undefined, clientTz || undefined);
  } catch {}

  return NextResponse.json({
    success: true,
    ...(xpResult?.leveledUp ? { leveledUp: true, newLevel: xpResult.newLevel, newLevelName: xpResult.newLevelName } : {}),
  });
}

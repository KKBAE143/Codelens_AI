import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { users, courses, webhookRegistrations } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // 1. Update user 117244354 to pro plan
  const [updatedUser] = await db
    .update(users)
    .set({
      plan: "pro",
      stripeCustomerId: "cus_UFCzZkeU8whnmI",
      stripeSubscriptionId: "sub_1TGivEGLA3e9hYL7NphQKPig",
      updatedAt: new Date(),
    })
    .where(eq(users.id, "117244354"))
    .returning({
      id: users.id,
      plan: users.plan,
      stripeSubscriptionId: users.stripeSubscriptionId,
    });
  console.log("Updated user:", updatedUser);

  // 2. Update sessions for this user
  await sql`
    UPDATE sessions
    SET sess = jsonb_set(
      jsonb_set(sess, '{user,plan}', '"pro"'),
      '{user,monthlyGenerationsUsed}', '0'
    )
    WHERE sess->'user'->>'id' = '117244354'
      AND expire > NOW()
  `;
  console.log("Updated sessions for user 117244354");

  // 3. Delete courses (first delete webhook_registrations)
  const courseIds = [
    "30f52d72-e9be-4e4e-abfc-bcb7c7611ba2",
    "5b91d494-6b77-4c3a-af07-0c41bcfdb1b3",
    "93f7b2b1-2e77-47a4-af13-ac7051a1d0a7",
    "aec7f70b-e326-4b4d-93b5-e427e4f9d58d",
    "dde76396-e4f3-455b-82aa-9eb757e5edc4",
  ];

  await db
    .delete(webhookRegistrations)
    .where(inArray(webhookRegistrations.courseId, courseIds));
  console.log("Deleted webhook_registrations for courses");

  const deletedCourses = await db
    .delete(courses)
    .where(inArray(courses.id, courseIds))
    .returning({ id: courses.id });
  console.log(
    "Deleted courses:",
    deletedCourses.map((c) => c.id),
  );

  console.log("Done!");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

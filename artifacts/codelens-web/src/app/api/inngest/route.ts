import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateCourseJob } from "@/lib/jobs/generate-course";
import { regenerateCourseJob } from "@/lib/jobs/regenerate-course";

// Allow Inngest functions up to 300 seconds on Vercel
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCourseJob, regenerateCourseJob],
});

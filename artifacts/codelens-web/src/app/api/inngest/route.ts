import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateCourseJob } from "@/lib/jobs/generate-course";
import { regenerateCourseJob } from "@/lib/jobs/regenerate-course";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCourseJob, regenerateCourseJob],
});

import { inngest } from "../inngest";
import { regenerateCourseDirect } from "./regenerate-course-direct";

export const regenerateCourseJob = inngest.createFunction(
  {
    id: "regenerate-course",
    retries: 2,
    triggers: { event: "codelens/course.regenerate" },
  },
  async ({ event }) => {
    const { courseId, changedFiles, commitMessages } = event.data;
    await regenerateCourseDirect(courseId, changedFiles, commitMessages);
    return { success: true, courseId };
  },
);

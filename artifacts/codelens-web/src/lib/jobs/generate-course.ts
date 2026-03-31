import { inngest } from "../inngest";
import { generateCourseDirect } from "./generate-course-direct";

export const generateCourseJob = inngest.createFunction(
  {
    id: "generate-course",
    retries: 3,
    triggers: { event: "codelens/course.generate" },
  },
  async ({ event }) => {
    const { courseId } = event.data;
    await generateCourseDirect(courseId);
    return { success: true, courseId };
  },
);

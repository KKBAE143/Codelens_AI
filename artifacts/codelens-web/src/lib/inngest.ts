import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "codelens-ai",
  eventKey: process.env.INNGEST_EVENT_KEY || "local-dev-key",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  isDev: !process.env.INNGEST_SIGNING_KEY,
});

export function isInngestConfigured(): boolean {
  return !!process.env.INNGEST_EVENT_KEY;
}

export type CourseGenerateEvent = {
  name: "codelens/course.generate";
  data: {
    courseId: string;
  };
};

export type CourseRegenerateEvent = {
  name: "codelens/course.regenerate";
  data: {
    courseId: string;
    changedFiles: {
      added: string[];
      modified: string[];
      removed: string[];
    };
    commitMessages: string[];
  };
};

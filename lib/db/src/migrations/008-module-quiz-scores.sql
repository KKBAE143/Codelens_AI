CREATE TABLE IF NOT EXISTS module_quiz_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_index INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  questions_total INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS module_quiz_scores_unique
  ON module_quiz_scores (course_id, user_id, module_index);

CREATE INDEX IF NOT EXISTS module_quiz_scores_course_id_idx
  ON module_quiz_scores (course_id);

CREATE INDEX IF NOT EXISTS module_quiz_scores_user_id_idx
  ON module_quiz_scores (user_id);

CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_index INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  code_snippet TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due TIMESTAMP NOT NULL DEFAULT NOW(),
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  last_review TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT flashcard_reviews_unique UNIQUE (flashcard_id, user_id)
);

CREATE INDEX IF NOT EXISTS flashcards_course_id_idx ON flashcards (course_id);
CREATE INDEX IF NOT EXISTS flashcard_reviews_user_due_idx ON flashcard_reviews (user_id, due);
CREATE INDEX IF NOT EXISTS flashcard_reviews_flashcard_id_idx ON flashcard_reviews (flashcard_id);

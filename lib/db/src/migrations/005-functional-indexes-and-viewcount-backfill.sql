-- Functional indexes for case-insensitive owner/repo lookups
-- Used by explore/[owner]/[repo] and check-existing queries
CREATE INDEX IF NOT EXISTS courses_lower_owner_name_idx ON courses (LOWER(owner_name));
CREATE INDEX IF NOT EXISTS courses_lower_repo_name_idx ON courses (LOWER(repo_name));

-- Backfill denormalized view_count from course_views for existing rows
UPDATE courses
SET view_count = sub.cnt
FROM (
  SELECT course_id, COUNT(*)::int AS cnt
  FROM course_views
  GROUP BY course_id
) AS sub
WHERE courses.id = sub.course_id
  AND (courses.view_count = 0 OR courses.view_count IS NULL);

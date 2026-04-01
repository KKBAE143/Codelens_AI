-- Composite index for 24-hour view deduplication query:
-- SELECT id FROM course_views WHERE course_id = ? AND visitor_id = ? AND created_at > ?
CREATE INDEX IF NOT EXISTS course_views_dedup_idx
  ON course_views (course_id, visitor_id, created_at);

-- Composite index for per-org hourly invite rate-limit count:
-- SELECT count(*) FROM organization_members WHERE organization_id = ? AND joined_at > ?
CREATE INDEX IF NOT EXISTS org_member_org_joined_idx
  ON organization_members (organization_id, joined_at);

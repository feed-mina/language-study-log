-- Additive study schedule. Keep trigger guards CASE-free for the remote D1 SQL parser.
CREATE TABLE IF NOT EXISTS study_plan_slots (plan_id TEXT PRIMARY KEY REFERENCES study_plans(id) ON DELETE CASCADE, start_minute INTEGER CHECK(start_minute BETWEEN 0 AND 1439));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS study_schedule_settings (id TEXT PRIMARY KEY, daily_minutes INTEGER NOT NULL CHECK(daily_minutes BETWEEN 10 AND 600));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_sessions (id TEXT PRIMARY KEY, session_date TEXT NOT NULL, start_minute INTEGER CHECK(start_minute BETWEEN 0 AND 1439), minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 600), status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','completed','cancelled')), created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_review_sessions_date ON review_sessions(session_date, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_session_cards (session_id TEXT NOT NULL REFERENCES review_sessions(id), card_id TEXT NOT NULL REFERENCES study_cards(id), reviewed_at TEXT, rating TEXT, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(session_id, card_id));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_review_card ON review_session_cards(card_id) WHERE active = 1;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS validate_review_assignment BEFORE INSERT ON review_session_cards BEGIN
    SELECT RAISE(ABORT, 'REVIEW_CONFLICT') WHERE NOT EXISTS (SELECT 1 FROM study_cards c JOIN review_sessions s ON s.id=NEW.session_id WHERE c.id=NEW.card_id AND c.due<=s.created_at AND s.status='planned');
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS archive_clears_study_time AFTER UPDATE OF status ON study_plans WHEN NEW.status='archived' BEGIN UPDATE study_plan_slots SET start_minute=NULL WHERE plan_id=NEW.id; END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS schedule_receipts (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS validate_schedule_mutation BEFORE INSERT ON schedule_receipts BEGIN
    SELECT RAISE(ABORT, 'REVIEW_CONFLICT') WHERE json_extract(NEW.fingerprint,'$.action')='plan' AND NOT EXISTS(SELECT 1 FROM study_plans WHERE id=json_extract(NEW.fingerprint,'$.planId') AND status=json_extract(NEW.fingerprint,'$.expectedStatus') AND updated_at=json_extract(NEW.fingerprint,'$.expectedUpdatedAt'));
    SELECT RAISE(ABORT, 'REVIEW_CONFLICT') WHERE json_extract(NEW.fingerprint,'$.action')='time' AND NOT EXISTS(SELECT 1 FROM study_plans WHERE id=json_extract(NEW.fingerprint,'$.planId') AND status='planned');
    SELECT RAISE(ABORT, 'REVIEW_CONFLICT') WHERE json_extract(NEW.fingerprint,'$.action') IN ('session-move','session-cancel') AND NOT EXISTS(SELECT 1 FROM review_sessions WHERE id=json_extract(NEW.fingerprint,'$.sessionId') AND status='planned');
  END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scheduled_review_receipts (request_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, card_id TEXT NOT NULL, rating TEXT NOT NULL, expected_version TEXT NOT NULL, result_json TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS scheduled_review_version BEFORE INSERT ON scheduled_review_receipts BEGIN
    SELECT RAISE(ABORT, 'REVIEW_CONFLICT') WHERE NOT EXISTS (SELECT 1 FROM study_cards c JOIN review_session_cards sc ON sc.card_id=c.id JOIN review_sessions s ON s.id=sc.session_id WHERE c.id=NEW.card_id AND c.updated_at=NEW.expected_version AND sc.session_id=NEW.session_id AND sc.active=1 AND sc.reviewed_at IS NULL AND s.status='planned');
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS plan_slot_insert BEFORE INSERT ON study_plan_slots WHEN NEW.start_minute IS NOT NULL BEGIN
    SELECT RAISE(ABORT, 'TIME_OVERFLOW') WHERE EXISTS (SELECT 1 FROM study_plans p WHERE p.id=NEW.plan_id AND NEW.start_minute+p.minutes>1440);
    SELECT RAISE(ABORT, 'TIME_CONFLICT') WHERE EXISTS (SELECT 1 FROM study_plans p JOIN study_plans other ON other.plan_date=p.plan_date JOIN study_plan_slots slot ON slot.plan_id=other.id WHERE p.id=NEW.plan_id AND other.id<>p.id AND other.status IN ('planned','completed') AND NEW.start_minute<slot.start_minute+other.minutes AND slot.start_minute<NEW.start_minute+p.minutes) OR EXISTS (SELECT 1 FROM study_plans p JOIN review_sessions s ON s.session_date=p.plan_date WHERE p.id=NEW.plan_id AND s.status<>'cancelled' AND NEW.start_minute<s.start_minute+s.minutes AND s.start_minute<NEW.start_minute+p.minutes);
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS plan_slot_update BEFORE UPDATE ON study_plan_slots WHEN NEW.start_minute IS NOT NULL BEGIN
    SELECT RAISE(ABORT, 'TIME_OVERFLOW') WHERE EXISTS (SELECT 1 FROM study_plans p WHERE p.id=NEW.plan_id AND NEW.start_minute+p.minutes>1440);
    SELECT RAISE(ABORT, 'TIME_CONFLICT') WHERE EXISTS (SELECT 1 FROM study_plans p JOIN study_plans other ON other.plan_date=p.plan_date JOIN study_plan_slots slot ON slot.plan_id=other.id WHERE p.id=NEW.plan_id AND other.id<>p.id AND other.status IN ('planned','completed') AND NEW.start_minute<slot.start_minute+other.minutes AND slot.start_minute<NEW.start_minute+p.minutes) OR EXISTS (SELECT 1 FROM study_plans p JOIN review_sessions s ON s.session_date=p.plan_date WHERE p.id=NEW.plan_id AND s.status<>'cancelled' AND NEW.start_minute<s.start_minute+s.minutes AND s.start_minute<NEW.start_minute+p.minutes);
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS review_slot_insert BEFORE INSERT ON review_sessions WHEN NEW.start_minute IS NOT NULL AND NEW.status<>'cancelled' BEGIN
    SELECT RAISE(ABORT, 'TIME_OVERFLOW') WHERE NEW.start_minute+NEW.minutes>1440;
    SELECT RAISE(ABORT, 'TIME_CONFLICT') WHERE EXISTS (SELECT 1 FROM study_plans p JOIN study_plan_slots slot ON slot.plan_id=p.id WHERE p.plan_date=NEW.session_date AND p.status IN ('planned','completed') AND NEW.start_minute<slot.start_minute+p.minutes AND slot.start_minute<NEW.start_minute+NEW.minutes) OR EXISTS (SELECT 1 FROM review_sessions s WHERE s.session_date=NEW.session_date AND s.id<>NEW.id AND s.status<>'cancelled' AND NEW.start_minute<s.start_minute+s.minutes AND s.start_minute<NEW.start_minute+NEW.minutes);
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS review_slot_update BEFORE UPDATE ON review_sessions WHEN NEW.start_minute IS NOT NULL AND NEW.status<>'cancelled' BEGIN
    SELECT RAISE(ABORT, 'TIME_OVERFLOW') WHERE NEW.start_minute+NEW.minutes>1440;
    SELECT RAISE(ABORT, 'TIME_CONFLICT') WHERE EXISTS (SELECT 1 FROM study_plans p JOIN study_plan_slots slot ON slot.plan_id=p.id WHERE p.plan_date=NEW.session_date AND p.status IN ('planned','completed') AND NEW.start_minute<slot.start_minute+p.minutes AND slot.start_minute<NEW.start_minute+NEW.minutes) OR EXISTS (SELECT 1 FROM review_sessions s WHERE s.session_date=NEW.session_date AND s.id<>NEW.id AND s.status<>'cancelled' AND NEW.start_minute<s.start_minute+s.minutes AND s.start_minute<NEW.start_minute+NEW.minutes);
  END;

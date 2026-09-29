-- Senhas são derivadas com PBKDF2; sessões e recuperação guardam só hashes.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires);

ALTER TABLE files ADD COLUMN expires_at INTEGER;
ALTER TABLE files ADD COLUMN public_upload INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN completed_at INTEGER;
CREATE INDEX idx_files_owner_status ON files(owner_id, status);
CREATE INDEX idx_files_expiration ON files(status, expires_at);
CREATE INDEX idx_limits_expires ON upload_limits(expires);
CREATE INDEX idx_signals_created ON signals(created_at);
CREATE INDEX idx_presence_updated ON presence(updated_at);

-- Uma linha global e uma por conta. Reservas de uploads também ocupam espaço.
CREATE TABLE storage_usage (
  id TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes >= 0),
  files INTEGER NOT NULL DEFAULT 0 CHECK(files >= 0)
);
INSERT INTO storage_usage (id) VALUES ('global');

CREATE TRIGGER reserve_file_space AFTER INSERT ON files
WHEN NEW.status != 'deleted'
BEGIN
  UPDATE storage_usage SET bytes = bytes + NEW.size, files = files + 1 WHERE id = 'global';
  INSERT INTO storage_usage (id, bytes, files) VALUES (NEW.owner_id, NEW.size, 1)
    ON CONFLICT(id) DO UPDATE SET bytes = bytes + NEW.size, files = files + 1;
END;
CREATE TRIGGER release_file_space AFTER UPDATE OF status ON files
WHEN OLD.status != 'deleted' AND NEW.status = 'deleted'
BEGIN
  UPDATE storage_usage SET bytes = bytes - OLD.size, files = files - 1
    WHERE id IN ('global', OLD.owner_id);
END;

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_PATH="prisma/dev.db"
mkdir -p "$(dirname "$DB_PATH")"

sqlite3 "$DB_PATH" < db/init.sql

# Safe upgrade path for existing local SQLite databases created by older web builds.
sqlite3 "$DB_PATH" "ALTER TABLE AppSetting ADD COLUMN openAIAPIKey TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN educationText TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN openAIAPIKey TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN openAIModel TEXT;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN reasoningEffort TEXT;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN pageMarginTop REAL NOT NULL DEFAULT 0.5;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN pageMarginRight REAL NOT NULL DEFAULT 0.5;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN pageMarginBottom REAL NOT NULL DEFAULT 0.5;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN pageMarginLeft REAL NOT NULL DEFAULT 0.5;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN nameFontSize REAL NOT NULL DEFAULT 14;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN bodyFontSize REAL NOT NULL DEFAULT 10;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN resumeFontFamily TEXT NOT NULL DEFAULT 'Calibri';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN resumeBackgroundColor TEXT NOT NULL DEFAULT 'FFFFFF';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN resumeBodyTextColor TEXT NOT NULL DEFAULT '222222';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE Profile ADD COLUMN resumeHeadingColor TEXT NOT NULL DEFAULT '111111';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE GenerationJob ADD COLUMN aiModel TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE GenerationJob ADD COLUMN aiReasoningEffort TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE GenerationJob ADD COLUMN aiConfigSource TEXT NOT NULL DEFAULT '';" 2>/dev/null || true
sqlite3 "$DB_PATH" < db/init.sql

npx prisma generate

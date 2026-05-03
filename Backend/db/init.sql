PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS AppSetting (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  openAIAPIKey TEXT NOT NULL DEFAULT '',
  openAIModel TEXT NOT NULL DEFAULT 'gpt-5.4',
  reasoningEffort TEXT NOT NULL DEFAULT 'high',
  exportFormat TEXT NOT NULL DEFAULT 'docx',
  duplicateJobDescriptionDetectionEnabled BOOLEAN NOT NULL DEFAULT 1,
  maxParallelGenerations INTEGER NOT NULL DEFAULT 3,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  passwordHash TEXT NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastLoginAt DATETIME
);

CREATE TABLE IF NOT EXISTS UserSession (
  id TEXT PRIMARY KEY,
  userID TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(userID) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS UserSession_userID_idx ON UserSession(userID);
CREATE INDEX IF NOT EXISTS UserSession_expiresAt_idx ON UserSession(expiresAt);

CREATE TABLE IF NOT EXISTS UserProfileAssignment (
  userID TEXT NOT NULL,
  profileID TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(userID, profileID),
  FOREIGN KEY(userID) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY(profileID) REFERENCES Profile(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS UserProfileAssignment_profileID_idx ON UserProfileAssignment(profileID);

CREATE TABLE IF NOT EXISTS Profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phoneNumber TEXT NOT NULL DEFAULT '',
  linkedInURL TEXT NOT NULL DEFAULT '',
  basePrompt TEXT NOT NULL,
  educationText TEXT NOT NULL DEFAULT '',
  openAIAPIKey TEXT NOT NULL DEFAULT '',
  openAIModel TEXT,
  reasoningEffort TEXT,
  pageMarginTop REAL NOT NULL DEFAULT 0.5,
  pageMarginRight REAL NOT NULL DEFAULT 0.5,
  pageMarginBottom REAL NOT NULL DEFAULT 0.5,
  pageMarginLeft REAL NOT NULL DEFAULT 0.5,
  nameFontSize REAL NOT NULL DEFAULT 14,
  bodyFontSize REAL NOT NULL DEFAULT 10,
  resumeFontFamily TEXT NOT NULL DEFAULT 'Calibri',
  resumeBackgroundColor TEXT NOT NULL DEFAULT 'FFFFFF',
  resumeBodyTextColor TEXT NOT NULL DEFAULT '222222',
  resumeHeadingColor TEXT NOT NULL DEFAULT '111111',
  resumeFileName TEXT,
  resumeStoredPath TEXT,
  resumeContentType TEXT,
  resumeExtractedText TEXT,
  resumeImportedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GenerationJob (
  id TEXT PRIMARY KEY,
  profileID TEXT NOT NULL,
  profileName TEXT NOT NULL,
  jobDescription TEXT NOT NULL,
  progressPhase TEXT NOT NULL DEFAULT 'queued',
  progressMessage TEXT NOT NULL DEFAULT 'Queued',
  progressFraction REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  exportFormat TEXT NOT NULL DEFAULT 'docx',
  aiModel TEXT NOT NULL DEFAULT '',
  aiReasoningEffort TEXT NOT NULL DEFAULT '',
  aiConfigSource TEXT NOT NULL DEFAULT '',
  errorMessage TEXT,
  resultContent TEXT,
  exportedFileName TEXT,
  savedFilePath TEXT,
  notesJSON TEXT NOT NULL DEFAULT '[]',
  atsAnalysisJSON TEXT,
  readinessJSON TEXT,
  duplicateCheckJSON TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME,
  FOREIGN KEY(profileID) REFERENCES Profile(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS ResumeHistory (
  id TEXT PRIMARY KEY,
  profileID TEXT NOT NULL,
  profileName TEXT NOT NULL,
  jobTitle TEXT NOT NULL,
  jobDescription TEXT NOT NULL,
  generatedResume TEXT NOT NULL,
  exportedFileName TEXT NOT NULL,
  savedFilePath TEXT,
  exportFormat TEXT NOT NULL,
  totalDurationSeconds REAL NOT NULL,
  apiDurationSeconds REAL,
  atsAnalysisJSON TEXT,
  createdAt DATETIME NOT NULL,
  completedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profileID) REFERENCES Profile(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS JobDescriptionArchive (
  id TEXT PRIMARY KEY,
  jobID TEXT NOT NULL,
  profileID TEXT NOT NULL,
  profileName TEXT NOT NULL,
  preview TEXT NOT NULL,
  normalizedText TEXT NOT NULL,
  tokenCountsJSON TEXT NOT NULL,
  shinglesJSON TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS JobDescriptionArchive_profileID_idx ON JobDescriptionArchive(profileID);
CREATE INDEX IF NOT EXISTS JobDescriptionArchive_jobID_idx ON JobDescriptionArchive(jobID);

CREATE TABLE IF NOT EXISTS DeveloperEvent (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  jobID TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS APIDebugSession (
  id TEXT PRIMARY KEY,
  jobID TEXT,
  label TEXT NOT NULL,
  requestSummary TEXT NOT NULL,
  responseID TEXT,
  responseStatusCode INTEGER,
  rawOutput TEXT,
  error TEXT,
  startedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME
);

CREATE INDEX IF NOT EXISTS APIDebugSession_jobID_idx ON APIDebugSession(jobID);
CREATE INDEX IF NOT EXISTS APIDebugSession_startedAt_idx ON APIDebugSession(startedAt);

INSERT OR IGNORE INTO AppSetting(id) VALUES ('singleton');

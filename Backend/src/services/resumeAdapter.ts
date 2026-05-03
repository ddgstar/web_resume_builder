export interface ResumePatch {
  headline?: string;
  professionalSummary: string[];
  skills: string[];
  experienceUpdates: Array<{
    company: string;
    headerLines: string[];
    titleHint?: string;
    updatedTitle?: string;
    dateRange?: string;
    bullets: string[];
    companyIndex: number;
  }>;
  notes: string[];
}

interface ExperienceEntry {
  company: string;
  title?: string;
  dateRange?: string;
  headerLines: string[];
  bullets: string[];
}

export function makePatchFromGeneratedResume(generatedResume: string): ResumePatch {
  const generatedEntries = parseExperience(generatedResume);
  const summary = sectionContentLines(generatedResume, ["summary", "professional summary", "profile"]);
  const skills = normalizeSkillLines(sectionContentLines(generatedResume, ["skills", "technical skills", "core competencies"]));
  const headline = detectHeadline(generatedResume);

  const experienceUpdates = generatedEntries.map((generatedEntry, index) => {
    return {
      company: generatedEntry.company,
      headerLines: generatedEntry.headerLines,
      titleHint: generatedEntry.title,
      updatedTitle: generatedEntry.title,
      dateRange: generatedEntry.dateRange,
      bullets: generatedEntry.bullets,
      companyIndex: index
    };
  });

  return {
    headline,
    professionalSummary: summary,
    skills,
    experienceUpdates,
    notes: [
      "Generated response treated as authoritative resume content."
    ]
  };
}

export function mergeResumeText(patch: ResumePatch, educationText = "") {
  if (patch.experienceUpdates.length === 0 && !patch.professionalSummary.length && !patch.skills.length) {
    return "";
  }

  const sections = [
    patch.headline,
    "Professional Summary",
    patch.professionalSummary.join(" "),
    "Professional Experience",
    ...patch.experienceUpdates.flatMap(formatExperienceEntry),
    "Technical Skills",
    ...patch.skills,
    ...formatEducation(educationText)
  ].filter(Boolean);

  return sections.join("\n");
}

function formatEducation(educationText: string) {
  const lines = educationText
    .split(/\r?\n/)
    .map((line) => stripBullet(line.trim()).replace(/\s{2,}/g, " "))
    .filter(Boolean)
    .map((line) => line.replace(/\s*[|•]\s*/g, " | "));
  return lines.length ? ["Education", ...lines] : [];
}

function sectionContentLines(text: string, headings: string[]) {
  return sectionRawLines(text, headings)
    .map((line) => stripBullet(line.trim()))
    .filter((line) => Boolean(line) && !isDecorativeLine(line));
}

function sectionRawLines(text: string, headings: string[]) {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => headings.includes(normalizeHeading(line)));
  if (headingIndex < 0) return [];
  const result: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || isDecorativeLine(line)) continue;
    if (isKnownHeading(line)) break;
    result.push(line);
  }
  return result;
}

function parseExperience(text: string): ExperienceEntry[] {
  const lines = sectionRawLines(text, ["experience", "professional experience", "work experience"]);
  const entries: ExperienceEntry[] = [];
  let headers: string[] = [];
  let bullets: string[] = [];

  function flush() {
    if (!headers.length && !bullets.length) return;
    const parsed = parseExperienceHeaders(headers, entries.length);
    if (bullets.length) {
      entries.push({
        ...parsed,
        headerLines: headers.length ? headers : [parsed.company],
        bullets: bullets.map(stripBullet).filter(Boolean)
      });
    }
    headers = [];
    bullets = [];
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (isBullet(line)) {
      bullets.push(line);
    } else {
      if (bullets.length) flush();
      headers.push(line);
    }
    index += 1;
  }
  flush();
  return entries;
}

function parseExperienceHeaders(headers: string[], index: number) {
  const cleaned = headers.map((line) => line.trim()).filter(Boolean);
  const joined = cleaned.join(" | ");
  const dateRange = cleaned.map(extractDateRange).find(Boolean);
  const atLine = cleaned.find((line) => line.includes("@"));

  if (atLine) {
    const [rawTitle, rawCompany] = atLine.split("@");
    return {
      title: stripDateRange(rawTitle).replace(/\s+/g, " ").trim() || undefined,
      company: cleanCompany(rawCompany.split("|")[0]),
      dateRange
    };
  }

  const first = cleaned[0] ?? `Experience ${index + 1}`;
  const second = cleaned[1] ?? "";
  const firstWithoutDate = stripDateRange(first);
  const titleLooksLikeRole = /\b(engineer|developer|architect|scientist|analyst|manager|lead|principal|senior|consultant|specialist|director)\b/i.test(firstWithoutDate);
  const secondCompany = second ? cleanCompany(second.split("|")[0]) : "";

  if (titleLooksLikeRole && secondCompany) {
    return {
      title: firstWithoutDate.trim(),
      company: secondCompany,
      dateRange
    };
  }

  const company = cleanCompany(secondCompany || firstWithoutDate.split("|")[0] || `Experience ${index + 1}`);
  const title = titleLooksLikeRole ? firstWithoutDate.trim() : undefined;
  return { title, company, dateRange };
}

function formatExperienceEntry(entry: ResumePatch["experienceUpdates"][number]) {
  const headers = entry.headerLines?.length
    ? entry.headerLines
    : [entry.updatedTitle ? `${entry.updatedTitle} @ ${entry.company}` : entry.company];
  return [
    ...headers,
    ...entry.bullets.map((bullet) => `• ${stripBullet(bullet)}`)
  ];
}

function detectHeadline(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !isDecorativeLine(line));
  const firstSectionIndex = lines.findIndex(isKnownHeading);
  const preamble = firstSectionIndex >= 0 ? lines.slice(0, firstSectionIndex) : [];
  const headline = preamble.find((line, index) => index > 0 && !line.includes("@") && !line.includes("|"));
  return headline ?? undefined;
}

function extractDateRange(value: string) {
  const match = value.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4}\s*(?:-|–|to)\s*(?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4})\b/i);
  return match?.[0]?.trim();
}

function stripDateRange(value: string) {
  const range = extractDateRange(value);
  return range ? value.replace(range, "").replace(/\s*(?:-|–|\|)\s*$/, "").trim() : value.trim();
}

function cleanCompany(value: string) {
  return value.replace(/^[\s@-]+/, "").replace(/\s+/g, " ").trim();
}

function stripBullet(value: string) {
  return value.replace(/^[•\-\–\*]\s*/, "").trim();
}

function isBullet(value: string) {
  return /^[•\-\–\*]/.test(value.trim());
}

function normalizeHeading(value: string) {
  return value.trim().toLowerCase().replace(/[:：]$/, "");
}

function isKnownHeading(value: string) {
  return ["summary", "professional summary", "profile", "experience", "professional experience", "work experience", "skills", "technical skills", "core competencies", "education"].includes(normalizeHeading(value));
}

function isDecorativeLine(value: string) {
  return /^[-━_=]{3,}$/.test(value.trim());
}

function normalizeSkillLines(lines: string[]) {
  const normalized: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;

    if (isSkillCategoryOnly(line)) {
      const next = lines[index + 1]?.trim();
      if (next && !isSkillCategoryLine(next) && !isKnownHeading(next)) {
        normalized.push(`${normalizeSkillCategory(line)}: ${stripBullet(next)}`);
        index += 1;
      } else {
        normalized.push(`${normalizeSkillCategory(line)}:`);
      }
      continue;
    }

    if (isSkillCategoryLine(line)) {
      const [category, ...rest] = line.split(":");
      normalized.push(`${normalizeSkillCategory(category)}: ${rest.join(":").trim()}`.trim());
      continue;
    }

    normalized.push(stripBullet(line));
  }

  return normalized.filter(Boolean);
}

function isSkillCategoryOnly(value: string) {
  return /^(Languages?|Frameworks?|Cloud|DevOps|Data\s*&\s*AI|Databases?|Tools?|Architecture):?$/i.test(value.trim());
}

function isSkillCategoryLine(value: string) {
  return /^(Languages?|Frameworks?|Cloud|DevOps|Data\s*&\s*AI|Databases?|Tools?|Architecture)\s*:/i.test(value.trim());
}

function normalizeSkillCategory(value: string) {
  const raw = value.replace(/[:：]/g, "").trim().toLowerCase();
  if (raw.startsWith("language")) return "Languages";
  if (raw.startsWith("framework")) return "Frameworks";
  if (raw === "cloud") return "Cloud";
  if (raw === "devops") return "DevOps";
  if (raw.replace(/\s+/g, "") === "data&ai") return "Data & AI";
  if (raw.startsWith("database")) return "Databases";
  if (raw.startsWith("tool")) return "Tools";
  if (raw.startsWith("architecture")) return "Architecture";
  return value.replace(/[:：]/g, "").trim();
}

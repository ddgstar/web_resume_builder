import fs from "node:fs/promises";
import path from "node:path";
import { BorderStyle, Document, Packer, Paragraph, TextRun } from "docx";

export async function writeResumeDocx(input: {
  profileName: string;
  contactLine: string;
  resumeText: string;
  outputDirectory: string;
  style?: ResumeDocxStyle;
}) {
  await fs.mkdir(input.outputDirectory, { recursive: true });
  const fileName = `${sanitizeFileName(input.profileName) || "TailoredResume"}.docx`;
  const filePath = path.join(input.outputDirectory, fileName);
  const style = normalizeStyle(input.style);
  const doc = new Document({
    background: {
      color: style.backgroundColor
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: inchesToTwip(style.pageMargins.top),
              right: inchesToTwip(style.pageMargins.right),
              bottom: inchesToTwip(style.pageMargins.bottom),
              left: inchesToTwip(style.pageMargins.left)
            }
          }
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: input.profileName, bold: true, size: pointsToHalfPoints(style.nameFontSize), font: style.fontFamily, color: style.headingColor })]
          }),
          new Paragraph({
            children: [new TextRun({ text: input.contactLine, size: pointsToHalfPoints(style.bodyFontSize), font: style.fontFamily, color: style.bodyTextColor })]
          }),
          ...formatResumeLines(input.resumeText, style)
        ]
      }
    ]
  });

  await fs.writeFile(filePath, await Packer.toBuffer(doc));
  return { fileName, filePath };
}

export interface ResumeDocxStyle {
  pageMargins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  nameFontSize: number;
  bodyFontSize: number;
  fontFamily: string;
  backgroundColor: string;
  bodyTextColor: string;
  headingColor: string;
}

type ResumeSection = "summary" | "experience" | "skills" | "education" | "unknown";

const noSpacing = { before: 0, after: 0 };

function formatResumeLines(resumeText: string, style: ResumeDocxStyle) {
  let section: ResumeSection = "unknown";
  let educationLineIndex = 0;

  return resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (isHeading(line)) {
        section = sectionFromHeading(line);
        educationLineIndex = 0;
        return formatResumeLine(line, style, section, educationLineIndex);
      }

      const paragraphs = formatResumeLine(line, style, section, educationLineIndex);
      if (section === "education") educationLineIndex += 1;
      return paragraphs;
    });
}

function formatResumeLine(line: string, style: ResumeDocxStyle, section: ResumeSection, sectionLineIndex: number) {
  const trimmed = line.trim();
  if (isHeading(trimmed)) {
    return [
      new Paragraph({
        spacing: { before: 220, after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "777777" }
        },
        children: [
          new TextRun({
            text: displayHeading(trimmed).toUpperCase(),
            bold: true,
            size: pointsToHalfPoints(style.bodyFontSize + 1),
            font: style.fontFamily,
            color: style.headingColor
          })
        ]
      })
    ];
  }

  if (section === "education") {
    const clean = stripBullet(trimmed);
    const parts = clean.split(/\s+\|\s+|\s+–\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    const [primary, ...details] = parts;
    const isInstitution = sectionLineIndex === 0 || isEducationInstitutionLine(primary || clean);
    return [
      new Paragraph({
        spacing: noSpacing,
        indent: isInstitution ? undefined : { left: 360 },
        children: [
          new TextRun({
            text: primary || clean,
            bold: isInstitution,
            size: pointsToHalfPoints(isInstitution ? style.bodyFontSize + 0.5 : style.bodyFontSize),
            font: style.fontFamily,
            color: isInstitution ? style.headingColor : style.bodyTextColor
          }),
          new TextRun({
            text: details.length ? ` | ${details.join(" | ")}` : "",
            size: pointsToHalfPoints(style.bodyFontSize),
            font: style.fontFamily,
            color: style.bodyTextColor
          })
        ]
      })
    ];
  }

  const skillCandidate = stripBullet(trimmed);
  if (section === "skills" && isSkillLine(skillCandidate)) {
    const [label, ...rest] = skillCandidate.split(":");
    return [
      new Paragraph({
        spacing: noSpacing,
        children: [
          new TextRun({ text: `${label}:`, bold: true, size: pointsToHalfPoints(style.bodyFontSize), font: style.fontFamily, color: style.headingColor }),
          new TextRun({ text: rest.length ? ` ${rest.join(":").trim()}` : "", size: pointsToHalfPoints(style.bodyFontSize), font: style.fontFamily, color: style.bodyTextColor })
        ]
      })
    ];
  }

  if (isBullet(trimmed)) {
    return [
      new Paragraph({
        bullet: { level: 0 },
        spacing: noSpacing,
        children: [new TextRun({ text: stripBullet(trimmed), size: pointsToHalfPoints(style.bodyFontSize), font: style.fontFamily, color: style.bodyTextColor })]
      })
    ];
  }

  if (section === "experience" && !isBullet(trimmed)) {
    return formatExperienceHeader(trimmed, style);
  }

  return [
    new Paragraph({
      spacing: noSpacing,
      children: [
        new TextRun({
          text: trimmed,
          bold: isExperienceHeader(trimmed),
          size: pointsToHalfPoints(isExperienceHeader(trimmed) ? style.bodyFontSize + 0.5 : style.bodyFontSize),
          font: style.fontFamily,
          color: isExperienceHeader(trimmed) ? style.headingColor : style.bodyTextColor
        })
      ]
    })
  ];
}

function formatExperienceHeader(line: string, style: ResumeDocxStyle) {
  if (line.includes("@")) {
    const [title, ...companyParts] = line.split("@");
    const companyAndMeta = splitCompanyAndMeta(companyParts.join("@").trim());
    return [
      new Paragraph({
        spacing: { before: 80, after: 0 },
        children: [
          new TextRun({ text: `${title.trim()} @ `, bold: true, size: pointsToHalfPoints(style.bodyFontSize + 0.5), font: style.fontFamily, color: style.headingColor }),
          new TextRun({ text: companyAndMeta.company, bold: true, size: pointsToHalfPoints(style.bodyFontSize + 0.5), font: style.fontFamily, color: style.headingColor }),
          new TextRun({ text: companyAndMeta.meta ? ` ${companyAndMeta.meta}` : "", size: pointsToHalfPoints(style.bodyFontSize), font: style.fontFamily, color: style.bodyTextColor })
        ]
      })
    ];
  }

  const isCompany = isExperienceCompanyLine(line);
  return [
    new Paragraph({
      spacing: { before: isCompany ? 80 : 0, after: 0 },
      children: [
        new TextRun({
          text: line,
          bold: isCompany || isExperienceHeader(line),
          size: pointsToHalfPoints(isCompany || isExperienceHeader(line) ? style.bodyFontSize + 0.5 : style.bodyFontSize),
          font: style.fontFamily,
          color: isCompany || isExperienceHeader(line) ? style.headingColor : style.bodyTextColor
        })
      ]
    })
  ];
}

function normalizeStyle(style?: ResumeDocxStyle): ResumeDocxStyle {
  return {
    pageMargins: {
      top: clamp(style?.pageMargins.top ?? 0.5, 0.1, 2),
      right: clamp(style?.pageMargins.right ?? 0.5, 0.1, 2),
      bottom: clamp(style?.pageMargins.bottom ?? 0.5, 0.1, 2),
      left: clamp(style?.pageMargins.left ?? 0.5, 0.1, 2)
    },
    nameFontSize: clamp(style?.nameFontSize ?? 14, 10, 28),
    bodyFontSize: clamp(style?.bodyFontSize ?? 10, 8, 14),
    fontFamily: style?.fontFamily || "Calibri",
    backgroundColor: normalizeColor(style?.backgroundColor ?? "FFFFFF"),
    bodyTextColor: normalizeColor(style?.bodyTextColor ?? "222222"),
    headingColor: normalizeColor(style?.headingColor ?? "111111")
  };
}

function pointsToHalfPoints(value: number) {
  return Math.round(value * 2);
}

function inchesToTwip(value: number) {
  return Math.round(value * 1440);
}

function normalizeColor(value: string) {
  return value.replace("#", "").toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isHeading(line: string) {
  return ["professional summary", "professional experience", "technical skills", "skills", "experience", "summary", "education"].includes(normalizeHeading(line));
}

function displayHeading(line: string) {
  const normalized = normalizeHeading(line);
  if (normalized === "summary") return "Professional Summary";
  if (normalized === "experience") return "Professional Experience";
  if (normalized === "skills") return "Technical Skills";
  return line;
}

function normalizeHeading(line: string) {
  return line.trim().toLowerCase().replace(/[:：]$/, "");
}

function sectionFromHeading(line: string): ResumeSection {
  const heading = normalizeHeading(line);
  if (heading.includes("summary") || heading === "profile") return "summary";
  if (heading.includes("experience")) return "experience";
  if (heading.includes("skill") || heading === "core competencies") return "skills";
  if (heading === "education") return "education";
  return "unknown";
}

function isBullet(line: string) {
  return /^[•\-\–\*]\s*/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^[•\-\–\*]\s*/, "").trim();
}

function isSkillLine(line: string) {
  return /^(Languages?|Frameworks?|Cloud|DevOps|Data\s*&\s*AI|Databases?|Tools?|Architecture):/i.test(line);
}

function isEducationInstitutionLine(line: string) {
  return /\b(university|college|school|institute)\b/i.test(line);
}

function isExperienceHeader(line: string) {
  return line.includes("@") ||
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4}\s*(?:-|–|to)\s*(?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4})\b/i.test(line);
}

function isExperienceCompanyLine(line: string) {
  if (isDateOnly(line)) return false;
  if (/\b(engineer|developer|architect|scientist|analyst|manager|lead|principal|senior|consultant|specialist|director)\b/i.test(line)) return false;
  return /(?:@|\b(?:Inc|LLC|Corp|Corporation|Company|Technologies|Systems|Labs|USA|Group|Solutions|Health|Financial|Bank|Insurance|Retail|Software|MurphyUSA|Wayfair|Humana|WhyLabs|Eccalon)\b)/i.test(line) ||
    (/^[A-Z][A-Za-z0-9&.,' -]{2,}$/.test(line) && line.split(/\s+/).length <= 5);
}

function splitCompanyAndMeta(value: string) {
  const match = value.match(/^(.+?)(\s+(?:\||-|–)\s+.+)$/);
  return {
    company: (match?.[1] ?? value).trim(),
    meta: (match?.[2] ?? "").trim()
  };
}

function isDateOnly(line: string) {
  return /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4}\s*(?:-|–|to)\s*(?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?\s+\d{4})$/i.test(line.trim());
}

function sanitizeFileName(value: string) {
  return value.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
}

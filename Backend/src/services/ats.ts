export function analyzeResume(jobDescription: string, resumeText: string) {
  const jdTerms = significantTerms(jobDescription);
  const resume = normalize(resumeText);
  const matched = jdTerms.filter((term) => resume.includes(term));
  const missing = jdTerms.filter((term) => !resume.includes(term));
  const score = jdTerms.length ? Math.round((matched.length / jdTerms.length) * 100) : 0;

  return {
    matchScore: score,
    matchedKeywords: matched.slice(0, 40),
    missingKeywords: missing.slice(0, 40),
    sectionScores: [
      { title: "Summary", score },
      { title: "Experience", score },
      { title: "Skills", score }
    ],
    weakAreas: missing.slice(0, 8).map((term) => `Consider adding ${term} if truthful.`)
  };
}

function significantTerms(value: string) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "you", "our", "are", "will", "have", "job", "role"]);
  return [...new Set(normalize(value).split(" ").filter((term) => term.length > 3 && !stop.has(term)))].slice(0, 120);
}

function normalize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9+#.]+/g).filter(Boolean).join(" ");
}


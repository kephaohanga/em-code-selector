// extract-mdm.js
// Stage 2 of the E/M selector: keyword/regex extraction with confidence
// AND a "reason" for every result.
//
// When confident: reason = the actual phrase that triggered the level
// (an audit trail — this is the evidence a coder can check against the note).
// When NOT confident: reason = a short, specific checklist of what CMS
// language would justify a higher level, so the coder knows exactly what
// to look for instead of re-reading the whole note guessing.

// ---- Problems (COPA) ----
const HIGH_PROBLEM_RE = /threat to|life-threaten|impend|airway compromise|\brapid/i;
const MODERATE_PROBLEM_RE = /exacerbat|worsen|progress|increas|undiagnosed/i;
const LOW_PROBLEM_RE = /\bstable\b|well-controlled|\bchronic\b/i;
const STRAIGHTFORWARD_PROBLEM_RE = /\bminor\b|self-limited|\bsmall\b|resolving|\bresolved\b/i;

const CONTINGENCY_SENTENCE_RE = /\b(Return|Follow up)\b[^.]*\./gi;

const PROBLEMS_LOW_CONFIDENCE_HINT =
  "No complexity language detected. Check the note for: 2+ conditions addressed in one visit (at least Low; 2+ CHRONIC conditions = Moderate), a worsening/flaring/exacerbating condition (Moderate), a new or undiagnosed problem with uncertain cause (Moderate), or any threat to life, limb, or organ function (High).";

function extractProblemsLevelWithConfidence(noteText) {
  const clinicalText = noteText.replace(CONTINGENCY_SENTENCE_RE, '');

  let m;
  if ((m = clinicalText.match(HIGH_PROBLEM_RE)))
    return { level: "high", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = clinicalText.match(MODERATE_PROBLEM_RE)))
    return { level: "moderate", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = clinicalText.match(LOW_PROBLEM_RE)))
    return { level: "low", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = clinicalText.match(STRAIGHTFORWARD_PROBLEM_RE)))
    return { level: "straightforward", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };

  return { level: "straightforward", confidence: "low", reason: PROBLEMS_LOW_CONFIDENCE_HINT };
}
function extractProblemsLevel(noteText) {
  return extractProblemsLevelWithConfidence(noteText).level;
}

// ---- Data ----
const DATA_SECTION_RE = /Data Reviewed\/Ordered:\s*([\s\S]*?)\n(?:[A-Z][a-zA-Z]*:)/;
const ORDERED_RE = /\border(ed|ing|s)?\b|\bobtain(ed)?\b|will be considered|\brequested\b/i;
const REVIEWED_RE = /\breview(ed)?\b|\bresults?\b|\blabs\b/i;
const DISCUSSION_RE = /physician contacted|contacted regarding|\bconsultation\b|consulted with|discussed with dr/i;
const HISTORIAN_RE = /independent historian|family member reports|caregiver reports/i;

const DATA_LOW_CONFIDENCE_HINT =
  "No test-ordering, test-review, or provider-discussion language detected. Check the note for: any test ordered or reviewed (1-2 = Limited, 3+ = Moderate), review of an outside note/record, an independent historian, or discussion of the case with another physician/QHP (Moderate on its own, regardless of how it's phrased \u2014 e.g. 'spoke with,' 'called,' not just 'discussed with').";

function pointsToLevel(category1Points, hasHistorian, hasDiscussion) {
  if (hasDiscussion) return category1Points >= 3 ? "extensive" : "moderate";
  if (category1Points >= 3) return "moderate";
  if (category1Points >= 1 || hasHistorian) return "limited";
  return "minimal";
}

function extractDataLevelWithConfidence(noteText) {
  const discussionMatch = noteText.match(DISCUSSION_RE);
  const historianMatch = noteText.match(HISTORIAN_RE);
  const hasDiscussion = !!discussionMatch;
  const hasHistorian = !!historianMatch;
  const sectionMatch = noteText.match(DATA_SECTION_RE);

  if (sectionMatch) {
    const section = sectionMatch[1];
    const reviewMatches = section.match(/\breview(ed)?\b/gi) || [];
    const orderMatches = section.match(/\border(ed|ing|s)?\b/gi) || [];
    const points = reviewMatches.length + orderMatches.length;
    const level = pointsToLevel(points, hasHistorian, hasDiscussion);

    if (points === 0 && !hasDiscussion && !hasHistorian) {
      return { level, confidence: "low", reason: DATA_LOW_CONFIDENCE_HINT };
    }
    const evidence = [...orderMatches, ...reviewMatches, discussionMatch ? discussionMatch[0] : null, historianMatch ? historianMatch[0] : null]
      .filter(Boolean).join('", "');
    return { level, confidence: "high", reason: `Matched clinical language: "${evidence}" (${points} data point(s) counted)` };
  }

  const orderedMatch = noteText.match(ORDERED_RE);
  const reviewedMatch = noteText.match(REVIEWED_RE);
  let categories = 0;
  const evidenceParts = [];
  if (orderedMatch) { categories++; evidenceParts.push(orderedMatch[0]); }
  if (reviewedMatch) { categories++; evidenceParts.push(reviewedMatch[0]); }
  if (hasDiscussion) { categories++; evidenceParts.push(discussionMatch[0]); }
  if (hasHistorian) { categories++; evidenceParts.push(historianMatch[0]); }

  let level;
  if (categories === 0) level = "minimal";
  else if (categories === 1) level = "limited";
  else if (categories === 2) level = "moderate";
  else level = "extensive";

  if (categories === 0) {
    return { level, confidence: "low", reason: DATA_LOW_CONFIDENCE_HINT };
  }
  return { level, confidence: "high", reason: `Matched clinical language: "${evidenceParts.join('", "')}"` };
}
function extractDataLevel(noteText) {
  return extractDataLevelWithConfidence(noteText).level;
}

// ---- Risk ----
const HIGH_RISK_RE = /emergency department|hospital-level|surgical evaluation|surgical consultation|not appropriate for continued outpatient|outpatient management is not appropriate/i;
const MODERATE_RISK_RE = /\d+\/\d+\s?mg|\d+\s?mg\b|prescri/i;
const LOW_RISK_RE = /over-the-counter|\botc\b/i;
const MINIMAL_RISK_RE = /\breassurance\b|no treatment|\bobservation\b/i;

const RISK_LOW_CONFIDENCE_HINT =
  "No treatment-risk language detected. Check the note for: any prescription medication started, continued, or adjusted (Moderate) \u2014 including drug names or dosing mentioned without the word 'prescribe'; a drug class requiring intensive monitoring such as warfarin, insulin titration, or chemotherapy (High, a step above ordinary Rx management); or any decision involving surgery, hospitalization, or transfer to a higher level of care, however it's phrased (e.g. 'sent to ED,' 'transported via EMS') (High).";

function extractRiskLevelWithConfidence(noteText) {
  let m;
  if ((m = noteText.match(HIGH_RISK_RE)))
    return { level: "high", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = noteText.match(MODERATE_RISK_RE)))
    return { level: "moderate", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = noteText.match(LOW_RISK_RE)))
    return { level: "low", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };
  if ((m = noteText.match(MINIMAL_RISK_RE)))
    return { level: "minimal", confidence: "high", reason: `Matched clinical language: "${m[0]}"` };

  return { level: "minimal", confidence: "low", reason: RISK_LOW_CONFIDENCE_HINT };
}
function extractRiskLevel(noteText) {
  return extractRiskLevelWithConfidence(noteText).level;
}

// ---- Combined ----
function extractMDM(noteText) {
  const problems = extractProblemsLevelWithConfidence(noteText);
  const data = extractDataLevelWithConfidence(noteText);
  const risk = extractRiskLevelWithConfidence(noteText);

  return {
    problemsLevel: problems.level,
    dataLevel: data.level,
    riskLevel: risk.level,
    confidence: {
      problems: problems.confidence,
      data: data.confidence,
      risk: risk.confidence
    },
    reasons: {
      problems: problems.reason,
      data: data.reason,
      risk: risk.reason
    },
    needsManualReview: [problems, data, risk].some(r => r.confidence === "low")
  };
}

module.exports = {
  extractMDM,
  extractProblemsLevel,
  extractDataLevel,
  extractRiskLevel,
  extractProblemsLevelWithConfidence,
  extractDataLevelWithConfidence,
  extractRiskLevelWithConfidence
};

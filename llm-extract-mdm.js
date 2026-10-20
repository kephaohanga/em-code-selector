// llm-extract-mdm.js
// Stage 3 of the E/M selector: LLM-based extraction via the Claude API.
// Same output shape as extract-mdm.js's extractMDM() on purpose, so it can
// be dropped into scoreMDM() and graded against the same fixture files —
// this is the direct comparison against the keyword/regex approach.

require('dotenv').config();
const fs = require('fs');
const grid = JSON.parse(fs.readFileSync('./mdm-grid.json', 'utf8'));

function buildPrompt(noteText) {
  return `You are assisting a certified medical coder in applying CMS 2021+ Evaluation & Management (E/M) Medical Decision Making (MDM) criteria to an office visit note.

Determine the level for each of the three MDM elements, based ONLY on what is explicitly or clearly implicitly documented in the note. Do not assume information that isn't there.

IMPORTANT — evaluate Problems, Data, and Risk as three INDEPENDENT judgments. A medication or treatment's inherent risk level (e.g., a drug requiring intensive monitoring) affects ONLY the Risk element. It must NEVER be used to raise the Problems level. Problems is about how complex or severe the underlying condition/diagnosis itself is — not about how risky its treatment happens to be. A single stable chronic condition remains Low-complexity Problems even if the medication used to manage it is High risk; these are two separate columns in the CMS grid, judged independently, and a high value in one column never pulls the other column up with it.

PROBLEMS (COPA) — possible levels: straightforward, low, moderate, high
- straightforward: ${grid.problems.straightforward.label}
- low: ${grid.problems.low.label}
- moderate: ${grid.problems.moderate.label}
- high: ${grid.problems.high.label}
IMPORTANT — count distinct conditions literally: if the note addresses 2 OR MORE separate chronic conditions in the same visit, that alone is Moderate, even if each individual condition is described as "stable" or "controlled." Do not let the word "stable" alone pull a multi-condition visit down to Low.
IMPORTANT — a genuinely CHRONIC condition (ongoing, actively managed over time — e.g. "chronic," "long-term," or returning for "follow-up" of an established diagnosis) is AT LEAST Low complexity, even when currently well-controlled, mild, or causing minimal symptoms right now. Do NOT classify a chronic condition as Straightforward just because it's quiet at this visit. Straightforward is reserved ONLY for problems that are truly self-limited — will resolve on their own with no ongoing management, such as a minor injury, a resolving ulcer, or a one-time acute issue with no chronic component. A chronic diagnosis being actively followed and managed is never Straightforward, no matter how stable it currently is.
IMPORTANT — an undiagnosed new problem with uncertain prognosis (e.g. an incidental finding pending further workup, a new symptom without a confirmed cause yet, something described as "favor benign" or "likely X" but not yet confirmed) is Moderate, not Low — even if the patient is currently asymptomatic and the finding seems reassuring. What matters is that the cause/significance is NOT YET CONFIRMED and further workup is planned. Low is reserved for problems whose diagnosis is already clear and straightforward to manage (e.g. a simple sprain, an uncomplicated UTI) — not for something still being worked up to find out what it is.
IMPORTANT — an acute illness accompanied by genuine SYSTEMIC symptoms (e.g. fever plus multiple whole-body complaints like fatigue, malaise, poor appetite, generalized body aches — not just one isolated local symptom) is Moderate, not Low, even if it ends up being managed conservatively with OTC/supportive care. Low is reserved for acute illnesses that are uncomplicated and localized to one area with no systemic involvement (e.g. simple pharyngitis with no fever and no other body-wide symptoms).

DATA — possible levels: minimal, limited, moderate, extensive
- minimal: ${grid.data.minimal.label}
- limited: ${grid.data.limited.label}
- moderate: ${grid.data.moderate.label}
- extensive: ${grid.data.extensive.label}
IMPORTANT — what does NOT count as Data: the physical exam, the history of present illness, patient-reported symptoms, and routine vital signs are NEVER Data elements, no matter how detailed. They are a routine, separate part of every visit. Data ONLY counts one of these specific actions, grouped into three categories:
  CATEGORY GROUP A (combine and count individually): (1) ordering a unique test, (2) reviewing the result of a unique test, (3) reviewing a unique prior note/record from an external source, (4) using an independent historian.
  CATEGORY GROUP B: (5) independently interpreting a test image/tracing yourself (not just reading someone else's report).
  CATEGORY GROUP C: (6) discussing management or test interpretation with an external physician/QHP.
  A LIVE CONVERSATION (in person, by phone, by message) with an external physician/QHP about the case is ALWAYS Group C, never Group A — even if the conversation happens to mention or reference a test result. The distinguishing question is: did the coder read a written record themselves (Group A, action 3), or did they talk to another provider about the case (Group C, action 6)? "Spoke with Dr. X by phone about the finding" is Group C. "Reviewed Dr. X's written note" is Group A. Do not reclassify a documented conversation with another physician as a Group A record review.
Levels: Minimal = none of the above documented. Limited = 1-2 total actions from Group A only. Moderate = EITHER 3+ actions from Group A alone, OR any single action from Group B, OR any single action from Group C (each of those three groups can reach Moderate on its own). Extensive = actions from TWO DIFFERENT groups at once (e.g., 3+ Group A actions AND ALSO a Group C discussion) — piling up more actions within Group A alone, no matter how many, stays at Moderate and never reaches Extensive by itself.

RISK — possible levels: minimal, low, moderate, high
- minimal: ${grid.risk.minimal.label}
- low: ${grid.risk.low.label}
- moderate: ${grid.risk.moderate.label}
- high: ${grid.risk.high.label}
IMPORTANT — Risk is about the inherent risk of the management decision itself, NOT how stable or well the patient currently appears. Apply these rules mechanically:
- ANY new, continued, or adjusted PRESCRIPTION medication = at least Moderate risk, even if the patient is stable and the visit is routine. A "routine refill" of a prescription drug is still prescription drug management = Moderate, not Low or Minimal.
- Drug classes that require intensive monitoring for toxicity — for example warfarin, insulin being titrated, chemotherapy, lithium, or other anticoagulants/immunosuppressants — are High risk specifically, a step above ordinary prescription management, REGARDLESS of how well-controlled the patient currently is on that drug.
- MINIMAL risk = no active management decision is being made — the plan is pure monitoring, reassurance, watchful waiting, or "await workup results," with no medication (not even OTC) and no procedure being started at this visit. A diagnostic test being ordered or pending does not change this — see the diagnostic-ordering rule below.
- LOW risk = a real, if low-stakes, management action IS happening now — for example an OTC medication being recommended or continued, a minor procedure, or a PT/OT referral. If you cannot point to a specific management action beyond monitoring/reassurance, it is Minimal, not Low.
- A decision to send the patient to the ED, hospitalize, or pursue emergency/major surgery = High risk regardless of how it is phrased (abbreviations like "sent to ED" or "EMS" still count).
- Ordering or reviewing a diagnostic test (labs, imaging, EKG, echocardiogram, etc.) on its own is a DATA action, NOT a Risk trigger. Do not raise Risk to Moderate or higher just because a test was ordered. Risk is about treatment/management decisions — a purely diagnostic order with no accompanying medication change or higher-level-of-care decision stays at whatever level the rest of the management plan supports (often Low or Minimal), even when the underlying condition being investigated is serious.

Note:
"""
${noteText}
"""

Respond with ONLY valid JSON in exactly this shape — no markdown code fences, no commentary before or after:
{
  "problemsLevel": "straightforward|low|moderate|high",
  "dataLevel": "minimal|limited|moderate|extensive",
  "riskLevel": "minimal|low|moderate|high",
  "confidence": {"problems": "high|low", "data": "high|low", "risk": "high|low"},
  "reasons": {"problems": "one short sentence citing the specific phrase(s) in the note that justify this level", "data": "one short sentence naming which specific Data action(s) apply and which group(s) they fall in (A, B, or C), or stating none apply", "risk": "one short sentence naming the specific medication/decision and which Risk rule above it matches"}
}

Mark confidence "low" for any element where the note doesn't clearly document that element and you are inferring rather than reading an explicit statement.`;
}

async function extractMDMviaLLM(noteText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("No API key found. Check .env exists and contains ANTHROPIC_API_KEY=...");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: "user", content: buildPrompt(noteText) }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API call failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text.trim();

  // Defensive: strip markdown code fences in case the model adds them
  // despite being told not to.
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse LLM response as JSON: ${err.message}\nRaw response was:\n${rawText}`);
  }

  parsed.needsManualReview = [
    parsed.confidence.problems,
    parsed.confidence.data,
    parsed.confidence.risk
  ].some(c => c === "low");

  return parsed;
}

module.exports = { extractMDMviaLLM };

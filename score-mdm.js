// score-mdm.js
// Stage 1 of the E/M selector: scoring engine only.
// Takes manually-entered element levels (not yet extracted from note text)
// and returns the recommended code + the reasoning behind it.
// Extraction-from-text is a separate, later layer — this file's whole job
// right now is to prove the CMS grid logic itself is correct.

const fs = require('fs');
const grid = JSON.parse(fs.readFileSync('./mdm-grid.json', 'utf8'));

const LEVEL_ORDER = grid.levelOrder; // ["straightforward","low","moderate","high"] — used for problems & final code level
const DATA_LEVEL_ORDER = ["minimal", "limited", "moderate", "extensive"]; // data's own 4-step scale
const RISK_LEVEL_ORDER = ["minimal", "low", "moderate", "high"]; // risk's own 4-step scale (different wording than problems, same position meaning)

function levelIndex(order, level) {
  const idx = order.indexOf(level);
  if (idx === -1) throw new Error(`Unknown level: ${level}`);
  return idx;
}

// MDM rule: 2 of 3 elements must MEET OR EXCEED a given level for that
// level to apply. Data uses its own 4-step scale but maps 1:1 onto the
// same straightforward/low/moderate/high positions as problems and risk.
function determineMDMLevel({ problemsLevel, dataLevel, riskLevel }) {
  const pIdx = levelIndex(LEVEL_ORDER, problemsLevel);
  const dIdx = levelIndex(DATA_LEVEL_ORDER, dataLevel); // same 0-3 positions
  const rIdx = levelIndex(RISK_LEVEL_ORDER, riskLevel); // same 0-3 positions, different wording

  // Walk from highest level down to lowest; first level where at least
  // 2 of the 3 indices are >= that level's index wins.
  for (let target = LEVEL_ORDER.length - 1; target >= 0; target--) {
    const metCount = [pIdx, dIdx, rIdx].filter(i => i >= target).length;
    if (metCount >= 2) {
      return {
        level: LEVEL_ORDER[target],
        detail: {
          problems: { level: problemsLevel, met: pIdx >= target },
          data: { level: dataLevel, met: dIdx >= target },
          risk: { level: riskLevel, met: rIdx >= target }
        }
      };
    }
  }
  // Should never fall through, but default safe floor:
  return { level: "straightforward", detail: null };
}

// Time rule: find which code's [min,max] band the total time falls into,
// restricted to the patient's new/established code family.
function determineTimeLevel({ patientType, totalTimeMinutes }) {
  if (totalTimeMinutes == null) return null;

  const candidateCodes = Object.values(grid.codeMapping).map(
    m => m[patientType]
  );

  for (const code of candidateCodes) {
    const band = grid.timeThresholdsMinutes[code];
    if (totalTimeMinutes >= band.min && totalTimeMinutes <= band.max) {
      // find which MDM-level label this code corresponds to
      const level = Object.keys(grid.codeMapping).find(
        lvl => grid.codeMapping[lvl][patientType] === code
      );
      return { level, code, band };
    }
  }
  return null; // time given but outside all bands (e.g. too short, or needs 99417 prolonged-service add-on)
}

function higherLevel(levelA, levelB) {
  if (!levelA) return levelB;
  if (!levelB) return levelA;
  return levelIndex(LEVEL_ORDER, levelA) >= levelIndex(LEVEL_ORDER, levelB)
    ? levelA
    : levelB;
}

function scoreMDM({ patientType, problemsLevel, dataLevel, riskLevel, totalTimeMinutes }) {
  if (!["new", "established"].includes(patientType)) {
    throw new Error('patientType must be "new" or "established"');
  }

  const mdmResult = determineMDMLevel({ problemsLevel, dataLevel, riskLevel });
  const timeResult = determineTimeLevel({ patientType, totalTimeMinutes });

  const finalLevel = higherLevel(mdmResult.level, timeResult ? timeResult.level : null);
  const finalCode = grid.codeMapping[finalLevel][patientType];

  const method = (timeResult && timeResult.level === finalLevel && finalLevel !== mdmResult.level)
    ? "time"
    : "mdm";

  const reasoning = method === "mdm"
    ? `MDM = ${finalLevel} (2 of 3 elements met: ` +
      `problems=${mdmResult.detail.problems.level}, ` +
      `data=${mdmResult.detail.data.level}, ` +
      `risk=${mdmResult.detail.risk.level})`
    : `Total time ${totalTimeMinutes} min falls in the ${finalCode} band ` +
      `(${timeResult.band.min}-${timeResult.band.max} min), which exceeds the MDM-based level (${mdmResult.level})`;

  return {
    recommendedCode: finalCode,
    method,
    mdmLevel: mdmResult.level,
    timeLevel: timeResult ? timeResult.level : null,
    reasoning
  };
}

// ---- Hand-crafted test cases (known correct answers, per the plan) ----
if (require.main === module) {
  const testCases = [
    {
      name: "New patient, simple sprain, no meds",
      input: { patientType: "new", problemsLevel: "straightforward", dataLevel: "minimal", riskLevel: "minimal" },
      expected: "99202"
    },
    {
      name: "New patient, one stable chronic condition, OTC only",
      input: { patientType: "new", problemsLevel: "low", dataLevel: "limited", riskLevel: "low" },
      expected: "99203"
    },
    {
      name: "New patient, undiagnosed new problem, labs ordered, Rx started",
      input: { patientType: "new", problemsLevel: "moderate", dataLevel: "moderate", riskLevel: "moderate" },
      expected: "99204"
    },
    {
      name: "New patient, limb-threatening injury, ER-level risk",
      input: { patientType: "new", problemsLevel: "high", dataLevel: "extensive", riskLevel: "high" },
      expected: "99205"
    },
    {
      name: "Established, simple recheck, healing on schedule",
      input: { patientType: "established", problemsLevel: "straightforward", dataLevel: "minimal", riskLevel: "minimal" },
      expected: "99212"
    },
    {
      name: "Established, two stable chronic conditions, Rx management",
      input: { patientType: "established", problemsLevel: "moderate", dataLevel: "limited", riskLevel: "moderate" },
      expected: "99214"
    },
    {
      name: "Established patient, MDM says low, but time says 45 min -> should escalate",
      input: { patientType: "established", problemsLevel: "low", dataLevel: "limited", riskLevel: "low", totalTimeMinutes: 45 },
      expected: "99215" // 45 min falls in 99215's 40-54 band, higher than MDM's 99213
    }
  ];

  let pass = 0;
  for (const tc of testCases) {
    const result = scoreMDM(tc.input);
    const ok = result.recommendedCode === tc.expected;
    pass += ok ? 1 : 0;
    console.log(`${ok ? "PASS" : "FAIL"} — ${tc.name}`);
    console.log(`   expected ${tc.expected}, got ${result.recommendedCode} (via ${result.method})`);
    console.log(`   reason: ${result.reasoning}`);
  }
  console.log(`\n${pass}/${testCases.length} test cases passed`);
}

module.exports = { scoreMDM };

const fs = require('fs');
const { extractMDM } = require('./extract-mdm.js');
const { scoreMDM } = require('./score-mdm.js');

// Accepts an optional fixture file path as a command-line argument, e.g.:
//   node test-extraction.js stress-fixtures.json
// Defaults to note-fixtures.json if none given.
// A third argument, --evidence, also prints the matched phrase behind
// every HIGH-confidence result, not just the low-confidence hints —
// like clicking to expand "why" on a result that's already trusted.
const fixtureFile = process.argv[2] || 'note-fixtures.json';
const showEvidence = process.argv[3] === '--evidence';
const fixtures = JSON.parse(fs.readFileSync(`./${fixtureFile}`, 'utf8'));

console.log(`Grading against: ${fixtureFile}\n`);

let problemsCorrect = 0, dataCorrect = 0, riskCorrect = 0, codeCorrect = 0, flaggedForReview = 0;

console.log('Extraction results per note:\n');

for (const fx of fixtures) {
  const extracted = extractMDM(fx.noteText);

  const pOK = extracted.problemsLevel === fx.expectedLevels.problems;
  const dOK = extracted.dataLevel === fx.expectedLevels.data;
  const rOK = extracted.riskLevel === fx.expectedLevels.risk;

  problemsCorrect += pOK ? 1 : 0;
  dataCorrect += dOK ? 1 : 0;
  riskCorrect += rOK ? 1 : 0;
  if (extracted.needsManualReview) flaggedForReview++;

  const scored = scoreMDM({
    patientType: fx.patientType,
    problemsLevel: extracted.problemsLevel,
    dataLevel: extracted.dataLevel,
    riskLevel: extracted.riskLevel
  });
  const codeOK = scored.recommendedCode === fx.expectedCode;
  codeCorrect += codeOK ? 1 : 0;

  console.log(`${fx.id}  (expected code: ${fx.expectedCode})${extracted.needsManualReview ? "  [FLAGGED FOR REVIEW]" : ""}`);
  console.log(`  problems: got=${extracted.problemsLevel.padEnd(14)} expected=${fx.expectedLevels.problems.padEnd(14)} confidence=${extracted.confidence.problems.padEnd(5)} ${pOK ? "OK" : "MISS"}`);
  if (extracted.confidence.problems === "low" || showEvidence) console.log(`    -> ${extracted.reasons.problems}`);
  console.log(`  data:     got=${extracted.dataLevel.padEnd(14)} expected=${fx.expectedLevels.data.padEnd(14)} confidence=${extracted.confidence.data.padEnd(5)} ${dOK ? "OK" : "MISS"}`);
  if (extracted.confidence.data === "low" || showEvidence) console.log(`    -> ${extracted.reasons.data}`);
  console.log(`  risk:     got=${extracted.riskLevel.padEnd(14)} expected=${fx.expectedLevels.risk.padEnd(14)} confidence=${extracted.confidence.risk.padEnd(5)} ${rOK ? "OK" : "MISS"}`);
  if (extracted.confidence.risk === "low" || showEvidence) console.log(`    -> ${extracted.reasons.risk}`);
  console.log(`  final code from extracted levels: ${scored.recommendedCode}  ${codeOK ? "CODE CORRECT" : "CODE WRONG"}`);
  console.log('');
}

const n = fixtures.length;
console.log('--- Summary ---');
console.log(`Problems element accuracy: ${problemsCorrect}/${n}`);
console.log(`Data element accuracy:     ${dataCorrect}/${n}`);
console.log(`Risk element accuracy:     ${riskCorrect}/${n}`);
console.log(`Final CODE accuracy:       ${codeCorrect}/${n}  <- the number that actually matters`);
console.log(`Flagged for manual review: ${flaggedForReview}/${n}`);

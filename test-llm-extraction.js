// test-llm-extraction.js
// Same grading logic as test-extraction.js, but using LLM extraction
// (which requires real API calls, so this costs a small amount and needs
// internet access — unlike the regex-based test).
//
// Usage:
//   node test-llm-extraction.js note-fixtures.json
//   node test-llm-extraction.js stress-fixtures.json

const fs = require('fs');
const { extractMDMviaLLM } = require('./llm-extract-mdm.js');
const { scoreMDM } = require('./score-mdm.js');

const fixtureFile = process.argv[2] || 'note-fixtures.json';
const fixtures = JSON.parse(fs.readFileSync(`./${fixtureFile}`, 'utf8'));

async function run() {
  console.log(`Grading LLM extraction against: ${fixtureFile}\n`);

  let problemsCorrect = 0, dataCorrect = 0, riskCorrect = 0, codeCorrect = 0, flagged = 0, errors = 0;

  for (const fx of fixtures) {
    let extracted;
    try {
      extracted = await extractMDMviaLLM(fx.noteText);
    } catch (err) {
      console.log(`${fx.id}: ERROR — ${err.message}\n`);
      errors++;
      continue;
    }

    const pOK = extracted.problemsLevel === fx.expectedLevels.problems;
    const dOK = extracted.dataLevel === fx.expectedLevels.data;
    const rOK = extracted.riskLevel === fx.expectedLevels.risk;

    problemsCorrect += pOK ? 1 : 0;
    dataCorrect += dOK ? 1 : 0;
    riskCorrect += rOK ? 1 : 0;
    if (extracted.needsManualReview) flagged++;

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
    console.log(`    -> ${extracted.reasons.problems}`);
    console.log(`  data:     got=${extracted.dataLevel.padEnd(14)} expected=${fx.expectedLevels.data.padEnd(14)} confidence=${extracted.confidence.data.padEnd(5)} ${dOK ? "OK" : "MISS"}`);
    console.log(`    -> ${extracted.reasons.data}`);
    console.log(`  risk:     got=${extracted.riskLevel.padEnd(14)} expected=${fx.expectedLevels.risk.padEnd(14)} confidence=${extracted.confidence.risk.padEnd(5)} ${rOK ? "OK" : "MISS"}`);
    console.log(`    -> ${extracted.reasons.risk}`);
    console.log(`  final code from extracted levels: ${scored.recommendedCode}  ${codeOK ? "CODE CORRECT" : "CODE WRONG"}`);
    console.log('');
  }

  const n = fixtures.length;
  console.log('--- Summary ---');
  console.log(`Problems element accuracy: ${problemsCorrect}/${n}`);
  console.log(`Data element accuracy:     ${dataCorrect}/${n}`);
  console.log(`Risk element accuracy:     ${riskCorrect}/${n}`);
  console.log(`Final CODE accuracy:       ${codeCorrect}/${n}  <- the number that actually matters`);
  console.log(`Flagged for manual review: ${flagged}/${n}`);
  if (errors > 0) console.log(`Errors (skipped):          ${errors}/${n}`);
}

run();

// test-server-integration.js
// Same grading approach as test-llm-extraction.js, but hits the actual
// running server's /analyze endpoint over HTTP instead of calling the
// extraction function directly. This is the stronger test: it exercises
// routing, JSON serialization, and the extraction->scoreMDM wiring exactly
// as the GUI does — so a bug in server.js itself (not just in the
// extractor) would show up here.
//
// Requires: the server must already be running (`node server.js` in
// another terminal) before you run this script.
//
// Usage:
//   node test-server-integration.js note-fixtures.json
//   node test-server-integration.js stress-fixtures.json

const fs = require('fs');

const SERVER_URL = process.env.EM_SELECTOR_URL || 'http://localhost:3000';
const fixtureFile = process.argv[2];

if (!fixtureFile) {
  console.error('Usage: node test-server-integration.js <fixture-file.json>');
  process.exit(1);
}

async function postAnalyze(body) {
  const res = await fetch(`${SERVER_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function runFixtureSuite() {
  const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  console.log(`\nGrading server integration against: ${fixtureFile}`);
  console.log(`Server: ${SERVER_URL}\n`);

  let problemsOk = 0, dataOk = 0, riskOk = 0, codeOk = 0;
  let fallbackCount = 0;

  for (const fx of fixtures) {
    const { status, body } = await postAnalyze({
      noteText: fx.noteText,
      patientType: fx.patientType,
    });

    if (status !== 200) {
      console.log(`${fx.id}  FAILED REQUEST (status ${status}): ${body.error || 'unknown error'}`);
      continue;
    }

    const { extraction, score, extractionMethod, fallbackReason } = body;
    if (extractionMethod === 'regex-fallback') {
      fallbackCount++;
      console.log(`${fx.id}  ⚠ ran via REGEX FALLBACK — LLM call failed: ${fallbackReason}`);
    }

    const pMatch = extraction.problemsLevel === fx.expectedLevels.problems;
    const dMatch = extraction.dataLevel === fx.expectedLevels.data;
    const rMatch = extraction.riskLevel === fx.expectedLevels.risk;
    const cMatch = score.recommendedCode === fx.expectedCode;

    problemsOk += pMatch ? 1 : 0;
    dataOk += dMatch ? 1 : 0;
    riskOk += rMatch ? 1 : 0;
    codeOk += cMatch ? 1 : 0;

    console.log(`${fx.id}  (expected code: ${fx.expectedCode}, via ${extractionMethod})`);
    console.log(`  problems: got=${extraction.problemsLevel.padEnd(14)} expected=${fx.expectedLevels.problems.padEnd(14)} ${pMatch ? 'OK' : 'MISS'}`);
    console.log(`  data:     got=${extraction.dataLevel.padEnd(14)} expected=${fx.expectedLevels.data.padEnd(14)} ${dMatch ? 'OK' : 'MISS'}`);
    console.log(`  risk:     got=${extraction.riskLevel.padEnd(14)} expected=${fx.expectedLevels.risk.padEnd(14)} ${rMatch ? 'OK' : 'MISS'}`);
    console.log(`  final code via /score: ${score.recommendedCode}  ${cMatch ? 'CODE CORRECT' : 'CODE MISS'}\n`);
  }

  console.log('--- Summary ---');
  console.log(`Problems element accuracy: ${problemsOk}/${fixtures.length}`);
  console.log(`Data element accuracy:     ${dataOk}/${fixtures.length}`);
  console.log(`Risk element accuracy:     ${riskOk}/${fixtures.length}`);
  console.log(`Final CODE accuracy:       ${codeOk}/${fixtures.length}  <- the number that actually matters`);
  console.log(`Ran via regex fallback:    ${fallbackCount}/${fixtures.length}  ${fallbackCount > 0 ? '<- investigate why the LLM call failed on these' : ''}`);
}

async function runEdgeCaseChecks() {
  console.log('\n--- Edge case checks ---');

  const cases = [
    { name: 'Empty note text', body: { noteText: '', patientType: 'new' }, expectStatus: 400 },
    { name: 'Missing patientType', body: { noteText: 'Patient seen for follow-up.' }, expectStatus: 400 },
    { name: 'Invalid patientType', body: { noteText: 'Patient seen for follow-up.', patientType: 'toddler' }, expectStatus: 400 },
  ];

  for (const c of cases) {
    const { status } = await postAnalyze(c.body);
    const ok = status === c.expectStatus;
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name}: expected status ${c.expectStatus}, got ${status}`);
  }
}

(async () => {
  try {
    await runFixtureSuite();
    await runEdgeCaseChecks();
  } catch (err) {
    console.error('\nCould not reach the server. Is `node server.js` running in another terminal?');
    console.error(err.message);
    process.exit(1);
  }
})();

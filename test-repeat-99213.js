// test-repeat-99213.js
// Runs the established-99213 note through LLM extraction 3 times in a row,
// to check whether the reasoning/output mismatch we saw last session
// ("reasoning says Low, output field says Straightforward") repeats
// consistently or was a one-off fluke of that single response.

const fs = require('fs');
const { extractMDMviaLLM } = require('./llm-extract-mdm.js');

const fixtures = JSON.parse(fs.readFileSync('./note-fixtures.json', 'utf8'));
const stressFixtures = JSON.parse(fs.readFileSync('./stress-fixtures.json', 'utf8'));
const fx = process.argv[2] === 'ekg'
  ? stressFixtures.find(f => f.id === 'stress-established-ekg')
  : fixtures.find(f => f.id === 'established-99213');

async function run() {
  console.log(`Running ${fx.id} (expected: problems=${fx.expectedLevels.problems}, data=${fx.expectedLevels.data}, risk=${fx.expectedLevels.risk}) three times:\n`);

  for (let i = 1; i <= 3; i++) {
    try {
      const extracted = await extractMDMviaLLM(fx.noteText);
      console.log(`Run ${i}:`);
      console.log(`  problemsLevel: ${extracted.problemsLevel}  -> ${extracted.reasons.problems}`);
      console.log(`  dataLevel:     ${extracted.dataLevel}  -> ${extracted.reasons.data}`);
      console.log(`  riskLevel:     ${extracted.riskLevel}  -> ${extracted.reasons.risk}`);
      console.log('');
    } catch (err) {
      console.log(`Run ${i}: ERROR — ${err.message}\n`);
    }
  }
}

run();

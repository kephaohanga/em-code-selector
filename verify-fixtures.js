const fs = require('fs');
const { scoreMDM } = require('./score-mdm.js');

const fixtures = JSON.parse(fs.readFileSync('./note-fixtures.json', 'utf8'));

let pass = 0;
for (const fx of fixtures) {
  const result = scoreMDM({
    patientType: fx.patientType,
    problemsLevel: fx.expectedLevels.problems,
    dataLevel: fx.expectedLevels.data,
    riskLevel: fx.expectedLevels.risk
  });
  const ok = result.recommendedCode === fx.expectedCode;
  pass += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"} — ${fx.id}: expected ${fx.expectedCode}, got ${result.recommendedCode}`);
}
console.log(`\n${pass}/${fixtures.length} fixtures verified against scoreMDM`);

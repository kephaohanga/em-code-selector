// server.js
// Express interface for the E/M Code Selector.
// Extraction strategy: LLM leads (llm-extract-mdm.js, proven 16/16 on the
// fixture sets). If the LLM call fails for any reason — missing/invalid
// API key, network error, non-200 response, unparseable JSON — we fall
// back to the regex extractor (extract-mdm.js) rather than failing the
// request outright. The response always tells you which path ran.
//
// Both extractors return the same shape on purpose (see llm-extract-mdm.js
// header comment), so scoreMDM() doesn't need to know or care which one
// produced its input.

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const { extractMDM } = require('./extract-mdm');
const { extractMDMviaLLM } = require('./llm-extract-mdm');
const { scoreMDM } = require('./score-mdm');

const grid = JSON.parse(fs.readFileSync('./mdm-grid.json', 'utf8'));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serves the CMS grid text so the frontend can show level descriptions
// without duplicating them — mdm-grid.json stays the single source of truth.
let sampleNotes = [];
try {
  const noteFixtures = JSON.parse(fs.readFileSync('./note-fixtures.json', 'utf8'));
  sampleNotes = noteFixtures.map(f => ({
    id: f.id,
    patientType: f.patientType,
    expectedCode: f.expectedCode,
    noteText: f.noteText,
  }));
} catch (err) {
  console.warn('note-fixtures.json not found or unreadable — sample note loader will be empty:', err.message);
}

app.get('/samples', (req, res) => {
  res.json(sampleNotes);
});

app.get('/grid', (req, res) => {
  res.json(grid);
});

// Generous bound for a clinical office visit note. Guards against an
// accidental paste of an entire chart or document driving up API cost.
const MAX_NOTE_CHARS = 8000;

app.post('/analyze', async (req, res) => {
  const { noteText, patientType, totalTimeMinutes } = req.body || {};

  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return res.status(400).json({ error: 'noteText is required.' });
  }
  if (noteText.length > MAX_NOTE_CHARS) {
    return res.status(400).json({ error: `Note is ${noteText.length} characters, which exceeds the ${MAX_NOTE_CHARS}-character limit. Trim it and try again.` });
  }
  if (!['new', 'established'].includes(patientType)) {
    return res.status(400).json({ error: 'patientType must be "new" or "established".' });
  }

  let extraction;
  let extractionMethod;
  let fallbackReason = null;

  try {
    extraction = await extractMDMviaLLM(noteText);
    extractionMethod = 'llm';
  } catch (err) {
    console.error('LLM extraction failed, falling back to regex extractor:', err.message);
    extraction = extractMDM(noteText);
    extractionMethod = 'regex-fallback';
    fallbackReason = err.message;
  }

  try {
    const score = scoreMDM({
      patientType,
      problemsLevel: extraction.problemsLevel,
      dataLevel: extraction.dataLevel,
      riskLevel: extraction.riskLevel,
      totalTimeMinutes: totalTimeMinutes != null && totalTimeMinutes !== '' ? Number(totalTimeMinutes) : null,
    });
    res.json({ extractionMethod, fallbackReason, extraction, score });
  } catch (err) {
    res.status(500).json({ error: `Scoring failed: ${err.message}` });
  }
});

// Used whenever the coder overrides an extracted level in the GUI —
// re-scores through the real engine instead of duplicating MDM rules in JS.
app.post('/score', (req, res) => {
  const { patientType, problemsLevel, dataLevel, riskLevel, totalTimeMinutes } = req.body || {};
  try {
    const score = scoreMDM({
      patientType,
      problemsLevel,
      dataLevel,
      riskLevel,
      totalTimeMinutes: totalTimeMinutes != null && totalTimeMinutes !== '' ? Number(totalTimeMinutes) : null,
    });
    res.json({ score });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`EM Code Selector running at http://localhost:${PORT}`);
});

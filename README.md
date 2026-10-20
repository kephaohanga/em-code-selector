# EM Code Selector

  > **Disclaimer:** Demonstration and decision-support tool only; not for production billing. Final code selection rests with a certified coder. All visit notes are synthetic.

A clinical coding decision-support tool that reads an office visit note and recommends the correct Evaluation & Management (E/M) code — 99202–99205 for new patients, 99212–99215 for established patients — based on CMS/AMA 2021+ Medical Decision Making (MDM) criteria.

Built as a portfolio project combining a CPC (Certified Professional Coder) background with an AI-assisted extraction pipeline. It's decision support, not autonomous billing: every extracted MDM element is shown with its supporting evidence and a confidence flag, and stays editable so a coder can confirm or override before anything is signed off.

## What it does

1. You paste an office visit note and pick New or Established patient.
2. The note is sent to Claude, which extracts the three MDM elements — Problems Addressed, Data Reviewed, and Risk of Complications — each with a short quote from the note as evidence and a confidence rating.
3. A deterministic scoring engine applies the actual CMS "2 of 3 elements" rule to those three levels and returns the recommended code.
4. If a total visit time is entered, the tool also checks whether time-based leveling would justify a higher code than MDM does, and uses whichever is higher (per CMS rules).
5. Every extracted level is shown as an editable dropdown with its evidence — a coder can override any of them, and the code recomputes immediately through the same scoring engine.

## Why MDM extraction is LLM-first, not regex-first

An earlier regex/keyword extractor (`extract-mdm.js`) is still in the project, but it's the fallback, not the primary path. Medical necessity language is too varied for pattern matching to hold up: phrases like "spoke with Dr. Patel by phone" (a Data Category 3 discussion) versus "reviewed Dr. Patel's note" (a Category 1 review) turn on meaning, not keywords. The LLM extractor (`llm-extract-mdm.js`) handles that correctly; the regex extractor cannot reliably tell the two apart.

The regex path exists purely as a safety net — if the Claude API call fails for any reason (bad key, network issue, malformed response), the server falls back to it automatically rather than the tool going down entirely. The GUI clearly flags whenever this happens, since the regex path is measurably less accurate.

## Architecture

| File | Role |
|---|---|
| `mdm-grid.json` | The CMS/AMA MDM criteria and code mapping — the single source of truth every other file reads from. |
| `score-mdm.js` | Pure scoring engine. Takes three element levels (+ optional visit time) and returns the recommended code, with no knowledge of how those levels were extracted. |
| `extract-mdm.js` | Regex/keyword extraction. Fallback only. Flags low confidence whenever it can't find clear supporting language. |
| `llm-extract-mdm.js` | Primary extraction, via the Claude API (Haiku). Same output shape as the regex extractor by design, so either can feed `scoreMDM()` interchangeably. |
| `server.js` | Express server. Tries the LLM extractor first, catches failures and falls back to regex, then always scores the result through `score-mdm.js`. Exposes `/analyze`, `/score`, and `/grid`. |
| `public/index.html` | Paste-box GUI. Calls `/analyze`, renders each element as an editable dropdown with evidence and confidence, and re-scores through `/score` on any override. |

The extraction and scoring stages are deliberately decoupled — `scoreMDM()` has no idea whether its input came from the LLM, the regex fallback, or a human overriding a dropdown in the GUI. That separation is what let the regex fallback get added later without touching the scoring logic at all.

## Setup

```bash
npm install express
```

(`dotenv` is already a dependency, used to load `ANTHROPIC_API_KEY` from `.env`.)

Create a `.env` file in the project root if you don't already have one:
```
ANTHROPIC_API_KEY=your_key_here
```

## Running it

```bash
node server.js
```

Then open `http://localhost:3000`. `Ctrl+C` in that terminal stops the server.

## Testing

Two layers of tests, both grading against the same fixture files (`note-fixtures.json`, 8 clean notes; `stress-fixtures.json`, 8 deliberately messy/edge-case notes):

```bash
# Tests the extraction function directly, no server needed
node test-llm-extraction.js note-fixtures.json
node test-llm-extraction.js stress-fixtures.json

# Tests the actual running server over HTTP — requires `node server.js`
# running in a separate terminal first. Exercises the real routing,
# JSON handling, and fallback wiring, not just the extraction function.
node test-server-integration.js note-fixtures.json
node test-server-integration.js stress-fixtures.json
```

**Current accuracy: 16/16 on final code, across both fixture sets, at both the unit level and the full server-integration level.**

## Known limitations

- **MDM only.** The tool evaluates Medical Decision Making; it does not evaluate total-time-based leveling as a first-class path, only as an override check when a time value is supplied.
- **Decision support, not a final answer.** Every result is meant to be reviewed and confirmed by a certified coder against the complete documentation before billing.
- **Not built for real PHI.** This is a portfolio/demonstration project. It has no authentication, encryption at rest, or audit logging — the kind of controls a real clinical tool would need under HIPAA. Don't paste real patient notes into it.
- **The CMS/AMA criteria in `mdm-grid.json` are paraphrased** for this project's structure and should be checked against current official CMS/AMA source documents before any production or compliance use.

## Notable debugging case: the Minimal vs. Low risk boundary

During fixture testing, one stress-test note (`stress-established-ekg` — an incidental EKG finding with an echo ordered and no medication) was consistently scored as Low risk when it should have been Minimal. The extraction prompt's rule at the time read:

> "Only OTC medication, no medication, or reassurance/observation alone = Low or Minimal."

That gave the model two valid outcomes with no rule for choosing between them, and with the note's other two elements both at Moderate, it defaulted upward. The fix was splitting that single ambiguous rule into two mechanical ones: Minimal means no active management decision is happening at all (pure monitoring or reassurance), while Low requires a real, if low-stakes, management action (an OTC recommendation, a minor procedure). That distinction — presence vs. absence of an actual management action, rather than just "how serious does this feel" — resolved the fixture and held up across the rest of the stress set without regressing any of the notes that genuinely are Low risk.

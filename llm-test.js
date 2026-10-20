// llm-test.js
// A minimal sanity check: send ONE note to Claude Haiku and print the raw
// response. The only goal here is to confirm the API key, .env loading,
// and network connection all work — before building real extraction logic
// on top of it.

require('dotenv').config();

async function testCall() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("No API key found. Check that .env exists in this folder and contains ANTHROPIC_API_KEY=...");
    return;
  }

  const noteText = "Chief Complaint: Small sore inside lower lip.\nHPI: New patient presents with a small painless sore of the lower lip noticed 3 days ago after accidentally biting the area. No bleeding, swelling, fever, dysphagia, or other symptoms.\nAssessment: Minor traumatic ulcer of lower lip.\nPlan: Reassurance provided. Recommend avoiding further trauma and observation.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `In one short sentence, what is the E/M Problems (COPA) complexity level (straightforward, low, moderate, or high) for this note, per CMS 2021+ MDM criteria?\n\n${noteText}`
        }
      ]
    })
  });

  if (!response.ok) {
    console.error(`API call failed: ${response.status} ${response.statusText}`);
    const errorBody = await response.text();
    console.error(errorBody);
    return;
  }

  const data = await response.json();
  console.log("Full response object:");
  console.log(JSON.stringify(data, null, 2));
  console.log("\nClaude's answer:");
  console.log(data.content[0].text);
}

testCall();

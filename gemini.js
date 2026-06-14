const fs = require('fs');
const path = require('path');

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const nextEnvPath = path.join(__dirname, 'temp-next-app', 'env.local');
    if (fs.existsSync(nextEnvPath)) {
      const content = fs.readFileSync(nextEnvPath, 'utf8').trim();
      const match = content.match(/(?:GEMINI_API_KEY|API_KEY)?\s*=\s*(.+)/i);
      if (match) return match[1].trim();
      return content;
    }
  } catch (e) {
    console.warn("Could not read API key from env.local", e);
  }
  return null;
}

async function callGemini(prompt, isJson = false) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please check your env.local file.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: isJson ? { responseMimeType: "application/json" } : undefined
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API call failed: ${response.status} - ${errText}`);
  }

  const resJson = await response.json();
  try {
    return resJson.candidates[0].content.parts[0].text;
  } catch (e) {
    console.error("Invalid response format from Gemini", resJson);
    throw new Error("Failed to parse Gemini response content.");
  }
}

module.exports = {
  analyzeText: async (text) => {
    const prompt = `
You are a helpful travel planning assistant. Extract the following details from this raw travel description and return them strictly as a JSON object:
{
  "destination": "Destination name(s) (e.g. 'Kuala Lumpur + Singapore')",
  "days": number_of_days,
  "travelers": "Number of adults/kids and ages (e.g. '2 Adults + 2 Kids (8 & 15 Years)')",
  "attractions": ["List of specific attractions or types of activities (e.g. USS, Petronas Towers)"],
  "food": ["List of food preferences or types of dining (e.g. Street food, high-end, kid-friendly)"],
  "stay": "Stay preferences (e.g. 'Family Suites with kitchenette')"
}
Raw travel description:
"${text}"
`;
    const responseText = await callGemini(prompt, true);
    return JSON.parse(responseText);
  },

  generateItinerary: async (criteria) => {
    const prompt = `
You are a professional travel curator for Passport Raahi, a luxury bespoke travel agency.
Generate a premium, detailed, day-by-day travel itinerary and destination guides matching the exact layout and high quality of our signature itineraries.

Rules:
1. The itinerary must cover exactly ${criteria.days} days.
2. The destination is ${criteria.destination}.
3. The travelers are ${criteria.travelers}.
4. Incorporate the following attractions: ${criteria.attractions.join(', ')}.
5. Incorporate these dining preferences: ${criteria.food.join(', ')}.
6. Stay preference is: ${criteria.stay}.

For each day, provide a title, description, and an array of 2-3 detailed blocks.
Each block MUST represent an event with:
- "type": must be one of "transport", "stay", "dining", or "activity"
- "time": the time of the event (e.g. "11:30 AM", "Check-in", "07:00 PM")
- "title": a premium, specific title for the event (e.g. "Private Mercedes V-Class Transfer", "KLCC Platinum Suites")
- "description": a rich, descriptive paragraph (3-4 sentences) with detailed, practical travel tips, advice, and prices where applicable (e.g. SGD/MYR).
- "details": (Optional) a structured JSON object containing:
    - "address": (Optional) Location address
    - "transport": (Optional) Array of transport options: { "mode", "route", "time", "cost", "recommended" (boolean) }
    - "dishes": (Optional) Array of dishes: { "name", "price", "kids" (suitability note) }
    - "highlights": (Optional) Array of highlights: { "name", "benefit", "time" }
    - "tickets": (Optional) Array of ticket options: { "type", "price", "info" }
    - "must_do": (Optional) Short Do-Not-Miss tip

Also, generate destination guides for each distinct city/destination in the package (e.g. if the destination is "Kuala Lumpur + Singapore", generate a guide for "Kuala Lumpur" and a guide for "Singapore"). Each guide must contain:
- "hotel": The name of the primary hotel/accommodation in this city
- "address": Full hotel address
- "why_stay": Array of 3 bullet points why they stay there
- "metro_stations": Array of nearest metro stations: { "station", "line", "walk", "best_for" }
- "currency": Local currency conversion hint (e.g. "1 MYR ≈ ₹20")
- "sim": SIM card tip (e.g. "Buy at airport...")
- "transport_cheat_sheet": Array of transit cheat sheet items: { "from", "to", "mode", "time", "cost", "why" }

Return the result STRICTLY as a JSON object with this exact structure:
{
  "itinerary": [
    {
      "day": 1,
      "title": "Day 1: Title",
      "description": "General description...",
      "blocks": [
        {
          "type": "transport",
          "time": "11:30 AM",
          "title": "Private Mercedes Transfer",
          "description": "...",
          "details": {
            "transport": [
              { "mode": "Grab", "route": "Direct", "time": "10 min", "cost": "RM 12" }
            ],
            "must_do": "Ensure you book in advance."
          }
        }
      ]
    }
  ],
  "destinationGuides": {
    "Kuala Lumpur": {
      "hotel": "Hotel Name",
      "address": "Address",
      "why_stay": [ "Benefit 1", "Benefit 2", "Benefit 3" ],
      "metro_stations": [
        { "station": "Name", "line": "Line", "walk": "X mins", "best_for": "Destination" }
      ],
      "currency": "Currency hint",
      "sim": "SIM card tip",
      "transport_cheat_sheet": [
        { "from": "Hotel", "to": "Bukit Bintang", "mode": "Monorail", "time": "10 min", "cost": "RM 8", "why": "Avoids traffic" }
      ]
    }
  }
}
`;
    const responseText = await callGemini(prompt, true);
    return JSON.parse(responseText);
  }
};

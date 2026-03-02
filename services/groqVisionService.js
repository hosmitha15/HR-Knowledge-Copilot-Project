const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_TEXT_MODEL = "llama-3.1-8b-instant";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJSON(text) {
  const clean = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Rate-limit-aware Groq caller.
async function callGroqWithRetry(body, maxRetries = 5) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const response = await fetch(GROQ_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (response.ok) return response;

    const errText = await response.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch { errJson = null; }

    const errMsg = errJson?.error?.message || errText || "";
    const isRateLimit =
      errJson?.error?.code === "rate_limit_exceeded" ||
      errMsg.includes("rate_limit_exceeded") ||
      errMsg.includes("Rate limit");

    if (errMsg.includes("Request too large") || errMsg.includes("too large")) {
      console.warn("⚠️ Groq: request too large, skipping this chunk.");
      return null;
    }

    if (!isRateLimit || attempt === maxRetries) {
      console.error(" Groq Error (non-retriable):", errMsg.slice(0, 200));
      return null;
    }

    const waitMatch = errMsg.match(/try again in\s+([\d.]+)s/i);
    const waitSec = waitMatch ? parseFloat(waitMatch[1]) : 15;
    const waitMs = Math.ceil(waitSec * 1000) + 500; // add 500ms buffer

    console.log(`⏳ Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${maxRetries}…`);
    await sleep(waitMs);
    attempt++;
  }
  return null;
}

export const extractStructuredFromImage = async (imageBuffer, mimeType = "image/png") => {
  try {
    const base64Image = imageBuffer.toString("base64");

    const response = await callGroqWithRetry({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an expert document OCR system. Extract ALL text content from this image exactly as it appears. Return ONLY valid JSON:\n\n{\"textBlocks\": [\"each piece of readable text\"], \"tables\": [\"Header1 | Header2\\nVal1 | Val2\"], \"imageDescriptions\": [\"data chart descriptions with values\"]}\n\nCRITICAL RULES:\n1. textBlocks: Extract EVERY readable word exactly as written. For infographics with labeled items (e.g. numbered lists like '10 Elements'), extract EACH item individually with its number, like: \"1. Purpose Statement\", \"2. Scope Of Application\". Do NOT describe the layout — extract the ACTUAL TEXT.\n2. For numbered/bulleted lists: return each item as a separate string in the array.\n3. tables: Extract rows with | separators. Include ALL rows.\n4. imageDescriptions: ONLY for data charts with no text alternative.\n5. Return ONLY JSON. No markdown wrapping.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    });

    if (!response) {
      return { textBlocks: [], tables: [], imageDescriptions: [] };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    console.log("🔍 Groq Vision raw response length:", raw.length, "chars");

    const parsed = safeParseJSON(raw);

    if (!parsed) {
      console.warn("Groq Vision: non-JSON response, saving as text block");
      return {
        textBlocks: raw.trim().length > 20 ? [raw.trim()] : [],
        tables: [],
        imageDescriptions: [],
      };
    }

    const result = {
      textBlocks: (parsed.textBlocks || []).filter((t) => t?.trim().length > 5),
      tables: (parsed.tables || []).filter((t) => t?.trim().length > 10),
      imageDescriptions: (parsed.imageDescriptions || []).filter((t) => t?.trim().length > 10),
    };

    console.log(`📝 Vision extracted: ${result.textBlocks.length} textBlocks, ${result.tables.length} tables, ${result.imageDescriptions.length} descriptions`);
    return result;
  } catch (error) {
    console.error(" Groq Vision Exception:", error.message);
    return { textBlocks: [], tables: [], imageDescriptions: [] };
  }
};


export const extractTablesFromText = async (rawText) => {
  try {
    if (!rawText || rawText.trim().length < 30) return { tables: [], imageDescriptions: [] };

    const allTables = [];
    const WINDOW = 3500;
    const windows = [];
    for (let i = 0; i < rawText.length; i += WINDOW) {
      windows.push(rawText.slice(i, i + WINDOW));
    }

    console.log(` extractTablesFromText: processing ${windows.length} windows (${WINDOW} chars each)…`);

    for (let idx = 0; idx < windows.length; idx++) {
      const window = windows[idx];

      const hasTableHints =
        /(\|\s*\w|\t\w.*\t|\s{3,}\w.*\s{3,}\w|S\.No|Sr\.No|Sl\.No|Name\s+\||\d+\s+\|\s+\d+)/i.test(window);
      if (!hasTableHints) {

        const wordCount = window.split(/\s+/).length;
        const numberCount = (window.match(/\d/g) || []).length;
        if (numberCount / wordCount < 0.05) {
          continue;
        }
      }

      if (idx > 0) {
        await sleep(2000);
      }

      const response = await callGroqWithRetry({
        model: GROQ_TEXT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a document table extractor. Analyze the text and extract ALL tables you can find.
Tables may appear as:
- Space/tab-aligned columns (common in PDFs)
- Pipe-separated columns
- Any structured grid of data with headers

Return ONLY valid JSON (no explanation, no markdown):
{"tables": ["Header1 | Header2 | Header3\\nVal1 | Val2 | Val3\\nVal4 | Val5 | Val6"]}

Rules:
- Use pipe | to separate columns.
- Use newline to separate rows.
- First row MUST be the column header row.
- Each table is one string in the array.
- If no tables found, return {"tables": []}.`,
          },
          {
            role: "user",
            content: `Extract all tables from this text:\n\n${window}`,
          },
        ],
        temperature: 0.1,
      });

      if (!response) {
        console.warn(`⚠️ Window ${idx + 1}/${windows.length}: skipped (rate limit / too large)`);
        continue;
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = safeParseJSON(raw);
      const windowTables = (parsed?.tables || []).filter((t) => t?.trim().length > 10);
      if (windowTables.length > 0) {
        console.log(`  Window ${idx + 1}/${windows.length}: found ${windowTables.length} table(s)`);
      }
      allTables.push(...windowTables);
    }

    console.log(` Groq extracted ${allTables.length} tables from PDF text`);
    return { tables: allTables, imageDescriptions: [] };
  } catch (error) {
    console.error(" Groq Table Extract Exception:", error.message);
    return { tables: [], imageDescriptions: [] };
  }
};


export const extractFromImageWithGroq = async (imageBuffer) => {
  try {
    const base64Image = imageBuffer.toString("base64");
    const response = await callGroqWithRetry({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL visible text, numbers, tables and structured information from this image. Return clean plain text.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Image}` },
            },
          ],
        },
      ],
      temperature: 0.2,
    });

    if (!response) return "";
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error(" Groq Vision Exception:", error.message);
    return "";
  }
};
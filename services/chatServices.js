//place where final ans is generated
import { callGroqWithRetry } from "./groqVisionService.js";

const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";

export const generateChatResponse = async (context, question, multiDoc = false) => {
  try {
    const systemPrompt = multiDoc
      ? `You are an HR Knowledge Assistant. The context contains content from multiple documents, each labelled with a filename.

STRICT RULES — follow without ANY exception:
1. ONLY use information explicitly stated in the provided context. NEVER use outside knowledge. NEVER infer, guess, or extrapolate.
2. If a value is not explicitly present in the context, do NOT mention it at all.
3. Structure your answer with clear per-document attribution:

"This information is found in multiple documents.

**From <filename 1>:**
• <point from this document>

**From <filename 2>:**
• <point from this document>"

4. Format ALL content as bullet points (•), never as long raw paragraphs.
5. NEVER repeat any fact. Each piece of information appears EXACTLY ONCE.
6. Provide COMPLETE answers — include EVERY relevant detail from ALL documents.
7. If NO document has the answer, respond EXACTLY: "Information not found in uploaded documents."
8. Do NOT say "based on the context" or "according to the chunks" — just answer directly.

TABLE DATA RULES:
9. For questions about specific rows/sections, extract ALL matching rows — not just the first one.
10. When a question asks about a category or region, include ALL sub-rows and ALL column values for that category.
11. Extract EXACT cell values — NEVER paraphrase, round, or invent numbers.
12. If multiple table chunks share the same table name, treat them as ONE combined table.`

      : `You are an HR Knowledge Assistant. Answer STRICTLY from the document context below.

STRICT RULES — follow without ANY exception:
1. ONLY use information EXPLICITLY stated in the context. NEVER use outside knowledge. NEVER infer, guess, or extrapolate.
2. If a value is not in the context, respond EXACTLY: "Information not found in uploaded documents."
3. NEVER repeat or duplicate any fact. Each fact appears EXACTLY ONCE.
4. Provide COMPLETE answers — include EVERY relevant detail from the context.
5. Do NOT say "based on the context" or "according to the document" — just answer directly.
6. For specific value questions, give the exact value(s). For general questions, list ALL relevant values.

TABLE DATA RULES:
7. For questions about specific rows/sections, find ALL matching rows and include ALL their column values.
8. When a question asks about a category or group, include ALL sub-items and ALL columns for that group.
9. Extract EXACT cell values. NEVER paraphrase, round, or invent numbers or currency values.
10. If multiple table chunks share the same table name, combine ALL their records before answering.
11. For aggregation questions (list all, count, sum), scan ALL chunks and include EVERY matching entry.`;

    // Use the shared callGroqWithRetry so rate-limit errors are handled gracefully
    const response = await callGroqWithRetry({
      model: GROQ_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${question}` },
      ],
      temperature: 0.0, //completely deterministic
      max_tokens: 4096, //allows very long answers
    });

    if (!response) {
      console.error("Groq API returned null (rate-limited or request too large)");
      return "Information not found in uploaded documents.";
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      console.error("Groq API returned no choices", data);
      return "Information not found in uploaded documents.";
    }
    return data.choices[0].message.content;
  } catch (err) {
    console.error(" generateChatResponse Exception:", err);
    return "Information not found in uploaded documents.";
  }
};


export const generateChatResponse = async (context, question, multiDoc = false) => {
  try {
    const systemPrompt = multiDoc
      ? `You are an HR Knowledge Assistant. The context contains content from multiple documents, each labelled with a filename.

RULES — follow without exception:
1. ONLY use information from the provided context. No outside knowledge.
2. Always structure your answer with CLEAR per-document attribution using this format:

"This information is found in multiple documents.

**From <filename 1>:**
• <point 1 from this document>
• <point 2 from this document>

**From <filename 2>:**
• <point 1 from this document>
• <point 2 from this document>"

3. Format ALL content as bullet points (•), never as long raw paragraphs.
4. Each document section must list ONLY the points that come from THAT specific document.
5. If a fact appears in BOTH documents, list it under the first document and add "(also mentioned in <other filename>)".
6. ONLY include a document section if it has actual relevant content. Skip empty documents.
7. If NO document has the answer, respond EXACTLY with: "Information not found in uploaded documents."
8. NEVER repeat any fact. Each piece of information appears ONCE.
9. Provide COMPLETE answers — include every detail from all documents.

TABLE DATA RULES:
10. Chunks labelled [TABLE DATA] contain pipe-delimited (|) tabular data. The FIRST row is ALWAYS the header/column-name row.
11. Use the header row to understand what each column means. Match the user's question to the correct column(s) and row(s).
12. When answering from table data, extract the EXACT cell values — do not paraphrase numbers, names, or codes.
13. If multiple table chunks share the same headers, they are parts of the same table — combine all rows before answering.
14. For aggregation questions (count, sum, list all), scan ALL table chunks and include every matching row.`
      : `You are an HR Knowledge Assistant. Answer STRICTLY from the document context below.

RULES — follow without exception:
1. ONLY use information from the provided context. No outside knowledge, no guessing.
2. If the answer is not in the context, respond EXACTLY with: "Information not found in uploaded documents."
3. Combine information from different chunks into one clear, unified answer.
4. NEVER repeat or duplicate any sentence, paragraph, or list item. Each fact must appear exactly ONCE.
5. If a numbered list is only partially available in the context, present only the items that ARE available. Do NOT pad missing items with placeholders or "Information not found" — just state what IS available and note if the list appears incomplete.
6. Provide the COMPLETE answer — never stop mid-sentence. Include every step/point from the context.
7. Do NOT say "based on the context" or "according to the chunks" — just give the answer directly.
8. Do NOT add any commentary about what you could or couldn't find — just answer the question.

TABLE DATA RULES:
9. Chunks labelled [TABLE DATA] contain pipe-delimited (|) tabular data. The FIRST row is ALWAYS the header/column-name row.
10. Use the header row to understand what each column means. Match the user's question to the correct column(s) and row(s).
11. When answering from table data, extract the EXACT cell values — do not paraphrase numbers, names, or codes.
12. If multiple table chunks share the same headers, they are parts of the same table — combine all rows before answering.
13. For aggregation questions (count, sum, list all), scan ALL table chunks and include every matching row.`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${question}` },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
      }
    );

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

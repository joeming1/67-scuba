// ============================================
// Fix It Felix — Brain (AI Engine)
// ============================================
// Felix's AI brain does two things:
// 1. craftMessage() — Takes a backend prompt and crafts a natural WhatsApp message for the technician
// 2. evaluateReply() — Reads the technician's reply and decides next steps
// ============================================

const https = require("https");

// ============================================
// System Prompt — Felix's role
// ============================================
function buildSystemPrompt(task) {
  return `You are "Fix It Felix", an automated dispatch agent. You are NOT a human. You are a smart bot that acts as a bridge between a backend system and a technician on WhatsApp.

YOUR ROLE:
- You receive instructions from a backend (e.g. "Ask the technician if he's available tomorrow at 2pm for a plumbing job in Petaling Jaya")
- You craft a natural, human-like WhatsApp message to send to the technician
- When the technician replies, you evaluate his response and decide what to do next

YOUR BEHAVIOR:
- Messages you send should sound natural and conversational, like a dispatcher texting a worker
- Keep messages SHORT (1-3 sentences, like WhatsApp texts)
- Use casual language. You can say "boss", "bro", "eh" — sound Malaysian-local
- Don't over-explain. Get to the point.

TASK CONTEXT:
- Task ID: ${task?.id || "unknown"}
- Original prompt: ${task?.prompt || "N/A"}
- Context: ${JSON.stringify(task?.context || {})}

EVALUATION RULES:
When evaluating a technician's reply, respond with JSON ONLY (no markdown, no extra text):

{
  "status": "confirmed" | "declined" | "needs_followup" | "needs_more_info" | "escalate",
  "reasoning": "Brief explanation of why you chose this status",
  "followup_message": "What to send next (null if no followup needed)",
  "summary": "Brief summary of what was decided (for the backend)",
  "extracted_data": {
    "available_date": "date if mentioned or null",
    "available_time": "time if mentioned or null",
    "estimated_duration": "duration if mentioned or null",
    "price_quoted": "amount if mentioned or null",
    "alternative_times": ["list of alternative times if offered"]
  }
}

STATUS DEFINITIONS:
- "confirmed": Technician agreed/confirmed the booking. Send a confirmation message.
- "declined": Technician said he can't do it. Ask if he has alternative times, or escalate.
- "needs_followup": Technician's reply is partial — you need to ask a follow-up question.
- "needs_more_info": Technician asked YOU a question — answer it and continue.
- "escalate": Situation needs human intervention (e.g. technician is unreachable, angry, or complex issue).

IMPORTANT:
- Return ONLY the JSON object, no extra text, no markdown formatting
- Be smart about parsing Malaysian slang ("can" = yes, "cannot" = no, "later" = delay, etc.)
- If the technician gives a specific time, extract it
- If technician says "can" or "sure" or "ok" → confirmed
- If technician says "cannot", "busy", "not free" → declined, ask for alternatives
- If technician says "what time?" or "where?" → needs_more_info, answer the question
- If technician gives partial info → needs_followup, ask for the missing piece`;
}

// ============================================
// Craft Message — Backend prompt → WhatsApp text
// ============================================
function buildCraftPrompt(backendPrompt) {
  return `You are Felix, a dispatch agent. Convert this backend instruction into a natural, short WhatsApp message to send to a technician. 

Backend instruction: "${backendPrompt}"

Rules:
- Sound like a real person texting (Malaysian style, casual)
- Keep it under 2-3 sentences
- Be direct but friendly
- Don't mention that you're a bot or AI
- Just write the message, nothing else

Message:`;
}

// ============================================
// AI Call: Google Gemini
// ============================================
function callGemini(prompt, systemPrompt, history) {
  const apiKey = process.env.GEMINI_API_KEY;

  // The new AQ. prefix auth keys require the x-goog-api-key header (not ?key=)
  // Model: gemini-3.5-flash-lite works with AQ keys as of Oct 2026
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

  const contents = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const body = {
    contents: contents,
    generationConfig: { temperature: 0.8, maxOutputTokens: 1000, thinkingConfig: { includeThoughts: false } },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const requestBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
      },
      (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          resolve(json.candidates?.[0]?.content?.parts?.[0]?.text || "");
        } catch (e) {
          reject(new Error("Gemini parse error: " + e.message));
        }
      });
    });
    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

// ============================================
// Create Felix Brain
// ============================================
function createFelixBrain({ geminiKey, groqKey }) {
  const useGemini = !!geminiKey;

  return {
    // Craft a WhatsApp message from a backend prompt
    async craftMessage({ task, backendPrompt }) {
      const systemPrompt = buildSystemPrompt(task);
      const craftPrompt = buildCraftPrompt(backendPrompt);

      try {
        const response = await callGemini(craftPrompt, systemPrompt, []);
        return response.trim().replace(/^["']|["']$/g, ""); // strip surrounding quotes
      } catch (error) {
        console.error("  Brain error (craftMessage):", error.message);
        // Fallback: just send the raw prompt
        return backendPrompt;
      }
    },

    // Evaluate the technician's reply and decide next steps
    async evaluateReply({ task, technicianReply, conversationHistory }) {
      const systemPrompt = buildSystemPrompt(task);

      // Build the evaluation prompt
      const evalPrompt = `The technician replied: "${technicianReply}"

Conversation so far:
${(conversationHistory || []).map((m) => `- ${m.role}: ${m.content}`).join("\n")}

Evaluate this reply and respond with the JSON object only.`;

      try {
        const response = await callGemini(evalPrompt, systemPrompt, []);

        // Try to extract JSON from response
        let jsonStr = response.trim();

        // Strip markdown code fences if present
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```/g, "").trim();

        // Find the JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        const evaluation = JSON.parse(jsonStr);
        return evaluation;
      } catch (error) {
        console.error("  Brain error (evaluateReply):", error.message);
        console.error("  Raw response:", response);
        return {
          status: "escalate",
          reasoning: "Failed to evaluate technician reply: " + error.message,
          followup_message: null,
          summary: "Evaluation failed — needs human review",
          extracted_data: {},
        };
      }
    },
  };
}

module.exports = { createFelixBrain };

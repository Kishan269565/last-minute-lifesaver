// src/lib/gemini.js
// All AI "agent" logic lives here. Two capabilities:
//   1. planFromBraindump(text) -> structured, prioritized task list
//   2. breakIntoSubtasks(task)  -> autonomous decomposition of one task into actionable steps
//
// Uses Gemini's structured output (responseMimeType: application/json) so we get
// reliable JSON back instead of parsing free text.

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function callGemini(systemPrompt, userPrompt, schema) {
  if (!API_KEY) {
    throw new Error(
      "Missing VITE_GEMINI_API_KEY. Add it to your .env file (see README Step 6)."
    );
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.4,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content. Try again.");
  return JSON.parse(text);
}

// --- Capability 1: turn a messy brain-dump into a prioritized, scheduled plan ---
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          deadline: { type: "string", description: "Human-readable deadline, e.g. 'Friday 5 PM' or 'No fixed deadline'" },
          estimatedMinutes: { type: "integer" },
          priorityScore: { type: "integer", description: "1-100, higher = more urgent/important" },
          reasoning: { type: "string", description: "One sentence on why this priority" },
          suggestedSlot: { type: "string", description: "When to actually do it, e.g. 'Today, 6-7 PM'" },
        },
        required: ["title", "deadline", "estimatedMinutes", "priorityScore", "reasoning", "suggestedSlot"],
      },
    },
  },
  required: ["tasks"],
};

export async function planFromBraindump(rawText, now = new Date()) {
  const system = `You are an autonomous productivity planning agent. A user dumps everything on their mind in messy, unstructured text. Your job:
1. Extract every distinct task, deadline, or commitment.
2. Estimate realistic effort in minutes for each.
3. Score priority 1-100 using urgency (how soon) AND impact (how bad if missed) — not just chronological order.
4. Assign a concrete suggested time slot for today/this week, assuming the user has normal waking hours and avoiding overlaps.
5. Order the output array by priority, highest first.
Be decisive and specific. Never return a vague task — split compound sentences into separate tasks. Current date/time: ${now.toString()}.`;

  const result = await callGemini(system, rawText, PLAN_SCHEMA);
  return result.tasks.map((t, i) => ({ id: `${Date.now()}-${i}`, done: false, subtasks: null, ...t }));
}

// --- Capability 2: autonomously break one task into ordered, actionable subtasks ---
const SUBTASK_SCHEMA = {
  type: "object",
  properties: {
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          estimatedMinutes: { type: "integer" },
        },
        required: ["step", "estimatedMinutes"],
      },
    },
  },
  required: ["subtasks"],
};

export async function breakIntoSubtasks(task) {
  const system = `You are an autonomous task-decomposition agent. Given a single task, break it into 3-6 concrete, sequential, actionable subtasks a person could start on immediately. Each subtask should be small enough to finish in one sitting. Do not restate the task itself as a subtask.`;
  const user = `Task: "${task.title}"\nDeadline: ${task.deadline}\nTotal estimated time: ${task.estimatedMinutes} minutes.`;

  const result = await callGemini(system, user, SUBTASK_SCHEMA);
  return result.subtasks;
}

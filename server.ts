import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper: Call Gemini with robust retries on 503 (Unavailable) and automatic fallback to alternative models
async function callGeminiWithFallback(contents: any, config: any) {
  const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const maxRetries = 3;
    let delay = 1000; // start with 1 second delay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting generation with model: ${model} (Attempt ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        if (response && response.text) {
          return response;
        }
        throw new Error(`Empty response from model ${model}`);
      } catch (err: any) {
        // Use console.warn instead of console.error for intermediate attempts to avoid triggering error alerts
        console.warn(`Attempt ${attempt} with model ${model} failed:`, err.message || err);
        lastError = err;

        // Check if error is a 503 (Service Unavailable) or high-demand transient error
        const isTransient = err.message?.includes("503") || 
                            err.message?.includes("UNAVAILABLE") || 
                            err.message?.includes("high demand") || 
                            err.status === 503;

        if (isTransient && attempt < maxRetries) {
          console.warn(`Transient 503 detected. Retrying model ${model} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          // If not transient or we ran out of retries, break to try the next fallback model
          break;
        }
      }
    }
    // Small gap before trying a completely different model family
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Only log as console.error if ALL models have fully failed
  console.error("All Gemini model attempts and fallbacks failed:", lastError?.message || lastError);
  throw lastError || new Error("Failed to generate content with any available Gemini model.");
}

// Endpoint: Extract and prioritize tasks from a messy brain dump
app.post("/api/plan-day", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({ error: "Brain dump text is required." });
    }

    const systemInstruction = `You are an expert personal productivity assistant. Your job is to take a messy, chaotic list of tasks or brain dumps, and extract them into a clean, prioritized, and organized plan.
For each item identified in the dump:
1. Formulate a short, direct, actionable task title.
2. Extract or infer the deadline. Use a natural language descriptor (e.g. "Tuesday 3:00 PM" or "Flexible" or "End of month").
3. Estimate the duration in minutes. If not clear, make a realistic guess.
4. Calculate a priority score from 1 to 100 based on both URGENCY (deadlines, timing) and IMPACT (importance, severe consequences of delay). Do not just sort by date. High impact + high urgency gets 90-100. High impact + medium urgency gets 70-85. Low impact + low urgency gets <40.
5. Provide a one-sentence logical explanation of why this priority score was assigned.
6. Suggest a specific time slot today or this week (e.g. "Today 10:00 AM", "Tomorrow evening").
Current local time reference: ${new Date().toISOString()}`;

    const prompt = `Here is my chaotic brain dump:
"""
${text}
"""

Please parse, prioritize, and structure this content into a set of organized tasks.`;

    const response = await callGeminiWithFallback(prompt, {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            description: "List of parsed and prioritized tasks",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "The clear and actionable title of the task."
                },
                deadline: {
                  type: Type.STRING,
                  description: "The extracted deadline (e.g., 'Tuesday 3:00 PM', 'Flexible', 'Month end')."
                },
                estimatedMinutes: {
                  type: Type.INTEGER,
                  description: "Estimated minutes to complete this task."
                },
                priorityScore: {
                  type: Type.INTEGER,
                  description: "Priority score from 1 to 100 based on urgency and impact."
                },
                priorityReasoning: {
                  type: Type.STRING,
                  description: "One clear sentence explaining why this priority score was assigned."
                },
                suggestedTimeSlot: {
                  type: Type.STRING,
                  description: "Suggested time slot today or this week (e.g. 'Today 4:00 PM', 'Wednesday morning')."
                }
              },
              required: ["title", "deadline", "estimatedMinutes", "priorityScore", "priorityReasoning", "suggestedTimeSlot"]
            }
          }
        },
        required: ["tasks"]
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini.");
    }

    const parsedData = JSON.parse(resultText.trim());
    return res.json(parsedData);
  } catch (error: any) {
    console.error("Error in /api/plan-day:", error);
    return res.status(500).json({ error: error.message || "Failed to process brain dump." });
  }
});

// Endpoint: Decompose a task into 3-6 actionable sequential subtasks
app.post("/api/breakdown-task", async (req, res) => {
  try {
    const { title, deadline, estimatedMinutes, priorityReasoning } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Task title is required." });
    }

    const systemInstruction = `You are an expert work planner and task decomposition agent.
Your objective is to take a main task and break it down into 3 to 6 highly specific, sequential, small, actionable subtasks.
Each subtask must:
1. Have a short, clear, actionable title (e.g., "Draft the intro paragraph", "Gather the invoice PDFs", "Call clinic receptionist").
2. Have a specific duration estimate in minutes.
3. Be sequential, forming a clear step-by-step roadmap from start to finish.
The sum of the subtask estimates should be roughly equal to or slightly less than the parent task's estimated time.`;

    const prompt = `Break down this task:
Title: "${title}"
Deadline: "${deadline || 'Flexible'}"
Total Time: ${estimatedMinutes || 60} minutes
Context/Reasoning: "${priorityReasoning || 'General task'}"`;

    const response = await callGeminiWithFallback(prompt, {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subtasks: {
            type: Type.ARRAY,
            description: "A sequential breakdown of 3 to 6 small actionable subtasks.",
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: {
                  type: Type.INTEGER,
                  description: "Step index (1, 2, 3...)."
                },
                title: {
                  type: Type.STRING,
                  description: "Actionable title of the subtask."
                },
                estimatedMinutes: {
                  type: Type.INTEGER,
                  description: "Time estimate in minutes for this subtask."
                }
              },
              required: ["stepNumber", "title", "estimatedMinutes"]
            }
          }
        },
        required: ["subtasks"]
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini.");
    }

    const parsedData = JSON.parse(resultText.trim());
    return res.json(parsedData);
  } catch (error: any) {
    console.error("Error in /api/breakdown-task:", error);
    return res.status(500).json({ error: error.message || "Failed to breakdown task." });
  }
});

// Endpoint: AI Productivity Coach analysis
app.post("/api/productivity-coach", async (req, res) => {
  try {
    const { activeTasks = [], completedTasksCount = 0, habits = [] } = req.body;

    const systemInstruction = `You are Seraphina, an elite productivity coach and behavioral psychologist. 
Your tone is calm, highly perceptive, encouraging, and free of corporate buzzwords.
Analyze the user's current task list, completed task count, and active daily habits. 
Then, formulate a supportive, actionable coaching summary and exactly 3 highly personalized, context-aware productivity recommendations or stress-mitigation actions.`;

    const prompt = `Current State Analysis:
- Active Tasks to do: ${activeTasks.map((t: any) => `"${t.title}" (Priority Score: ${t.priorityScore}, Est: ${t.estimatedMinutes}m, Time Slot: ${t.suggestedTimeSlot})`).join(", ") || "None"}
- Tasks Completed Today: ${completedTasksCount}
- Active Daily Habits: ${habits.map((h: any) => `"${h.title}" (Streak: ${h.streak} days)`).join(", ") || "None"}

Generate a supportive personal assessment and 3 hyper-targeted, specific recommendations. Be direct and compassionate.`;

    const response = await callGeminiWithFallback(prompt, {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "A short, motivating, compassionate coach overview (2-3 sentences)."
          },
          recommendations: {
            type: Type.ARRAY,
            description: "Exactly 3 personalized productivity recommendations.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "A short, punchy, action-oriented title (e.g., 'Tackle the Frogs First', 'Hydration Interval')."
                },
                advice: {
                  type: Type.STRING,
                  description: "Explicit instructions on what to do next, how, and why (2 sentences)."
                }
              },
              required: ["title", "advice"]
            }
          }
        },
        required: ["summary", "recommendations"]
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini.");
    }

    return res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in /api/productivity-coach:", error);
    return res.status(500).json({ error: error.message || "Failed to generate coaching insights." });
  }
});

// Endpoint: Autonomous Task Execution Simulation
app.post("/api/autonomous-execute", async (req, res) => {
  try {
    const { title, priorityReasoning, subtasks = [] } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Task title is required." });
    }

    const systemInstruction = `You are an Autonomous AI Agent execution pipeline. 
Your objective is to simulate actually executing the user's task by performing deep research, drafting relevant emails/code/documents, formulating detailed step-by-step roadmaps, or writing concrete templates.
Generate actual high-quality work deliverables and output (e.g. written outlines, drafts, guides, completed spreadsheets/proposals, or code boilerplates based on what the task title is) rather than generic instructions. 
Always format your response as structured, beautiful, publication-grade Markdown. Use markdown headings, lists, codeblocks, and bold text for visual structure. Do NOT use fake variables or placeholders — write real, robust, concrete content.`;

    const prompt = `Task for Execution:
- Title: "${title}"
- Priority Reason: "${priorityReasoning || 'General scheduled item'}"
- Sequential Plan: ${subtasks.map((s: any) => `Step ${s.stepNumber}: ${s.title}`).join(" -> ") || "No subtasks provided"}

Autonomous Action: Execute all steps of this task and compile the finalized output deliverables, drafts, codes, or reports. Ensure it is fully developed and immediately useful.`;

    const response = await callGeminiWithFallback(prompt, {
      systemInstruction,
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini.");
    }

    return res.json({ success: true, markdownOutput: resultText });
  } catch (error: any) {
    console.error("Error in /api/autonomous-execute:", error);
    return res.status(500).json({ error: error.message || "Failed to execute task autonomously." });
  }
});

// Endpoint: Dynamic Priority & Time Slot Adjustment
app.post("/api/adjust-priorities", async (req, res) => {
  try {
    const { tasks = [], energyLevel = "medium", focusPreference = "balanced" } = req.body;
    if (tasks.length === 0) {
      return res.json({ adjustedTasks: [] });
    }

    const systemInstruction = `You are a dynamic scheduling compiler. 
Your task is to re-evaluate and adjust priority scores (1 to 100) and time slots of a given set of tasks based on the user's current metabolic energy level and focus preference.
Rules:
1. If energyLevel is 'low':
   - Shift small, simple, low-effort tasks to higher scores so they can score 'quick wins'.
   - Reduce priority scores of heavy/long tasks, and schedule them later or suggest alternative Slots.
2. If energyLevel is 'high':
   - Elevate heavy, highly challenging tasks (e.g. 'heavy-lifting') to highest priority scores so they get done first.
   - Keep short chores flexible.
3. If focusPreference is 'quick-wins':
   - Strongly raise the priority of low-duration tasks (e.g., < 30 mins) so the user builds immediate momentum.
4. If focusPreference is 'heavy-lifting':
   - Maximize priority of complex tasks.
Return a list matching each task ID with an updated priority score, updated reasoning, and an optimal suggested time slot.`;

    const prompt = `User Context:
- Energy Level: ${energyLevel}
- Focus Preference: ${focusPreference}

Tasks to Adjust:
${tasks.map((t: any) => `ID: ${t.id} | Title: "${t.title}" | Current Score: ${t.priorityScore} | Est: ${t.estimatedMinutes} mins | Current Time Slot: ${t.suggestedTimeSlot}`).join("\n")}

Output the optimized variables.`;

    const response = await callGeminiWithFallback(prompt, {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          adjustedTasks: {
            type: Type.ARRAY,
            description: "List of adjusted task attributes matching original IDs",
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: "The original task document ID"
                },
                priorityScore: {
                  type: Type.INTEGER,
                  description: "The newly calculated priority score (1 to 100)"
                },
                priorityReasoning: {
                  type: Type.STRING,
                  description: "Updated reasoning explaining the metabolic adjustment"
                },
                suggestedTimeSlot: {
                  type: Type.STRING,
                  description: "Optimal time slot today (e.g. '10:30 AM', '1:00 PM')"
                }
              },
              required: ["id", "priorityScore", "priorityReasoning", "suggestedTimeSlot"]
            }
          }
        },
        required: ["adjustedTasks"]
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini.");
    }

    return res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in /api/adjust-priorities:", error);
    return res.status(500).json({ error: error.message || "Failed to adjust priorities." });
  }
});

async function startServer() {
  // Vite dev middleware for asset serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

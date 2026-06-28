import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Terminal, RefreshCw, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { Task } from "../types";
import { updateDoc, doc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "../firebase";

interface AutonomousAgentProps {
  task: Task;
  onClose: () => void;
}

export default function AutonomousAgent({ task, onClose }: AutonomousAgentProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"initializing" | "running" | "finalizing" | "completed" | "failed">("initializing");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let active = true;
    const simulationSteps = [
      { text: "Spawning autonomous micro-agent thread...", delay: 600, prog: 10 },
      { text: `Reading task context: "${task.title}"`, delay: 500, prog: 20 },
      { text: `Parsing priority reasoning: "${task.priorityReasoning || 'None'}"`, delay: 700, prog: 35 },
      { text: "Analyzing task roadmap / sequential steps...", delay: 600, prog: 50 },
      ...((task.subtasks || []).map((s) => ({
        text: `Executing Subtask Step ${s.stepNumber}: "${s.title}"...`,
        delay: 1100,
        prog: 50 + Math.floor((s.stepNumber / (task.subtasks?.length || 1)) * 35),
      }))),
      { text: "Synthesizing research nodes into comprehensive deliverables...", delay: 900, prog: 90 },
      { text: "Compiling markdown report & saving to database...", delay: 800, prog: 98 },
    ];

    const runExecution = async () => {
      // Step-by-step log simulations
      for (const step of simulationSteps) {
        if (!active) return;
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${step.text}`]);
        setProgress(step.prog);
        if (step.prog === 50) {
          setStatus("running");
        } else if (step.prog === 90) {
          setStatus("finalizing");
        }
        await new Promise((resolve) => setTimeout(resolve, step.delay));
      }

      // Perform the actual server-side execution call
      try {
        const response = await fetch("/api/autonomous-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            priorityReasoning: task.priorityReasoning,
            subtasks: task.subtasks || [],
          }),
        });

        if (!response.ok) {
          throw new Error("Server agent returned a non-ok status code.");
        }

        const data = await response.json();
        const markdown = data.markdownOutput || "No deliverables compiled.";

        // Update task document in Firestore
        const docRef = doc(db, "tasks", task.id);
        await updateDoc(docRef, {
          executedOutput: markdown,
          isExecutingAutonomously: false,
        });

        if (active) {
          setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ✔ Execution complete! Deliverables written to Firestore.`]);
          setProgress(100);
          setStatus("completed");
        }
      } catch (err: any) {
        console.error(err);
        if (active) {
          setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Autonomous execution error: ${err.message || err}`]);
          setStatus("failed");
        }
        try {
          await updateDoc(doc(db, "tasks", task.id), { isExecutingAutonomously: false });
        } catch (subErr) {
          // ignore
        }
      }
    };

    runExecution();

    return () => {
      active = false;
    };
  }, [task]);

  return (
    <div id="autonomous-terminal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[500px]"
      >
        {/* Terminal Header */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-amber-accent animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Autonomous Agent: {task.title.substring(0, 30)}...
            </span>
          </div>
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-accent/80"></span>
          </div>
        </div>

        {/* Console logs output */}
        <div className="flex-1 bg-slate-950 p-4 font-mono text-xs text-slate-300 space-y-2 overflow-y-auto select-none">
          {logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed whitespace-pre-wrap">
              {log.includes("✔") ? (
                <span className="text-emerald-400">{log}</span>
              ) : log.includes("❌") ? (
                <span className="text-rose-400">{log}</span>
              ) : (
                log
              )}
            </div>
          ))}

          {status !== "completed" && status !== "failed" && (
            <div className="flex items-center gap-2 text-amber-accent text-xs">
              <span className="inline-block w-1.5 h-3 bg-amber-accent animate-ping"></span>
              <span>Agent compiling context and executing subtasks...</span>
            </div>
          )}
        </div>

        {/* Progress & Bottom Controls */}
        <div className="bg-slate-900 p-4 border-t border-slate-800 space-y-3 shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5 font-bold uppercase">
              {status === "initializing" && "Initializing Agent..."}
              {status === "running" && "Executing Steps..."}
              {status === "finalizing" && "Compiling Report..."}
              {status === "completed" && "Execution Complete"}
              {status === "failed" && "Execution Failed"}
            </span>
            <span>{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${status === "failed" ? "bg-rose-500" : "bg-amber-accent"}`}
              style={{ width: `${progress}%` }}
              transition={{ ease: "easeInOut" }}
            />
          </div>

          <div className="flex justify-end gap-2.5">
            {status === "failed" && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs rounded-xl font-mono cursor-pointer"
              >
                Close Terminal
              </button>
            )}
            {status === "completed" && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-amber-accent text-slate-950 text-xs rounded-xl font-bold font-mono flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 size={13} />
                View Compiled Deliverables
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

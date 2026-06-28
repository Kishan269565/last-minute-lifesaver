import { useState, useEffect } from "react";
import { Send, Loader2, Clock, ListTree, Check, AlertTriangle, Zap } from "lucide-react";
import { planFromBraindump, breakIntoSubtasks } from "./lib/gemini";

const STORAGE_KEY = "lifesaver-tasks-v1";

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function priorityColor(score) {
  if (score >= 75) return { dot: "bg-[var(--signal-red)]", text: "text-[var(--signal-red)]", label: "Critical" };
  if (score >= 45) return { dot: "bg-[var(--amber)]", text: "text-[var(--amber)]", label: "Important" };
  return { dot: "bg-[var(--signal-green)]", text: "text-[var(--signal-green)]", label: "Flexible" };
}

function TaskCard({ task, onToggleDone, onBreakdown, breakingId }) {
  const p = priorityColor(task.priorityScore);
  const isBreaking = breakingId === task.id;

  return (
    <div
      className={`relative border border-[var(--ink-line)] bg-[var(--ink-soft)] rounded-lg p-4 transition-opacity ${
        task.done ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleDone(task.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
            task.done
              ? "bg-[var(--signal-green)] border-[var(--signal-green)]"
              : "border-[var(--ink-line)] hover:border-[var(--amber)]"
          }`}
        >
          {task.done && <Check size={12} strokeWidth={3} className="text-[var(--ink)]" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className={`font-medium leading-snug ${task.done ? "line-through" : ""}`}>{task.title}</h3>
            <span className={`flex items-center gap-1 text-xs font-mono-data uppercase tracking-wide ${p.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
              {p.label} · {task.priorityScore}
            </span>
          </div>

          <p className="text-sm text-[var(--paper-dim)] mt-1">{task.reasoning}</p>

          <div className="flex items-center gap-4 mt-3 text-xs font-mono-data text-[var(--paper-dim)]">
            <span className="flex items-center gap-1"><AlertTriangle size={12} /> {task.deadline}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {task.estimatedMinutes}m</span>
            <span className="flex items-center gap-1"><Zap size={12} /> {task.suggestedSlot}</span>
          </div>

          {!task.subtasks && (
            <button
              onClick={() => onBreakdown(task)}
              disabled={isBreaking}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--amber)] hover:underline disabled:opacity-50"
            >
              {isBreaking ? <Loader2 size={13} className="animate-spin" /> : <ListTree size={13} />}
              {isBreaking ? "Breaking this down…" : "Break into subtasks"}
            </button>
          )}

          {task.subtasks && (
            <ol className="mt-3 space-y-1.5 border-l border-[var(--ink-line)] pl-3">
              {task.subtasks.map((s, i) => (
                <li key={i} className="text-sm flex justify-between gap-3">
                  <span>{i + 1}. {s.step}</span>
                  <span className="text-[var(--paper-dim)] font-mono-data shrink-0">{s.estimatedMinutes}m</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [breakingId, setBreakingId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  async function handlePlan() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const newTasks = await planFromBraindump(input);
      setTasks((prev) => [...newTasks, ...prev]);
      setInput("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBreakdown(task) {
    setBreakingId(task.id);
    setError(null);
    try {
      const subtasks = await breakIntoSubtasks(task);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks } : t)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBreakingId(null);
    }
  }

  function toggleDone(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="min-h-screen px-4 py-10 md:py-16">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <p className="text-xs font-mono-data uppercase tracking-[0.2em] text-[var(--amber)] mb-2">
            Vibe2Ship · Last-Minute Life Saver
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Dump your chaos. Get a plan that acts.
          </h1>
          <p className="text-[var(--paper-dim)] mt-2">
            Not another reminder app — an agent that prioritizes, schedules, and breaks down your work for you.
          </p>
        </header>

        <div className="border border-[var(--ink-line)] bg-[var(--ink-soft)] rounded-lg p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. essay due Friday, dentist Tuesday 3pm, need to pay rent by month end, interview prep for Monday morning, mom's birthday gift..."
            className="w-full bg-transparent outline-none resize-none text-[var(--paper)] placeholder:text-[var(--paper-dim)]/60 min-h-[88px]"
          />
          <div className="flex justify-end">
            <button
              onClick={handlePlan}
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 bg-[var(--amber)] text-[var(--ink)] font-medium px-4 py-2 rounded-md text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {loading ? "Planning…" : "Plan my day"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--signal-red)] font-mono-data">{error}</p>
        )}

        {pending.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="text-xs font-mono-data uppercase tracking-[0.2em] text-[var(--paper-dim)]">
              Active — {pending.length}
            </h2>
            {pending
              .sort((a, b) => b.priorityScore - a.priorityScore)
              .map((task) => (
                <TaskCard key={task.id} task={task} onToggleDone={toggleDone} onBreakdown={handleBreakdown} breakingId={breakingId} />
              ))}
          </section>
        )}

        {done.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="text-xs font-mono-data uppercase tracking-[0.2em] text-[var(--paper-dim)]">
              Done — {done.length}
            </h2>
            {done.map((task) => (
              <TaskCard key={task.id} task={task} onToggleDone={toggleDone} onBreakdown={handleBreakdown} breakingId={breakingId} />
            ))}
          </section>
        )}

        {tasks.length === 0 && (
          <p className="text-center text-[var(--paper-dim)] text-sm mt-16">
            Nothing planned yet. Type everything on your mind above — the agent will sort it out.
          </p>
        )}
      </div>
    </div>
  );
}

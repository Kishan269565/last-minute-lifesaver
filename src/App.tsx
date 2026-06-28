import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import {
  Clock,
  Calendar,
  Flame,
  CheckCircle2,
  Trash2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Check,
  ListTodo,
  FileText,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Bell,
  BellOff,
  Sliders,
  BrainCircuit,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, testFirestoreConnection, handleFirestoreError, OperationType } from "./firebase";
import { Task, Habit } from "./types";

// Import modular sub-components
import AIRecommendations from "./components/AIRecommendations";
import VisualCalendar from "./components/VisualCalendar";
import HabitsTracker from "./components/HabitsTracker";
import AutonomousAgent from "./components/AutonomousAgent";

// Helper: Custom Markdown parser to render AI agent deliverables without external heavy packages
function parseMarkdown(text: string) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    // Headers
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-sm font-bold text-amber-accent mt-3 mb-1 border-b border-slate-800 pb-1 font-display">
          {line.replace("# ", "")}
        </h1>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="text-xs font-bold text-amber-300 mt-2.5 mb-1 font-display">
          {line.replace("## ", "")}
        </h2>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <h3 key={i} className="text-[11px] font-bold text-slate-200 mt-2 mb-0.5">
          {line.replace("### ", "")}
        </h3>
      );
    }
    // Lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <li key={i} className="ml-3 list-disc text-[11px] text-slate-300 leading-normal mb-0.5">
          {line.substring(2)}
        </li>
      );
    }
    // Horizontal rule
    if (line.startsWith("---")) {
      return <hr key={i} className="border-slate-800 my-2" />;
    }
    // Highlighted codeblocks
    if (line.startsWith("```")) {
      return null;
    }
    // Bold parsing
    const boldReg = /\*\*(.*?)\*\*/g;
    if (boldReg.test(line)) {
      return (
        <p
          key={i}
          className="text-[11px] text-slate-300 leading-normal mb-1 font-light"
          dangerouslySetInnerHTML={{ __html: line.replace(boldReg, "<strong class='text-amber-300/90 font-medium'>$1</strong>") }}
        />
      );
    }
    // Standard paragraph
    return (
      <p key={i} className="text-[11px] text-slate-300 leading-normal mb-1 font-light">
        {line}
      </p>
    );
  }).filter(Boolean);
}

export default function App() {
  const [brainDump, setBrainDump] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  
  // Tab/Section control
  const [activeTab, setActiveTab] = useState<"all" | "active" | "done">("all");
  const [activeSection, setActiveSection] = useState<"tasks" | "calendar" | "habits">("tasks");
  const [expandedTasks, setExpandedTasks] = useState<{ [key: string]: boolean }>({});
  const [expandedOutputs, setExpandedOutputs] = useState<{ [key: string]: boolean }>({});

  // Voice recognition states
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // Autonomous execution active task
  const [taskToExecuteAutonomously, setTaskToExecuteAutonomously] = useState<Task | null>(null);

  // Metabolic re-prioritization variables
  const [energyLevel, setEnergyLevel] = useState<"high" | "medium" | "low">("medium");
  const [focusPreference, setFocusPreference] = useState<"quick-wins" | "heavy-lifting" | "balanced">("balanced");
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Context-aware reminders warning popup state
  const [reminderAlert, setReminderAlert] = useState<{ taskTitle: string; id: string } | null>(null);

  // Subscribe to real-time Tasks and Habits, test connection on mount
  useEffect(() => {
    const checkConn = async () => {
      const ok = await testFirestoreConnection();
      setDbConnected(ok);
    };
    checkConn();

    // 1. Subscribe to Tasks
    const qTasks = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsubTasks = onSnapshot(
      qTasks,
      (snapshot) => {
        const items: Task[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Task);
        });
        setTasks(items);
      },
      (err) => {
        console.error("Firestore tasks subscription error:", err);
        setError("Could not sync real-time task updates.");
        handleFirestoreError(err, OperationType.LIST, "tasks");
      }
    );

    // 2. Subscribe to Habits
    const qHabits = query(collection(db, "habits"), orderBy("createdAt", "desc"));
    const unsubHabits = onSnapshot(
      qHabits,
      (snapshot) => {
        const items: Habit[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Habit);
        });
        setHabits(items);
      },
      (err) => {
        console.error("Firestore habits subscription error:", err);
        handleFirestoreError(err, OperationType.LIST, "habits");
      }
    );

    return () => {
      unsubTasks();
      unsubHabits();
    };
  }, []);

  // Set up Web Speech recognition API if available
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          }
        }
        if (finalTranscript) {
          setBrainDump((prev) => (prev + " " + finalTranscript).trim());
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech recognition error:", err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, []);

  // Reminders check loop - fires context-aware alerts
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      tasks.forEach(async (task) => {
        if (task.reminderTime && !task.reminderFired && !task.isDone) {
          const remDate = new Date(task.reminderTime);
          if (now >= remDate) {
            // Synthesize subtle alarm beep using Web Audio API
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
              gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.35);
            } catch (e) {
              // ignore browser security limits on audio
            }

            // Set alert banner
            setReminderAlert({ taskTitle: task.title, id: task.id });

            // Mark reminder as fired to prevent repeating
            try {
              await updateDoc(doc(db, "tasks", task.id), { reminderFired: true });
            } catch (err) {
              console.error("Failed to set reminder fired:", err);
            }
          }
        }
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [tasks]);

  // Toggle voice streaming
  const handleToggleVoice = () => {
    if (!recognition) {
      setError("Native Speech Recognition is not supported in this browser. Try Google Chrome.");
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setError(null);
      recognition.start();
      setIsListening(true);
    }
  };

  const applyTemplate = (text: string) => {
    setBrainDump(text);
    setError(null);
  };

  // Submit messy brain dump to build structured day plan
  const handlePlanDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPlanning) return;
    if (!brainDump.trim()) {
      setError("Write or record something in the Brain Dump first!");
      return;
    }

    setIsPlanning(true);
    setError(null);

    try {
      const response = await fetch("/api/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: brainDump }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to organize tasks.");
      }

      const data = await response.json();
      const extractedTasks = data.tasks || [];

      if (extractedTasks.length === 0) {
        throw new Error("No actionable tasks could be extracted. Elaborate further.");
      }

      const batch = writeBatch(db);

      // Delete past active tasks to renew schedule
      const activeTasksToDelete = tasks.filter((t) => !t.isDone);
      activeTasksToDelete.forEach((t) => {
        batch.delete(doc(db, "tasks", t.id));
      });

      // Add new structured tasks
      extractedTasks.forEach((t: Omit<Task, "id" | "createdAt" | "isDone">) => {
        const docRef = doc(collection(db, "tasks"));
        batch.set(docRef, {
          title: t.title,
          deadline: t.deadline,
          estimatedMinutes: Number(t.estimatedMinutes) || 30,
          priorityScore: Number(t.priorityScore) || 50,
          priorityReasoning: t.priorityReasoning,
          suggestedTimeSlot: t.suggestedTimeSlot,
          isDone: false,
          createdAt: new Date().toISOString(),
          subtasks: [],
          reminderFired: false,
        });
      });

      try {
        await batch.commit();
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, "tasks (batch)");
      }
      setBrainDump("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected processing error occurred.");
    } finally {
      setIsPlanning(false);
    }
  };

  // Adjust priorities using Metabolic Coach API
  const handleAdjustPriorities = async () => {
    const active = tasks.filter((t) => !t.isDone);
    if (active.length === 0) {
      setError("Cannot re-prioritize. Please create some active tasks first!");
      return;
    }

    setIsAdjusting(true);
    setError(null);

    try {
      const response = await fetch("/api/adjust-priorities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: active,
          energyLevel,
          focusPreference,
        }),
      });

      if (!response.ok) {
        throw new Error("Metabolic schedule compiler failed. Try again.");
      }

      const data = await response.json();
      const adjusted = data.adjustedTasks || [];

      const batch = writeBatch(db);
      adjusted.forEach((at: any) => {
        const docRef = doc(db, "tasks", at.id);
        batch.update(docRef, {
          priorityScore: at.priorityScore,
          priorityReasoning: at.priorityReasoning,
          suggestedTimeSlot: at.suggestedTimeSlot,
        });
      });

      await batch.commit();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to calculate adjusted priorities.");
    } finally {
      setIsAdjusting(false);
    }
  };

  // Toggle checklist tasks
  const handleToggleDone = async (taskId: string, currentStatus: boolean) => {
    try {
      const docRef = doc(db, "tasks", taskId);
      await updateDoc(docRef, { isDone: !currentStatus });
    } catch (err: any) {
      setError("Failed to update status.");
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "tasks", taskId));
    } catch (err: any) {
      setError("Failed to delete task.");
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  // Generate subtasks breakdown
  const handleBreakIntoSubtasks = async (task: Task) => {
    if (!task.id) return;
    try {
      const docRef = doc(db, "tasks", task.id);
      await updateDoc(docRef, { isBreakingDown: true });

      const response = await fetch("/api/breakdown-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          deadline: task.deadline,
          estimatedMinutes: task.estimatedMinutes,
          priorityReasoning: task.priorityReasoning,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to decompose task steps.");
      }

      const data = await response.json();
      await updateDoc(docRef, {
        subtasks: data.subtasks || [],
        isBreakingDown: false,
      });

      setExpandedTasks((prev) => ({ ...prev, [task.id]: true }));
    } catch (err: any) {
      console.error(err);
      setError(`Failed to decompose "${task.title}": ${err.message}`);
      await updateDoc(doc(db, "tasks", task.id), { isBreakingDown: false });
    }
  };

  // Toggle Context-Aware Reminders
  const handleSetReminder = async (taskId: string, minutes: number) => {
    try {
      const remTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      const docRef = doc(db, "tasks", taskId);
      await updateDoc(docRef, {
        reminderTime: remTime,
        reminderFired: false,
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleClearReminder = async (taskId: string) => {
    try {
      const docRef = doc(db, "tasks", taskId);
      await updateDoc(docRef, {
        reminderTime: null,
        reminderFired: false,
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const triggerAutonomousExecution = async (task: Task) => {
    try {
      const docRef = doc(db, "tasks", task.id);
      await updateDoc(docRef, { isExecutingAutonomously: true });
      setTaskToExecuteAutonomously(task);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const sortedActiveTasks = tasks
    .filter((t) => !t.isDone)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const sortedDoneTasks = tasks
    .filter((t) => t.isDone)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const displayedTasks =
    activeTab === "all"
      ? [...sortedActiveTasks, ...sortedDoneTasks]
      : activeTab === "active"
      ? sortedActiveTasks
      : sortedDoneTasks;

  const getPriorityInfo = (score: number) => {
    if (score >= 75) {
      return {
        label: "Critical",
        badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/25",
        borderClass: "border-l-4 border-l-rose-500",
        scoreColor: "text-rose-400",
      };
    } else if (score >= 45) {
      return {
        label: "Important",
        badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/25",
        borderClass: "border-l-4 border-l-amber-500",
        scoreColor: "text-amber-400",
      };
    } else {
      return {
        label: "Flexible",
        badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
        borderClass: "border-l-4 border-l-emerald-500",
        scoreColor: "text-emerald-400",
      };
    }
  };

  return (
    <div id="app-root" className="min-h-screen bg-navy-dark text-slate-100 flex flex-col font-sans selection:bg-amber-accent/35 selection:text-navy-dark relative">
      
      {/* Real-time Reminder Alert Modal */}
      <AnimatePresence>
        {reminderAlert && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 bg-amber-accent/20 border border-amber-accent/30 rounded-full flex items-center justify-center mx-auto text-amber-accent animate-bounce">
                <Bell size={24} />
              </div>
              <div>
                <h4 className="text-md font-bold font-display text-slate-100 uppercase tracking-wide">Context-Aware Alarm</h4>
                <p className="text-xs text-slate-400 mt-1 font-light">It's time to start or review your scheduled task:</p>
                <p className="text-sm font-semibold text-amber-accent mt-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
                  {reminderAlert.taskTitle}
                </p>
              </div>
              <button
                onClick={() => setReminderAlert(null)}
                className="w-full bg-amber-accent hover:bg-amber-hover text-slate-950 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg"
              >
                Acknowledge Alert
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Autonomous Terminal Overlay */}
      <AnimatePresence>
        {taskToExecuteAutonomously && (
          <AutonomousAgent
            task={taskToExecuteAutonomously}
            onClose={() => setTaskToExecuteAutonomously(null)}
          />
        )}
      </AnimatePresence>

      {/* DB connection indicator bar */}
      {dbConnected === false && (
        <div className="bg-amber-600/20 border-b border-amber-500/30 text-amber-300 px-4 py-2 text-xs text-center flex items-center justify-center gap-2 z-50">
          <AlertCircle size={14} />
          <span>Local Mode: Firestore appears offline. Changes will save in cache memory.</span>
        </div>
      )}

      {/* Header Banner */}
      <header className="border-b border-slate-800 py-6 px-6 bg-navy-dark/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-1 text-[10px] font-mono font-medium tracking-widest text-amber-accent bg-amber-accent/10 border border-amber-accent/20 rounded-full flex items-center gap-1 uppercase">
                <Sparkles size={11} className="animate-pulse" />
                Autonomous Personal Assistant
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-slate-100 tracking-tight leading-none">
              Last-Minute <span className="text-amber-accent text-transparent bg-clip-text bg-gradient-to-r from-amber-accent via-amber-300 to-amber-accent">Life Saver</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-850">
              <span className={`w-2 h-2 rounded-full ${dbConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`}></span>
              {dbConnected ? "Firestore Live" : "Local Backup"}
            </span>
          </div>
        </div>
      </header>

      {/* Dashboard container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CHAOS INGESTION & COACHING */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Chaos Brain Dump Card */}
          <div className="bg-navy-card border border-slate-800/80 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
            <h2 className="text-base font-display font-semibold text-slate-200 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ListTodo size={16} className="text-amber-accent animate-pulse" />
                Raw Stress Stream
              </span>
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`p-1.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                  isListening
                    ? "bg-rose-500/15 border-rose-500 text-rose-400 animate-pulse"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-accent"
                }`}
                title={isListening ? "Stop Voice Assistance" : "Stream Voice Assistance"}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </h2>
            <p className="text-[11px] text-slate-400 mb-4 font-light leading-relaxed">
              Pour your clutter. Mention days, deadlines, subtasks, or random activities. Use the mic icon above to talk naturally!
            </p>

            <form onSubmit={handlePlanDay} className="space-y-4">
              <div className="relative">
                <textarea
                  id="brain-dump-input"
                  className={`w-full h-40 bg-slate-950/80 border rounded-xl p-4 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-accent/10 transition-all font-sans leading-relaxed resize-none ${
                    isListening ? "border-rose-500/40 ring-2 ring-rose-500/5" : "border-slate-800 focus:border-amber-accent/60"
                  }`}
                  placeholder={
                    isListening
                      ? "Listening to your voice... Speak clearly, and wait for pauses to commit."
                      : "e.g. math test on Tuesday, pitch deck by friday, stretch every morning, need to pick up laundry 4pm today..."
                  }
                  value={brainDump}
                  onChange={(e) => setBrainDump(e.target.value)}
                  disabled={isPlanning}
                />
                {isListening && (
                  <div className="absolute top-2 right-2 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span className="text-[9px] font-mono font-bold text-rose-400 uppercase tracking-widest">LIVE MIC</span>
                  </div>
                )}
                <div className="absolute bottom-3 right-3 text-[10px] text-slate-600 font-mono">
                  {brainDump.length} chars
                </div>
              </div>

              {/* Scenarios preset */}
              <div className="space-y-2">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Select Chaos Presets:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="text-[10px] bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 py-1.5 px-3 rounded-lg transition-all cursor-pointer font-medium"
                    onClick={() =>
                      applyTemplate(
                        "math paper due wednesday morning, dentist appointment tuesday 3pm, pay water invoice by friday, buy birthday gift, message boss about project status"
                      )
                    }
                    disabled={isPlanning}
                  >
                    💼 Studies & Office
                  </button>
                  <button
                    type="button"
                    className="text-[10px] bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 py-1.5 px-3 rounded-lg transition-all cursor-pointer font-medium"
                    onClick={() =>
                      applyTemplate(
                        "clean the kitchen counter, grocery shopping tonight, dentist tomorrow 2pm, stretch every morning, buy flight luggage before wednesday"
                      )
                    }
                    disabled={isPlanning}
                  >
                    🏠 Domestic Chores
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-rose-950/20 border border-rose-800/40 text-rose-300 p-3 rounded-xl text-xs flex gap-2 items-start">
                  <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-tight text-[11px]">{error}</span>
                </div>
              )}

              <button
                type="submit"
                className={`w-full py-2.5 px-4 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isPlanning
                    ? "bg-amber-accent/10 border border-amber-accent/30 text-amber-accent/80 cursor-not-allowed"
                    : "bg-amber-accent hover:bg-amber-hover text-slate-950 shadow-md shadow-amber-950/10"
                }`}
                disabled={isPlanning}
              >
                {isPlanning ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-amber-accent" />
                    Assembling Chaos Schedule...
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    Plan my day
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Productivity AI Coach Seraphina */}
          <AIRecommendations tasks={tasks} habits={habits} />
        </div>

        {/* RIGHT COLUMN: INTERACTIVE PANELS BOARD */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section Selector Tab-bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
              <button
                onClick={() => setActiveSection("tasks")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeSection === "tasks" ? "bg-slate-850 text-amber-accent font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Prioritized Tasks ({tasks.filter(t => !t.isDone).length})
              </button>
              <button
                onClick={() => setActiveSection("calendar")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeSection === "calendar" ? "bg-slate-850 text-amber-accent font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Time Grid
              </button>
              <button
                onClick={() => setActiveSection("habits")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeSection === "habits" ? "bg-slate-850 text-amber-accent font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Habits ({habits.length})
              </button>
            </div>

            {/* Clear database fallback */}
            {tasks.length > 0 && activeSection === "tasks" && (
              <button
                className="text-[10px] text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-all cursor-pointer"
                onClick={async () => {
                  if (confirm("Are you sure you want to clear all tasks? This is irreversible.")) {
                    const batch = writeBatch(db);
                    tasks.forEach((t) => {
                      batch.delete(doc(db, "tasks", t.id));
                    });
                    await batch.commit();
                  }
                }}
              >
                <Trash2 size={11} />
                Reset Board
              </button>
            )}
          </div>

          {/* SECTION 1: TASKS BOARD */}
          {activeSection === "tasks" && (
            <div className="space-y-6">
              
              {/* METABOLIC / COGNITIVE ADJUSTER */}
              <div className="bg-navy-card/50 border border-slate-850 p-4 rounded-2xl space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-display">
                    <Sliders size={13} className="text-amber-accent animate-pulse" />
                    Metabolic Prioritizer
                  </h4>
                  <button
                    onClick={handleAdjustPriorities}
                    disabled={isAdjusting}
                    className="text-[10px] bg-amber-accent/15 border border-amber-accent/30 text-amber-accent px-2.5 py-1 rounded-lg transition-all hover:bg-amber-accent hover:text-slate-950 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {isAdjusting ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
                    Recalculate Priorities
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">My Energy Level:</label>
                    <select
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-accent/50 cursor-pointer"
                      value={energyLevel}
                      onChange={(e: any) => setEnergyLevel(e.target.value)}
                    >
                      <option value="high">⚡ High Energy (Heavy lifting)</option>
                      <option value="medium">⚖ Medium Energy (Balanced day)</option>
                      <option value="low">🔋 Low Energy (Low friction wins)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Focus Strategy:</label>
                    <select
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-accent/50 cursor-pointer"
                      value={focusPreference}
                      onChange={(e: any) => setFocusPreference(e.target.value)}
                    >
                      <option value="balanced">Balanced Distribution</option>
                      <option value="quick-wins">Fast Momentum Chores First</option>
                      <option value="heavy-lifting">Tackle Critical Deep Work</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Priority Score List Filter */}
              <div className="flex justify-end gap-1 pb-1">
                <button
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-all ${
                    activeTab === "all" ? "bg-slate-900 text-amber-accent border border-slate-850" : "text-slate-500"
                  }`}
                  onClick={() => setActiveTab("all")}
                >
                  All
                </button>
                <button
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-all ${
                    activeTab === "active" ? "bg-slate-900 text-amber-accent border border-slate-850" : "text-slate-500"
                  }`}
                  onClick={() => setActiveTab("active")}
                >
                  Active ({sortedActiveTasks.length})
                </button>
                <button
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-all ${
                    activeTab === "done" ? "bg-slate-900 text-amber-accent border border-slate-850" : "text-slate-500"
                  }`}
                  onClick={() => setActiveTab("done")}
                >
                  Completed ({sortedDoneTasks.length})
                </button>
              </div>

              {/* Tasks mapping */}
              <div className="space-y-4">
                {displayedTasks.length === 0 ? (
                  <div className="bg-navy-card/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
                    <div className="mx-auto w-10 h-10 rounded-full bg-slate-950 border border-slate-850 flex items-center justify-center text-slate-500 mb-3">
                      <FileText size={16} />
                    </div>
                    <h3 className="text-slate-300 font-display font-medium text-sm">Task stack empty</h3>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-1 font-light leading-relaxed">
                      Your schedule is clear. Register a messy list of stressors on the left to activate prioritization.
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {displayedTasks.map((task) => {
                      const pInfo = getPriorityInfo(task.priorityScore);
                      const isExpanded = !!expandedTasks[task.id];
                      const isOutputExpanded = !!expandedOutputs[task.id];

                      return (
                        <motion.div
                          layout
                          key={task.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className={`bg-navy-card border border-slate-800 rounded-2xl overflow-hidden transition-all ${
                            task.isDone ? "opacity-60" : ""
                          } ${pInfo.borderClass}`}
                        >
                          <div className="p-4.5">
                            <div className="flex items-start justify-between gap-3">
                              {/* Left Checkbox & Text */}
                              <div className="flex items-start gap-3 flex-1">
                                <button
                                  className="mt-1 flex items-center justify-center w-4.5 h-4.5 rounded border border-slate-700 hover:border-amber-accent focus:outline-none transition-all shrink-0 bg-slate-950 cursor-pointer"
                                  onClick={() => handleToggleDone(task.id, task.isDone)}
                                >
                                  {task.isDone && <Check size={12} className="text-amber-accent stroke-[3]" />}
                                </button>
                                <div className="flex-1">
                                  <h3 className={`font-display text-sm font-bold leading-tight ${task.isDone ? "line-through text-slate-500 font-normal" : "text-slate-200"}`}>
                                    {task.title}
                                  </h3>
                                  {!task.isDone && (
                                    <p className="text-[11px] text-slate-400 mt-1 font-light leading-normal italic">
                                      "{task.priorityReasoning}"
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Right Fire Score Badge */}
                              <div className="text-right shrink-0">
                                <div className="flex items-center gap-1 justify-end">
                                  <Flame size={12} className={pInfo.scoreColor} />
                                  <span className={`text-md font-bold font-mono ${pInfo.scoreColor}`}>{task.priorityScore}</span>
                                </div>
                                <span className={`inline-block px-1.5 py-0.5 mt-1 rounded text-[9px] font-mono tracking-wider uppercase border ${pInfo.badgeClass}`}>
                                  {pInfo.label}
                                </span>
                              </div>
                            </div>

                            {/* Clock deadlines time slot details */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3.5 pt-3 border-t border-slate-850 text-[10px] text-slate-400 font-mono">
                              <div className="flex items-center gap-1.5 bg-slate-950/40 p-1.5 rounded-lg border border-slate-900">
                                <Calendar size={11} className="text-slate-500 shrink-0" />
                                <div className="truncate">
                                  <span className="text-[8px] text-slate-600 block uppercase font-bold leading-none">Deadline</span>
                                  <span className="text-slate-300 font-light truncate block">{task.deadline}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 bg-slate-950/40 p-1.5 rounded-lg border border-slate-900">
                                <Clock size={11} className="text-slate-500 shrink-0" />
                                <div>
                                  <span className="text-[8px] text-slate-600 block uppercase font-bold leading-none">Est. Time</span>
                                  <span className="text-slate-300 font-light block">{task.estimatedMinutes}m</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 bg-slate-950/40 p-1.5 rounded-lg border border-slate-900">
                                <Bookmark size={11} className="text-slate-500 shrink-0" />
                                <div className="truncate">
                                  <span className="text-[8px] text-slate-600 block uppercase font-bold leading-none">Time Slot</span>
                                  <span className="text-slate-300 font-light truncate block">{task.suggestedTimeSlot}</span>
                                </div>
                              </div>
                            </div>

                            {/* Reminder Scheduled display */}
                            {task.reminderTime && !task.isDone && (
                              <div className="mt-2.5 bg-amber-accent/5 border border-amber-accent/15 px-2 py-1.5 rounded-lg flex items-center justify-between text-[10px] font-mono">
                                <span className="flex items-center gap-1.5 text-amber-accent">
                                  <Bell size={11} className="animate-swing" />
                                  Reminder: {new Date(task.reminderTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <button
                                  onClick={() => handleClearReminder(task.id)}
                                  className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {/* Action Control row */}
                            <div className="flex flex-wrap items-center justify-between gap-2.5 mt-3 pt-3 border-t border-slate-850/60">
                              
                              {/* AI Roadmaps & Autonomous agent launch buttons */}
                              {!task.isDone && (
                                <div className="flex items-center gap-2">
                                  
                                  {/* Subtasks Roadmap button */}
                                  {task.subtasks && task.subtasks.length > 0 ? (
                                    <button
                                      onClick={() => setExpandedTasks((p) => ({ ...p, [task.id]: !p[task.id] }))}
                                      className="text-[10px] text-slate-400 hover:text-amber-accent flex items-center gap-1 bg-slate-950 hover:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-850 transition-all cursor-pointer font-medium"
                                    >
                                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      <span>Roadmap ({task.subtasks.length})</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleBreakIntoSubtasks(task)}
                                      disabled={task.isBreakingDown}
                                      className="text-[10px] text-amber-accent bg-amber-accent/5 hover:bg-amber-accent hover:text-slate-950 border border-amber-accent/20 px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-semibold"
                                    >
                                      {task.isBreakingDown ? (
                                        <>
                                          <RefreshCw size={10} className="animate-spin" />
                                          Drafting roadmap...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles size={10} />
                                          Roadmap
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {/* Autonomous execute button */}
                                  <button
                                    onClick={() => triggerAutonomousExecution(task)}
                                    disabled={task.isExecutingAutonomously}
                                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 cursor-pointer font-semibold ${
                                      task.executedOutput
                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950"
                                        : "bg-slate-950 border-slate-850 text-slate-300 hover:border-amber-accent"
                                    }`}
                                  >
                                    {task.isExecutingAutonomously ? (
                                      <>
                                        <RefreshCw size={10} className="animate-spin" />
                                        Running Autonomous...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles size={10} />
                                        {task.executedOutput ? "Re-Execute Agent" : "Auto-Execute"}
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}

                              {task.isDone && (
                                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                  <CheckCircle2 size={11} /> Ready
                                </span>
                              )}

                              {/* Reminder Bell config, Deletion */}
                              <div className="flex items-center gap-1.5 ml-auto">
                                {!task.isDone && (
                                  <div className="relative group/rem">
                                    <button className="p-1.5 rounded bg-slate-950/60 border border-slate-850 hover:border-amber-accent text-slate-400 hover:text-amber-accent transition-colors cursor-pointer">
                                      <Bell size={12} />
                                    </button>
                                    <div className="absolute bottom-full right-0 mb-1 hidden group-hover/rem:flex flex-col bg-slate-900 border border-slate-800 rounded-lg p-1.5 shadow-xl min-w-[120px] z-50 space-y-1">
                                      <p className="text-[9px] text-slate-500 font-mono text-center font-bold uppercase mb-1">Set alert in:</p>
                                      <button
                                        onClick={() => handleSetReminder(task.id, 1)}
                                        className="text-[9px] hover:bg-slate-800 text-slate-300 p-1 text-left rounded cursor-pointer"
                                      >
                                        ⏰ 1 min (Test)
                                      </button>
                                      <button
                                        onClick={() => handleSetReminder(task.id, 5)}
                                        className="text-[9px] hover:bg-slate-800 text-slate-300 p-1 text-left rounded cursor-pointer"
                                      >
                                        ⏰ 5 mins
                                      </button>
                                      <button
                                        onClick={() => handleSetReminder(task.id, 15)}
                                        className="text-[9px] hover:bg-slate-800 text-slate-300 p-1 text-left rounded cursor-pointer"
                                      >
                                        ⏰ 15 mins
                                      </button>
                                      <button
                                        onClick={() => handleSetReminder(task.id, 60)}
                                        className="text-[9px] hover:bg-slate-800 text-slate-300 p-1 text-left rounded cursor-pointer"
                                      >
                                        ⏰ 1 hour
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-slate-900/50 transition-colors cursor-pointer"
                                  title="Delete stress record"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Sequential breakdown subtasks list */}
                            <AnimatePresence>
                              {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden border-t border-slate-850 mt-3 pt-3"
                                >
                                  <div className="space-y-1.5">
                                    <p className="text-[10px] text-amber-accent font-bold uppercase tracking-wider font-mono mb-1 flex items-center gap-1">
                                      <Sparkles size={10} /> Active roadmap sequence:
                                    </p>
                                    {task.subtasks.map((sub) => (
                                      <div
                                        key={sub.stepNumber}
                                        className="flex items-center justify-between gap-3 bg-slate-950/40 border border-slate-900 p-2 rounded-xl text-[11px] hover:border-slate-850 transition-all"
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-4 h-4 rounded bg-amber-accent/15 border border-amber-accent/35 flex items-center justify-center font-mono text-[9px] font-bold text-amber-accent shrink-0">
                                            {sub.stepNumber}
                                          </div>
                                          <span className="text-slate-300 leading-normal font-light">{sub.title}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-mono">{sub.estimatedMinutes}m</span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Executed output deliverables */}
                            <AnimatePresence>
                              {task.executedOutput && (
                                <div className="border-t border-slate-850/60 mt-3 pt-3">
                                  <button
                                    onClick={() => setExpandedOutputs((p) => ({ ...p, [task.id]: !p[task.id] }))}
                                    className="w-full text-left text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/15 flex items-center justify-between cursor-pointer"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <FileText size={11} />
                                      AI Executed Deliverables (Ready)
                                    </span>
                                    {isOutputExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                  </button>

                                  {isOutputExpanded && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="bg-slate-950/70 border border-slate-900 rounded-xl p-3.5 mt-2.5 max-h-[250px] overflow-y-auto space-y-2 select-text"
                                    >
                                      {parseMarkdown(task.executedOutput)}
                                    </motion.div>
                                  )}
                                </div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: INTERACTIVE CALENDAR TIME GRID */}
          {activeSection === "calendar" && <VisualCalendar tasks={tasks} />}

          {/* SECTION 3: HABITS LOGGING & RECOMMENDATION */}
          {activeSection === "habits" && <HabitsTracker habits={habits} tasks={tasks} />}

        </div>
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-850 py-6 px-6 mt-12 bg-slate-950 text-slate-500 text-xs font-mono select-none">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="font-semibold text-slate-400 font-display">Last-Minute Life Saver</p>
            <p className="mt-0.5 text-[11px] font-light">Zero-latency autonomous brain dump planning and metabolics compiler.</p>
          </div>
          <div>
            <p className="text-[11px] font-light">Powered by Gemini 3.5 & Google Cloud Firestore</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

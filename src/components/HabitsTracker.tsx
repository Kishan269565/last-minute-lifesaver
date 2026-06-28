import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Flame, Plus, Check, ListTodo, AlertCircle, Sparkles, HelpCircle } from "lucide-react";
import { Habit, Task } from "../types";
import { addDoc, collection, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "../firebase";

interface HabitsTrackerProps {
  habits: Habit[];
  tasks: Task[];
}

export default function HabitsTracker({ habits, tasks }: HabitsTrackerProps) {
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddHabitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;

    try {
      await addDoc(collection(db, "habits"), {
        title: newHabitTitle.trim(),
        streak: 0,
        createdAt: new Date().toISOString(),
      });
      setNewHabitTitle("");
      setIsAdding(false);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, "habits");
    }
  };

  const handleCompleteHabit = async (habit: Habit) => {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    if (habit.lastCompletedDate === todayStr) {
      return; // already completed today!
    }

    try {
      const docRef = doc(db, "habits", habit.id);
      await updateDoc(docRef, {
        streak: habit.streak + 1,
        lastCompletedDate: todayStr,
      });
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `habits/${habit.id}`);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    if (!confirm("Are you sure you want to delete this habit?")) return;
    try {
      await deleteDoc(doc(db, "habits", habitId));
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `habits/${habitId}`);
    }
  };

  // Generate dynamic, task-aware habit recommendations
  const getSuggestedHabits = () => {
    const activeTasks = tasks.filter((t) => !t.isDone);
    const suggestions = [];

    if (activeTasks.some((t) => t.estimatedMinutes >= 60)) {
      suggestions.push("Focus for 25m blocks (Pomodoro)");
    }
    if (activeTasks.length >= 4) {
      suggestions.push("Prioritize tasks at 8:00 AM");
    }
    if (activeTasks.some((t) => t.title.toLowerCase().includes("essay") || t.title.toLowerCase().includes("code") || t.title.toLowerCase().includes("write"))) {
      suggestions.push("Clean desk environment");
    }
    
    // Default suggestion
    suggestions.push("Drink 3L of water");
    suggestions.push("Stretch for 5 minutes");

    // Filter suggestions that are already in habits list
    return suggestions.filter((s) => !habits.some((h) => h.title.toLowerCase() === s.toLowerCase())).slice(0, 2);
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const suggested = getSuggestedHabits();

  return (
    <div id="habits-tracker-view" className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-slate-200 font-display font-bold text-lg flex items-center gap-2">
            <Flame size={18} className="text-amber-accent" />
            Habit Alignment
          </h3>
          <p className="text-xs text-slate-500 font-light mt-0.5">
            Log constructive daily routines to maintain performance under stress.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="text-xs bg-amber-accent text-slate-950 py-1.5 px-3 rounded-lg flex items-center gap-1 hover:bg-amber-hover transition-all cursor-pointer font-bold shrink-0"
        >
          <Plus size={13} />
          New Habit
        </button>
      </div>

      {isAdding && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleAddHabitSubmit}
          className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex gap-2"
        >
          <input
            type="text"
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-accent/50 flex-1"
            placeholder="e.g. Code for 1 hour, Walk dog, Drink water..."
            value={newHabitTitle}
            onChange={(e) => setNewHabitTitle(e.target.value)}
            required
            autoFocus
          />
          <button
            type="submit"
            className="bg-amber-accent hover:bg-amber-hover text-slate-950 text-xs px-3 py-1.5 rounded-lg transition-all font-bold cursor-pointer"
          >
            Create
          </button>
        </motion.form>
      )}

      {/* Habit List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {habits.length === 0 ? (
          <div className="md:col-span-2 text-center py-8 bg-navy-card/40 border border-dashed border-slate-800 rounded-2xl p-6">
            <HelpCircle className="mx-auto text-slate-600 mb-2" size={20} />
            <p className="text-xs text-slate-500 font-light">No daily habits registered yet.</p>
          </div>
        ) : (
          habits.map((habit) => {
            const isCompletedToday = habit.lastCompletedDate === todayStr;

            return (
              <motion.div
                layout
                key={habit.id}
                className={`bg-navy-card border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all ${
                  isCompletedToday ? "border-emerald-500/30 bg-emerald-950/5" : ""
                }`}
              >
                <div>
                  <h4 className={`text-sm font-semibold ${isCompletedToday ? "text-slate-400 line-through" : "text-slate-200"}`}>
                    {habit.title}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Flame size={12} className={habit.streak > 0 ? "text-amber-accent" : "text-slate-600"} />
                    <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">
                      Streak: {habit.streak} {habit.streak === 1 ? "day" : "days"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCompleteHabit(habit)}
                    disabled={isCompletedToday}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isCompletedToday
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-not-allowed"
                        : "bg-slate-900 border border-slate-800 hover:border-amber-accent hover:bg-slate-850 text-slate-400"
                    }`}
                  >
                    <Check size={14} className={isCompletedToday ? "stroke-[3]" : ""} />
                  </button>

                  <button
                    onClick={() => handleDeleteHabit(habit.id)}
                    className="text-slate-600 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Task-Aware Recommendations */}
      {suggested.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-900/80 rounded-2xl p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-amber-accent" />
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-display">
              Task-Aligned Suggestions
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-normal mb-3 font-light">
            Gemini noticed your current workload has specific characteristics and generated these matching habits:
          </p>
          <div className="space-y-2">
            {suggested.map((s, idx) => (
              <div
                key={idx}
                className="bg-navy-card border border-slate-850 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs hover:border-slate-800 transition-all"
              >
                <span className="text-slate-300 font-medium">{s}</span>
                <button
                  onClick={async () => {
                    try {
                      await addDoc(collection(db, "habits"), {
                        title: s,
                        streak: 0,
                        createdAt: new Date().toISOString(),
                      });
                    } catch (err: any) {
                      handleFirestoreError(err, OperationType.WRITE, "habits");
                    }
                  }}
                  className="text-[10px] bg-amber-accent/10 border border-amber-accent/20 hover:bg-amber-accent hover:text-slate-950 text-amber-accent px-2 py-1 rounded transition-all cursor-pointer font-bold"
                >
                  Adopt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

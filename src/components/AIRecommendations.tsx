import React, { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, BrainCircuit, RefreshCw, Trophy, Target } from "lucide-react";
import { Task, Habit } from "../types";

interface AIRecommendationsProps {
  tasks: Task[];
  habits: Habit[];
}

interface CoachData {
  summary: string;
  recommendations: { title: string; advice: string }[];
}

export default function AIRecommendations({ tasks, habits }: AIRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [coachData, setCoachData] = useState<CoachData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeTasks = tasks.filter((t) => !t.isDone);
      const completedTasksCount = tasks.filter((t) => t.isDone).length;

      const response = await fetch("/api/productivity-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeTasks,
          completedTasksCount,
          habits,
        }),
      });

      if (!response.ok) {
        throw new Error("Coach was unavailable. Try again in a moment.");
      }

      const data = await response.json();
      setCoachData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to consult Seraphina.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="ai-recommendations-panel" className="bg-navy-card border border-slate-800/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-accent/5 rounded-full blur-2xl"></div>
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <BrainCircuit size={16} className="text-amber-accent animate-pulse" />
          AI Coach Seraphina
        </h3>
        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="text-xs text-amber-accent hover:text-slate-950 hover:bg-amber-accent bg-amber-accent/10 border border-amber-accent/20 rounded-lg px-2.5 py-1.5 transition-all flex items-center gap-1 cursor-pointer font-semibold"
        >
          {loading ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          <span>{coachData ? "Re-Analyze" : "Consult Coach"}</span>
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center space-y-3">
          <RefreshCw size={24} className="animate-spin text-amber-accent mx-auto" />
          <p className="text-xs text-slate-400 font-light">Seraphina is scanning your current workload and habits...</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-950/20 border border-rose-800/30 text-rose-300 rounded-xl text-xs">
          {error}
        </div>
      )}

      {!loading && !coachData && !error && (
        <div className="text-center py-6">
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed font-light">
            Need direction? Ask Seraphina to analyze your current tasks and streaks to receive personalized, action-ready tips.
          </p>
        </div>
      )}

      {coachData && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Summary / Assessment */}
          <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl">
            <p className="text-xs text-slate-300 leading-relaxed font-sans italic">
              "{coachData.summary}"
            </p>
          </div>

          {/* Recommendations Cards */}
          <div className="space-y-3">
            {coachData.recommendations.map((rec, i) => (
              <div
                key={i}
                className="bg-slate-950/30 border border-slate-900 p-3.5 rounded-xl hover:border-slate-800 transition-all flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded bg-amber-accent/10 border border-amber-accent/20 flex items-center justify-center shrink-0 text-amber-accent text-xs">
                  {i === 0 ? <Target size={12} /> : i === 1 ? <Trophy size={12} /> : <BrainCircuit size={12} />}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-amber-accent font-display">
                    {rec.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal font-light">
                    {rec.advice}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

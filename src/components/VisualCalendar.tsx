import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar as CalendarIcon, Clock, Share2, Plus, Check } from "lucide-react";
import { Task } from "../types";
import { updateDoc, doc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "../firebase";

interface VisualCalendarProps {
  tasks: Task[];
}

export default function VisualCalendar({ tasks }: VisualCalendarProps) {
  const [activeTaskToAssign, setActiveTaskToAssign] = useState<string>("");
  const [assigningHour, setAssigningHour] = useState<string | null>(null);

  const activeTasks = tasks.filter((t) => !t.isDone);

  // standard hourly schedule
  const hours = [
    "8:00 AM",
    "9:00 AM",
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "1:00 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
    "5:00 PM",
    "6:00 PM",
    "7:00 PM",
    "8:00 PM",
  ];

  // Helper to match tasks with hour slots
  const getTasksForHour = (hour: string) => {
    return activeTasks.filter((t) => {
      if (!t.suggestedTimeSlot) return false;
      const normalizedSlot = t.suggestedTimeSlot.toLowerCase();
      const normalizedHour = hour.toLowerCase();

      // Simple match heuristics
      if (normalizedSlot.includes(normalizedHour)) return true;

      // Handle morning/afternoon heuristics
      if (normalizedSlot.includes("morning") && (hour === "9:00 AM" || hour === "10:00 AM")) return true;
      if (normalizedSlot.includes("afternoon") && (hour === "2:00 PM" || hour === "3:00 PM")) return true;
      if (normalizedSlot.includes("evening") && (hour === "6:00 PM" || hour === "7:00 PM")) return true;

      return false;
    });
  };

  // Export to standard calendar standard .ics file
  const exportToICS = () => {
    if (activeTasks.length === 0) {
      alert("No active tasks to export!");
      return;
    }
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Last-Minute Life Saver//EN\n";
    activeTasks.forEach((t) => {
      const now = new Date();
      const dateStr = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      icsContent += "BEGIN:VEVENT\n";
      icsContent += `SUMMARY:${t.title}\n`;
      icsContent += `DESCRIPTION:${t.priorityReasoning} | Est: ${t.estimatedMinutes} mins\n`;
      icsContent += `DTSTAMP:${dateStr}\n`;
      icsContent += `DTSTART:${dateStr}\n`;
      icsContent += `DURATION:PT${t.estimatedMinutes}M\n`;
      icsContent += "END:VEVENT\n";
    });
    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "life-saver-schedule.ics");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAssignTask = async (hour: string) => {
    if (!activeTaskToAssign) return;
    try {
      const docRef = doc(db, "tasks", activeTaskToAssign);
      await updateDoc(docRef, {
        suggestedTimeSlot: `Today at ${hour}`,
      });
      setActiveTaskToAssign("");
      setAssigningHour(null);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${activeTaskToAssign}`);
    }
  };

  return (
    <div id="visual-calendar-view" className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-slate-200 font-display font-bold text-lg flex items-center gap-2">
            <CalendarIcon size={18} className="text-amber-accent" />
            Daily Time Grid
          </h3>
          <p className="text-xs text-slate-500 font-light mt-0.5">
            Visualize your tasks in designated slots or schedule unallocated items.
          </p>
        </div>
        <button
          onClick={exportToICS}
          className="text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-slate-850 cursor-pointer font-semibold shrink-0"
        >
          <Share2 size={13} className="text-amber-accent" />
          Export to Google/iCal (.ics)
        </button>
      </div>

      {/* Hourly Plot Grid */}
      <div className="bg-navy-card/40 border border-slate-800/80 rounded-2xl p-4 divide-y divide-slate-800/40">
        {hours.map((hour) => {
          const hourTasks = getTasksForHour(hour);
          const isAssigning = assigningHour === hour;

          return (
            <div key={hour} className="py-3 flex flex-col md:flex-row items-start gap-3 md:gap-4 group">
              <div className="w-20 shrink-0 font-mono text-xs text-slate-500 flex items-center gap-1.5 pt-1 font-bold">
                <Clock size={11} className="text-slate-600" />
                {hour}
              </div>

              <div className="flex-1 w-full space-y-2">
                {hourTasks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {hourTasks.map((t) => (
                      <motion.div
                        layout
                        key={t.id}
                        className="bg-amber-accent/5 border border-amber-accent/20 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-xs w-full max-w-md hover:border-amber-accent/40 transition-all"
                      >
                        <div className="truncate">
                          <p className="font-semibold text-slate-200 truncate">{t.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            Duration: {t.estimatedMinutes}m | {t.deadline}
                          </p>
                        </div>
                        <div className="w-5 h-5 rounded-full bg-amber-accent/10 border border-amber-accent/20 flex items-center justify-center font-mono text-[10px] text-amber-accent font-bold">
                          {t.priorityScore}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="h-7 flex items-center">
                    {isAssigning ? (
                      <div className="flex items-center gap-2 w-full max-w-md">
                        <select
                          className="bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs text-slate-300 focus:outline-none focus:border-amber-accent/50 flex-1"
                          value={activeTaskToAssign}
                          onChange={(e) => setActiveTaskToAssign(e.target.value)}
                        >
                          <option value="">-- Choose Task --</option>
                          {activeTasks
                            .filter((at) => !at.suggestedTimeSlot.toLowerCase().includes(hour.toLowerCase()))
                            .map((at) => (
                              <option key={at.id} value={at.id}>
                                {at.title} ({at.estimatedMinutes}m)
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleAssignTask(hour)}
                          disabled={!activeTaskToAssign}
                          className="bg-amber-accent text-slate-950 p-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setAssigningHour(null)}
                          className="text-slate-500 hover:text-slate-300 text-xs px-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAssigningHour(hour);
                          setActiveTaskToAssign("");
                        }}
                        className="text-[10px] text-slate-600 hover:text-amber-accent flex items-center gap-1 font-mono transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                      >
                        <Plus size={10} />
                        Quick-schedule task here
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

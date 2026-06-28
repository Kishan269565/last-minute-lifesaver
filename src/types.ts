export interface Subtask {
  stepNumber: number;
  title: string;
  estimatedMinutes: number;
}

export interface Task {
  id: string; // Firebase doc ID
  title: string;
  deadline: string;
  estimatedMinutes: number;
  priorityScore: number;
  priorityReasoning: string;
  suggestedTimeSlot: string;
  isDone: boolean;
  createdAt: string; // ISO String
  subtasks?: Subtask[];
  isBreakingDown?: boolean; // loading state flag for subtasks
  executedOutput?: string;
  isExecutingAutonomously?: boolean;
  reminderTime?: string;
  reminderFired?: boolean;
}

export interface Habit {
  id: string; // Firebase doc ID
  title: string;
  streak: number;
  lastCompletedDate?: string; // YYYY-MM-DD
  createdAt: string; // ISO String
}


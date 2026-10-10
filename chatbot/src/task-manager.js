// ============================================
// Task Manager — Tracks conversations
// ============================================
// Each backend prompt creates a "task". Felix
// tracks the conversation until it's resolved.
// ============================================

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "tasks.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error loading tasks:", e.message);
  }
  return { tasks: [] };
}

function createTaskManager() {
  const state = loadState();

  function saveState() {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  // ============================================
  // Create a new task
  // ============================================
  function createTask({ prompt, targetNumber, context, createdAt }) {
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      targetNumber,
      context,
      status: "active", // active, completed, failed, escalated
      history: [],
      createdAt,
      updatedAt: createdAt,
      result: null,
    };
    state.tasks.push(task);
    saveState();
    return task;
  }

  // ============================================
  // Add a message to a task's history
  // ============================================
  function addMessage(taskId, role, content) {
    const task = getTask(taskId);
    if (!task) return;
    task.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    task.updatedAt = new Date().toISOString();
    saveState();
  }

  // ============================================
  // Get active task for a WhatsApp number
  // ============================================
  function getActiveTaskForNumber(number) {
    // Return the most recent active task for this number
    for (let i = state.tasks.length - 1; i >= 0; i--) {
      if (state.tasks[i].targetNumber === number && state.tasks[i].status === "active") {
        return state.tasks[i];
      }
    }
    return null;
  }

  // ============================================
  // Complete a task
  // ============================================
  function completeTask(taskId, result) {
    const task = getTask(taskId);
    if (!task) return;
    task.status = "completed";
    task.result = result;
    task.updatedAt = new Date().toISOString();
    saveState();
  }

  // ============================================
  // Fail a task
  // ============================================
  function failTask(taskId, result) {
    const task = getTask(taskId);
    if (!task) return;
    task.status = "failed";
    task.result = result;
    task.updatedAt = new Date().toISOString();
    saveState();
  }

  // ============================================
  // Escalate a task
  // ============================================
  function escalateTask(taskId, result) {
    const task = getTask(taskId);
    if (!task) return;
    task.status = "escalated";
    task.result = result;
    task.updatedAt = new Date().toISOString();
    saveState();
  }

  // ============================================
  // Getters
  // ============================================
  function getTask(id) {
    return state.tasks.find((t) => t.id === id);
  }

  function getAllTasks() {
    return state.tasks;
  }

  function getActiveTasks() {
    return state.tasks.filter((t) => t.status === "active");
  }

  return {
    createTask,
    addMessage,
    getActiveTaskForNumber,
    completeTask,
    failTask,
    escalateTask,
    getTask,
    getAllTasks,
    getActiveTasks,
    saveState,
  };
}

module.exports = { createTaskManager };

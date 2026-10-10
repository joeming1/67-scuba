// ============================================
// Fix It Felix — Telegram Bot Version (v3.0)
// ============================================
// Uses Telegram Bot API — free, no verification,
// no phone number, instant delivery.
//
// ARCHITECTURE:
//   WorkBuddy → POST /prompt → Felix (AI) → Telegram → Technician
//                                                              ↓
//   WorkBuddy ← Task status ← Felix (AI evaluates) ← Telegram ← Technician replies
// ============================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
require("dotenv").config();

const { createFelixBrain } = require("./brain");
const { createTaskManager } = require("./task-manager");

// ============================================
// Config
// ============================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PORT = parseInt(process.env.API_PORT || "3001");

// ============================================
// Initialize Felix
// ============================================
const felix = createFelixBrain({ geminiKey: GEMINI_API_KEY });
const taskManager = createTaskManager();

// Track chat IDs of people who message the bot
const knownChats = new Map(); // chatId -> { name, username, isTechnician }

// ============================================
// Telegram API helper
// ============================================
function telegramAPI(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (!json.ok) {
            console.error(`  Telegram API error (${method}):`, json.description);
            reject(new Error(json.description || "Telegram API error"));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error("Telegram parse error: " + e.message));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ============================================
// Send Telegram message
// ============================================
async function sendTelegramMessage(chatId, text) {
  return telegramAPI("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  });
}

// Send typing indicator
async function sendChatAction(chatId) {
  try {
    await telegramAPI("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });
  } catch {}
}

// ============================================
// Handle incoming Telegram message
// ============================================
async function handleTelegramMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const fromName = msg.from?.first_name || msg.from?.username || "Unknown";
  const username = msg.from?.username || "";
  const timestamp = new Date().toLocaleTimeString();

  // Register this chat
  knownChats.set(chatId, { name: fromName, username, chatId });

  console.log(`\n[${timestamp}] 📨 ${fromName} (${chatId}): "${text}"`);

  // Handle /start command
  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      "🔧 <b>Hi! I'm Fix It Felix</b>\n\nI'm a dispatch bot. A backend can send me prompts to text you about repair jobs.\n\nJust message me naturally and I'll respond!"
    );
    return;
  }

  // Handle /help command
  if (text === "/help") {
    await sendTelegramMessage(
      chatId,
      "🔧 <b>Fix It Felix Commands</b>\n\n/start - Initialize\n/help - Show this help\n/status - Check bot status\n\nOr just send me any message!"
    );
    return;
  }

  // Handle /status command
  if (text === "/status") {
    const activeTasks = taskManager.getActiveTasks();
    await sendTelegramMessage(
      chatId,
      `🔧 <b>Felix Status</b>\n\nStatus: Online ✅\nAI: Gemini ✅\nActive tasks: ${activeTasks.length}\nKnown chats: ${knownChats.size}`
    );
    return;
  }

  // Find active task for this chat
  const activeTask = taskManager.getActiveTaskForNumber(String(chatId));

  if (!activeTask) {
    // No active task — Felix responds as a general assistant
    await sendChatAction(chatId);
    try {
      // Use Felix's brain to craft a response
      const fakeTask = { id: "ad-hoc", prompt: "General conversation", context: {} };
      const evaluation = await felix.evaluateReply({
        task: fakeTask,
        technicianReply: text,
        conversationHistory: [],
      });

      if (evaluation.followup_message) {
        await sendTelegramMessage(chatId, evaluation.followup_message);
      } else {
        await sendTelegramMessage(
          chatId,
          "Eh bro, I'm Felix, the dispatch bot. Right now no job assigned yet. The backend will send me a job to relay to you. Just wait ya!"
        );
      }
    } catch (err) {
      console.error("  Error:", err.message);
      await sendTelegramMessage(
        chatId,
        "Sorry bro, I had a brain freeze. Try again?"
      );
    }
    return;
  }

  // Active task found — Felix evaluates the reply
  await sendChatAction(chatId);

  try {
    const evaluation = await felix.evaluateReply({
      task: activeTask,
      technicianReply: text,
      conversationHistory: activeTask.history,
    });

    console.log(`\n  🧠 Felix Evaluation:`);
    console.log(`     Status: ${evaluation.status}`);
    console.log(`     Reasoning: ${evaluation.reasoning}`);
    if (evaluation.extracted_data) {
      console.log(`     Data: ${JSON.stringify(evaluation.extracted_data)}`);
    }

    taskManager.addMessage(activeTask.id, "technician", text);
    taskManager.addMessage(activeTask.id, "felix_eval", JSON.stringify(evaluation));

    if (evaluation.followup_message) {
      console.log(`\n  📤 Felix replying: "${evaluation.followup_message}"`);
      await sendTelegramMessage(chatId, evaluation.followup_message);
      taskManager.addMessage(activeTask.id, "felix_sent", evaluation.followup_message);
    }

    if (evaluation.status === "confirmed") {
      taskManager.completeTask(activeTask.id, evaluation);
      console.log(`\n  ✅ Task CONFIRMED: ${evaluation.summary || "done"}`);
    } else if (evaluation.status === "declined") {
      taskManager.failTask(activeTask.id, evaluation);
      console.log(`\n  ❌ Task DECLINED`);
    } else if (evaluation.status === "escalate") {
      taskManager.escalateTask(activeTask.id, evaluation);
      console.log(`\n  🚨 ESCALATION NEEDED`);
    }

    taskManager.saveState();
  } catch (error) {
    console.error("  ❌ Error:", error.message);
    await sendTelegramMessage(chatId, "Sorry boss, I had an error processing that. Try again?");
  }
}

// ============================================
// Telegram Polling — receive messages
// ============================================
let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const updates = await telegramAPI("getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      lastUpdateId = update.update_id;
      if (update.message) {
        // Handle in background (don't block polling)
        handleTelegramMessage(update.message).catch((err) => {
          console.error("  Message handler error:", err.message);
        });
      }
    }
  } catch (err) {
    // Network errors are fine, just retry
    if (!err.message.includes("timeout")) {
      console.error("  Polling error:", err.message);
    }
  }

  // Continue polling
  setTimeout(pollTelegram, 1000);
}

// ============================================
// HTTP API server (for WorkBuddy to send prompts)
// ============================================
const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/prompt") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { message, context = {}, chatId } = JSON.parse(body);

        // Use provided chatId, or the first known chat, or the configured one
        const targetChat = chatId || process.env.TECHNICIAN_CHAT_ID || (knownChats.size > 0 ? knownChats.keys().next().value : null);

        if (!targetChat) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No chat ID. Message the bot first on Telegram, or set TECHNICIAN_CHAT_ID in .env" }));
          return;
        }

        // Create task
        const task = taskManager.createTask({
          prompt: message,
          targetNumber: String(targetChat),
          context,
          createdAt: new Date().toISOString(),
        });

        // Felix crafts a natural message
        const felixMessage = await felix.craftMessage({
          task,
          backendPrompt: message,
        });

        // Send via Telegram
        await sendTelegramMessage(targetChat, felixMessage);
        taskManager.addMessage(task.id, "felix_sent", felixMessage);
        taskManager.saveState();

        console.log(`\n[${new Date().toLocaleTimeString()}] 📤 Sent to technician (${targetChat}):`);
        console.log(`  "${felixMessage}"`);
        console.log(`  Task ID: ${task.id}\n`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          taskId: task.id,
          sentMessage: felixMessage,
          status: "waiting_for_reply",
        }));
      } catch (error) {
        console.error("API error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/tasks") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(taskManager.getAllTasks()));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/task/")) {
    const taskId = req.url.split("/task/")[1];
    const task = taskManager.getTask(taskId);
    if (!task) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(task));
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      botName: "Fix It Felix",
      platform: "Telegram",
      ai: GEMINI_API_KEY ? "Gemini ✅" : "⚠️ None",
      activeTasks: taskManager.getActiveTasks().length,
      knownChats: knownChats.size,
      chatIds: Array.from(knownChats.keys()),
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ============================================
// Start everything
// ============================================
server.listen(PORT, () => {
  console.log("\n========================================");
  console.log("  🔧 FIX IT FELIX v3.0 — Telegram Mode 🔧");
  console.log("========================================");
  console.log(`  📡 API Server: http://localhost:${PORT}`);
  console.log(`  🤖 Telegram: @fix_it_felix_bot`);
  console.log(`  🧠 AI: ${GEMINI_API_KEY ? "Gemini ✅" : "⚠️ None"}`);
  console.log("========================================");
  console.log("\n  Endpoints:");
  console.log("    POST /prompt   — Send a prompt (Felix texts the technician)");
  console.log("    GET  /tasks    — View all tasks");
  console.log("    GET  /task/:id — View a specific task");
  console.log("    GET  /health   — Check status");
  console.log("\n  Telegram Commands:");
  console.log("    /start  — Initialize chat");
  console.log("    /help   — Show help");
  console.log("    /status — Bot status");
  console.log("\n  👉 Message @fix_it_felix_bot on Telegram to start!\n");

  // Start polling for Telegram messages
  console.log("  📡 Starting Telegram polling...");
  pollTelegram();
});

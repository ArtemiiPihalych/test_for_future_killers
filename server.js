const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "questions.private.json"), "utf8"));
const sessions = new Map();
const allowedCounts = new Set([10, 30, 50, 100]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body is too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    options: question.options
  };
}

function pickQuestions(count) {
  const copy = QUESTIONS.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function gradeFor(percent) {
  if (percent >= 90) return 5;
  if (percent >= 75) return 4;
  if (percent >= 60) return 3;
  return 2;
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/meta") {
    return sendJson(res, 200, {
      totalQuestions: QUESTIONS.length,
      counts: [10, 30, 50, 100]
    });
  }

  if (req.method === "POST" && req.url === "/api/start") {
    const body = await readBody(req);
    const count = Number(body.count);
    if (!allowedCounts.has(count) || count > QUESTIONS.length) {
      return sendJson(res, 400, { error: "Недопустимое количество вопросов" });
    }
    const selected = pickQuestions(count);
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      selected,
      answers: new Map(),
      createdAt: Date.now()
    });
    return sendJson(res, 200, {
      sessionId,
      questions: selected.map(publicQuestion)
    });
  }

  if (req.method === "POST" && req.url === "/api/answer") {
    const body = await readBody(req);
    const session = sessions.get(String(body.sessionId || ""));
    if (!session) return sendJson(res, 404, { error: "Сессия не найдена" });

    const question = session.selected.find(item => item.id === Number(body.questionId));
    const selectedIndex = Number(body.optionIndex);
    if (!question || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) {
      return sendJson(res, 400, { error: "Некорректный ответ" });
    }

    if (!session.answers.has(question.id)) {
      session.answers.set(question.id, selectedIndex);
    }
    const storedIndex = session.answers.get(question.id);
    const score = [...session.answers.entries()].filter(([id, answer]) => {
      const item = session.selected.find(questionItem => questionItem.id === id);
      return item && item.answer === answer;
    }).length;

    return sendJson(res, 200, {
      selectedIndex: storedIndex,
      correctIndex: question.answer,
      correct: storedIndex === question.answer,
      answered: session.answers.size,
      score
    });
  }

  if (req.method === "POST" && req.url === "/api/finish") {
    const body = await readBody(req);
    const session = sessions.get(String(body.sessionId || ""));
    if (!session) return sendJson(res, 404, { error: "Сессия не найдена" });
    const total = session.selected.length;
    const score = [...session.answers.entries()].filter(([id, answer]) => {
      const item = session.selected.find(questionItem => questionItem.id === id);
      return item && item.answer === answer;
    }).length;
    const percent = Math.round((score / total) * 100);
    return sendJson(res, 200, {
      total,
      score,
      percent,
      grade: gradeFor(percent)
    });
  }

  return sendJson(res, 404, { error: "Маршрут не найден" });
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC, safePath));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png"
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => sendJson(res, 500, { error: error.message }));
    return;
  }
  serveStatic(req, res);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`GosTest trainer is running at http://localhost:${port}`);
});

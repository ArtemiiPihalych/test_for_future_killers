const startScreen = document.querySelector("#startScreen");
const quizScreen = document.querySelector("#quizScreen");
const finalScreen = document.querySelector("#finalScreen");
const startForm = document.querySelector("#startForm");
const countGrid = document.querySelector("#countGrid");
const totalQuestions = document.querySelector("#totalQuestions");
const questionCounter = document.querySelector("#questionCounter");
const scoreCounter = document.querySelector("#scoreCounter");
const progressBar = document.querySelector("#progressBar");
const questionText = document.querySelector("#questionText");
const optionsNode = document.querySelector("#options");
const nextButton = document.querySelector("#nextButton");
const backButton = document.querySelector("#backButton");
const retryButton = document.querySelector("#retryButton");
const resultPercent = document.querySelector("#resultPercent");
const resultGrade = document.querySelector("#resultGrade");
const resultMessage = document.querySelector("#resultMessage");
const resultDetails = document.querySelector("#resultDetails");

let selectedCount = 10;
let sessionId = null;
let questions = [];
let currentIndex = 0;
let score = 0;
let answeredCurrent = false;
let staticSession = null;

const gradeMessages = {
  2: "Ты совсем дурак? Развивайся!",
  3: "Похуй и так сойдёт",
  4: "Подучи ещё и возможно, станешь врачом",
  5: "Ебать ты вундеркинд. Бабушке своей красный диплом отдашь"
};

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const blocked =
    event.key === "F12" ||
    (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
    (event.ctrlKey && key === "u");

  if (blocked) {
    event.preventDefault();
    event.stopPropagation();
  }
});

document.addEventListener("contextmenu", event => {
  event.preventDefault();
});

async function api(path, body) {
  if (Array.isArray(window.QUESTION_BANK)) {
    return staticApi(path, body);
  }

  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

function staticApi(path, body) {
  if (path === "/api/meta") {
    return Promise.resolve({
      totalQuestions: window.QUESTION_BANK.length,
      counts: [10, 30, 50, 100]
    });
  }

  if (path === "/api/start") {
    const count = Number(body.count);
    const selected = shuffle(window.QUESTION_BANK).slice(0, count);
    staticSession = {
      id: crypto.randomUUID(),
      selected,
      answers: new Map()
    };
    return Promise.resolve({
      sessionId: staticSession.id,
      questions: selected.map(publicQuestion)
    });
  }

  if (path === "/api/answer") {
    const question = staticSession?.selected.find(item => item.id === Number(body.questionId));
    const selectedIndex = Number(body.optionIndex);
    if (!question) {
      return Promise.reject(new Error("Сессия не найдена"));
    }
    if (!staticSession.answers.has(question.id)) {
      staticSession.answers.set(question.id, selectedIndex);
    }
    const storedIndex = staticSession.answers.get(question.id);
    const currentScore = getStaticScore();
    return Promise.resolve({
      selectedIndex: storedIndex,
      correctIndex: question.answer,
      correct: storedIndex === question.answer,
      answered: staticSession.answers.size,
      score: currentScore
    });
  }

  if (path === "/api/finish") {
    const total = staticSession.selected.length;
    const currentScore = getStaticScore();
    const percent = Math.round((currentScore / total) * 100);
    return Promise.resolve({
      total,
      score: currentScore,
      percent,
      grade: gradeFor(percent)
    });
  }

  return Promise.reject(new Error("Маршрут не найден"));
}

function publicQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    options: question.options
  };
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getStaticScore() {
  return [...staticSession.answers.entries()].filter(([id, answer]) => {
    const question = staticSession.selected.find(item => item.id === id);
    return question && question.answer === answer;
  }).length;
}

function gradeFor(percent) {
  if (percent >= 90) return 5;
  if (percent >= 75) return 4;
  if (percent >= 60) return 3;
  return 2;
}

function show(screen) {
  [startScreen, quizScreen, finalScreen].forEach(node => node.classList.add("hidden"));
  screen.classList.remove("hidden");
}

function renderCounts(counts) {
  countGrid.innerHTML = "";
  counts.forEach(count => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `count-option ${count === selectedCount ? "selected" : ""}`;
    button.innerHTML = `${count}<span>вопросов</span>`;
    button.addEventListener("click", () => {
      selectedCount = count;
      renderCounts(counts);
    });
    countGrid.append(button);
  });
}

function renderQuestion() {
  const item = questions[currentIndex];
  answeredCurrent = false;
  nextButton.disabled = true;
  nextButton.textContent = currentIndex === questions.length - 1 ? "Завершить" : "Следующий вопрос";
  questionCounter.textContent = `${currentIndex + 1} / ${questions.length}`;
  scoreCounter.textContent = `${score} верно`;
  progressBar.style.width = `${(currentIndex / questions.length) * 100}%`;
  questionText.textContent = item.question;
  optionsNode.innerHTML = "";

  item.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.textContent = option;
    button.addEventListener("click", () => submitAnswer(item.id, index));
    optionsNode.append(button);
  });
}

async function submitAnswer(questionId, optionIndex) {
  if (answeredCurrent) return;
  answeredCurrent = true;
  const buttons = [...optionsNode.querySelectorAll(".option-button")];
  buttons.forEach(button => {
    button.disabled = true;
  });

  const result = await api("/api/answer", { sessionId, questionId, optionIndex });
  score = result.score;
  scoreCounter.textContent = `${score} верно`;
  buttons[result.correctIndex]?.classList.add("correct");
  if (!result.correct) {
    buttons[result.selectedIndex]?.classList.add("wrong");
  }
  nextButton.disabled = false;
}

async function startQuiz() {
  const data = await api("/api/start", { count: selectedCount });
  sessionId = data.sessionId;
  questions = data.questions;
  currentIndex = 0;
  score = 0;
  show(quizScreen);
  renderQuestion();
}

async function finishQuiz() {
  const result = await api("/api/finish", { sessionId });
  resultPercent.textContent = `${result.percent}%`;
  resultGrade.textContent = `Оценка ${result.grade}`;
  resultMessage.textContent = gradeMessages[result.grade];
  resultDetails.textContent = `Правильных ответов: ${result.score} из ${result.total}.`;
  show(finalScreen);
}

nextButton.addEventListener("click", () => {
  if (currentIndex < questions.length - 1) {
    currentIndex += 1;
    renderQuestion();
    return;
  }
  finishQuiz();
});

startForm.addEventListener("submit", event => {
  event.preventDefault();
  startQuiz().catch(error => alert(error.message));
});

backButton.addEventListener("click", () => show(startScreen));
retryButton.addEventListener("click", () => show(startScreen));

api("/api/meta")
  .then(meta => {
    totalQuestions.textContent = meta.totalQuestions;
    renderCounts(meta.counts);
  })
  .catch(error => {
    totalQuestions.textContent = "0";
    alert(error.message);
  });

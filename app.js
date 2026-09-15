const DATA_SOURCES = [
  { id: "it", label: "Từ vựng IT", file: "./data.json" },
  { id: "common", label: "600 từ vựng thông dụng", file: "./data-common.json" }
];

function normalizeWordRecords(data) {
  if (!Array.isArray(data)) return [];

  const flatRecords = [];

  data.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;

    const topicName = item.topic || item.label || 'General';

    if (Array.isArray(item.words)) {
      item.words.forEach((wordItem, wordIndex) => {
        if (!wordItem || typeof wordItem !== 'object') return;

        const word = wordItem.word || wordItem.english || 'Unknown';
        flatRecords.push({
          id: `${topicName}-${wordIndex}-${word}`,
          topic: topicName,
          word,
          type: String(wordItem.type || 'noun').toLowerCase(),
          phonetic: wordItem.phonetic || wordItem.pron || '',
          meaning: wordItem.meaning || (Array.isArray(wordItem.vietnamese) ? wordItem.vietnamese.join(', ') : (wordItem.vietnamese || '')),
          example: wordItem.example || ''
        });
      });
      return;
    }

    if (item.word || item.english) {
      const word = item.word || item.english || 'Unknown';
      flatRecords.push({
        id: item.id || `${topicName}-${index}-${word}`,
        topic: topicName,
        word,
        type: String(item.type || 'noun').toLowerCase(),
        phonetic: item.phonetic || item.pron || '',
        meaning: item.meaning || (Array.isArray(item.vietnamese) ? item.vietnamese.join(', ') : (item.vietnamese || '')),
        example: item.example || ''
      });
    }
  });

  return flatRecords;
}

async function loadWords() {
  const loadedSources = await Promise.all(DATA_SOURCES.map(async source => {
    try {
      const response = await fetch(source.file);
      if (!response.ok) {
        throw new Error(`Không đọc được ${source.file}`);
      }

      const records = normalizeWordRecords(await response.json());
      return records.map(record => ({
        ...record,
        sourceId: source.id,
        sourceLabel: source.label
      }));
    } catch (error) {
      console.warn(`Không load được ${source.file}:`, error);
      return [];
    }
  }));

  return loadedSources.flat();
}

let allWords = [];
let words = [];
let currentIndex = 0;

// Quiz State
let quizScore = 0;
let currentQuizIndex = 0;
let quizQuestions = [];
let quizOptionPool = [];
let quizRoundMistakes = [];
let quizCorrectIds = new Set();
let quizIsRetryRound = false;
let currentQuizAnswered = false;

// DOM Elements - Common
const btnToggleMode = document.getElementById("btn-toggle-mode");
const typingModeBtn = document.getElementById("typing-mode-btn");
const flashcardScreen = document.getElementById("flashcard-screen");
const quizScreen = document.getElementById("quiz-screen");
const typingScreen = document.getElementById("typing-screen");

// DOM Elements - Flashcard
const cardElement = document.getElementById("card");
const wordTypeEl = document.getElementById("word-type");
const wordTextEl = document.getElementById("word-text");
const wordPhoneticEl = document.getElementById("word-phonetic");
const wordMeaningEl = document.getElementById("word-meaning");
const wordExampleEl = document.getElementById("word-example");
const currentIndexEl = document.getElementById("current-index");
const totalWordsEl = document.getElementById("total-words");
const btnFlip = document.getElementById("btn-flip");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnSpeak = document.getElementById("btn-speak");
const studyModeEl = document.getElementById("study-mode");
const topicFilterEl = document.getElementById("topic-filter");
const dataSourceEl = document.getElementById("data-source");

// DOM Elements - Quiz
const quizWordEl = document.getElementById("quiz-word");
const quizWordTypeEl = document.getElementById("quiz-word-type");
const quizPhoneticEl = document.getElementById("quiz-phonetic");
const quizExampleEl = document.getElementById("quiz-example");
const quizOptionsEl = document.getElementById("quiz-options");
const quizScoreEl = document.getElementById("quiz-score");
const quizProgressEl = document.getElementById("quiz-progress");
const btnNextQuiz = document.getElementById("btn-next-quiz");
const btnQuizSpeak = document.getElementById("btn-quiz-speak");
const typingScoreEl = document.getElementById("typing-score");
const typingProgressEl = document.getElementById("typing-progress");
const typingMeaningEl = document.getElementById("typing-meaning");
const typingInputEl = document.getElementById("typing-input");
const btnCheckTyping = document.getElementById("btn-check-typing");
const typingFeedbackEl = document.getElementById("typing-feedback");
const btnNextTyping = document.getElementById("btn-next-typing");

// --- LOGIC FLASHCARD ---
function renderCard(index) {
  if (words.length === 0) {
    wordTypeEl.textContent = "--";
    wordTextEl.textContent = "Không có từ";
    wordPhoneticEl.textContent = "";
    wordMeaningEl.textContent = "Không có dữ liệu phù hợp với chế độ ôn hiện tại.";
    wordExampleEl.textContent = "";
    currentIndexEl.textContent = 0;
    totalWordsEl.textContent = 0;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    return;
  }

  if (index >= words.length) {
    currentIndex = 0;
    index = 0;
  }

  const currentWord = words[index];
  cardElement.classList.remove("flipped");

  wordTypeEl.textContent = currentWord.type;
  wordTextEl.textContent = currentWord.word;
  wordPhoneticEl.textContent = currentWord.phonetic || "";
  wordMeaningEl.textContent = currentWord.meaning;
  wordExampleEl.textContent = currentWord.example ? `"${currentWord.example}"` : "";

  currentIndexEl.textContent = index + 1;
  totalWordsEl.textContent = words.length;

  btnPrev.disabled = false;
  btnNext.disabled = false;
}

btnFlip.addEventListener("click", () => cardElement.classList.toggle("flipped"));
cardElement.addEventListener("click", (e) => {
  if (e.target.id === "btn-speak") return;
  cardElement.classList.toggle("flipped");
});

btnNext.addEventListener("click", () => {
  if (words.length === 0) return;
  currentIndex = (currentIndex + 1) % words.length;
  renderCard(currentIndex);
});

btnPrev.addEventListener("click", () => {
  if (words.length === 0) return;
  currentIndex = (currentIndex - 1 + words.length) % words.length;
  renderCard(currentIndex);
});

btnSpeak.addEventListener("click", (e) => {
  e.stopPropagation();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(words[currentIndex].word);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }
});

// --- LOGIC QUIZ ---
function getFilteredWords() {
  const mode = studyModeEl.value;
  const selectedTopic = topicFilterEl.value;
  const selectedSource = dataSourceEl.value;
  const availableWords = selectedSource === "all"
    ? allWords
    : allWords.filter(word => word.sourceId === selectedSource);

  if (mode === "topic") {
    return selectedTopic === "all"
      ? [...availableWords]
      : availableWords.filter(word => word.topic === selectedTopic);
  }

  if (mode === "noun" || mode === "verb" || mode === "adjective") {
    return availableWords.filter(word => word.type.toLowerCase() === mode);
  }

  return [...availableWords];
}

function startQuiz() {
  const filteredWords = getFilteredWords();

  if (filteredWords.length < 4) {
    alert("Cần ít nhất 4 từ vựng trong bộ lọc hiện tại để bắt đầu làm Quiz!");
    return;
  }

  quizOptionPool = [...filteredWords];
  quizQuestions = [...filteredWords].sort(() => Math.random() - 0.5);
  quizRoundMistakes = [];
  quizCorrectIds = new Set();
  quizIsRetryRound = false;
  currentQuizIndex = 0;
  quizScore = 0;
  quizScoreEl.textContent = quizScore;
  btnNextQuiz.classList.remove("hidden");
  loadQuizQuestion();
}

function loadQuizQuestion() {
  if (currentQuizIndex >= quizQuestions.length) {
    if (quizRoundMistakes.length > 0) {
      quizQuestions = [...quizRoundMistakes].sort(() => Math.random() - 0.5);
      quizRoundMistakes = [];
      quizIsRetryRound = true;
      currentQuizIndex = 0;
    } else {
      quizWordEl.textContent = "Hoàn thành!";
      quizWordTypeEl.textContent = `Bạn đã đúng hết ${quizCorrectIds.size} câu.`;
      quizPhoneticEl.textContent = "";
      quizExampleEl.textContent = "";
      quizProgressEl.textContent = "Đã hoàn thành";
      quizOptionsEl.innerHTML = `<button class="btn btn-primary btn-full" onclick="startQuiz()">Làm lại Quiz</button>`;
      btnNextQuiz.classList.add("hidden");
      return;
    }
  }

  const currentQ = quizQuestions[currentQuizIndex];
  currentQuizAnswered = false;
  quizWordEl.textContent = currentQ.word;
  quizWordTypeEl.textContent = currentQ.type;
  quizPhoneticEl.textContent = currentQ.phonetic || "";
  quizExampleEl.textContent = currentQ.example ? `Example: "${currentQ.example}"` : "";
  const roundLabel = quizIsRetryRound ? " · Ôn câu sai" : "";
  quizProgressEl.textContent = `Câu ${currentQuizIndex + 1} / ${quizQuestions.length}${roundLabel}`;

  const wrongOptions = quizOptionPool
    .filter(w => w.id !== currentQ.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const options = [...wrongOptions, currentQ].sort(() => Math.random() - 0.5);

  // Render các nút đáp án
  quizOptionsEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "quiz-option-btn";
    btn.textContent = opt.meaning;
    btn.onclick = () => selectQuizAnswer(opt.id, currentQ.id, btn);
    quizOptionsEl.appendChild(btn);
  });
}

function selectQuizAnswer(selectedId, correctId, selectedBtn) {
  if (currentQuizAnswered) return;

  currentQuizAnswered = true;

  // Khóa tất cả các nút sau khi đã chọn
  const allBtns = quizOptionsEl.querySelectorAll(".quiz-option-btn");
  allBtns.forEach(btn => btn.disabled = true);

  if (selectedId === correctId) {
    selectedBtn.classList.add("correct");
    quizCorrectIds.add(correctId);
    quizScore = quizCorrectIds.size;
    quizScoreEl.textContent = quizScore;
  } else {
    selectedBtn.classList.add("wrong");
    if (!quizRoundMistakes.some(word => word.id === correctId)) {
      const missedWord = quizOptionPool.find(word => word.id === correctId);
      if (missedWord) quizRoundMistakes.push(missedWord);
    }
    allBtns.forEach(btn => {
      const matchedOpt = quizOptionPool.find(w => w.id === correctId);
      if (matchedOpt && btn.textContent === matchedOpt.meaning) {
        btn.classList.add("correct");
      }
    });
  }

  btnNextQuiz.classList.remove("hidden");
}

btnNextQuiz.addEventListener("click", () => {
  if (!currentQuizAnswered) {
    const skippedWord = quizQuestions[currentQuizIndex];
    if (skippedWord && !quizRoundMistakes.some(word => word.id === skippedWord.id)) {
      quizRoundMistakes.push(skippedWord);
    }
  }

  currentQuizIndex++;
  loadQuizQuestion();
});

btnQuizSpeak.addEventListener("click", () => {
  if (!quizQuestions[currentQuizIndex]) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(quizQuestions[currentQuizIndex].word);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }
});

function updateTopicOptions() {
  const availableWords = dataSourceEl.value === "all"
    ? allWords
    : allWords.filter(item => item.sourceId === dataSourceEl.value);
  const topics = [...new Set(availableWords.map(item => item.topic).filter(Boolean))];
  topicFilterEl.innerHTML = '<option value="all">Tất cả chủ đề</option>';

  topics.forEach(topic => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicFilterEl.appendChild(option);
  });
}

function updateDataSourceOptions() {
  dataSourceEl.innerHTML = '<option value="all">Tất cả bộ từ</option>';

  DATA_SOURCES.forEach(({ id: sourceId, label: sourceLabel }) => {
    const option = document.createElement("option");
    option.value = sourceId;
    option.textContent = sourceLabel;
    dataSourceEl.appendChild(option);
  });
}

let typingQuestions = [];
let currentTypingIndex = 0;
let typingScore = 0;

function startTypingPractice() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để luyện gõ!");
    return;
  }

  typingQuestions = [...filteredWords]
    .map(word => ({ ...word, _random: Math.random() }))
    .sort((a, b) => a._random - b._random)
    .map(({ _random, ...word }) => word);

  currentTypingIndex = 0;
  typingScore = 0;
  typingScoreEl.textContent = typingScore;
  typingFeedbackEl.textContent = "";
  typingFeedbackEl.style.color = "";
  typingInputEl.value = "";
  renderTypingQuestion();
}

function renderTypingQuestion() {
  btnNextTyping.classList.add("hidden");
  typingInputEl.value = "";
  typingInputEl.focus();

  if (currentTypingIndex >= typingQuestions.length) {
    typingQuestions = [...typingQuestions].sort(() => Math.random() - 0.5);
    currentTypingIndex = 0;
  }

  const currentWord = typingQuestions[currentTypingIndex];
  typingMeaningEl.textContent = currentWord.meaning;
  typingProgressEl.textContent = `Câu ${currentTypingIndex + 1}`;
  typingInputEl.disabled = false;
  btnCheckTyping.disabled = false;
  typingFeedbackEl.textContent = "";
}

btnCheckTyping.addEventListener("click", () => {
  if (currentTypingIndex >= typingQuestions.length) return;

  const currentWord = typingQuestions[currentTypingIndex];
  const inputValue = typingInputEl.value.trim().toLowerCase();
  const correctValue = currentWord.word.trim().toLowerCase();

  if (inputValue === correctValue) {
    typingScore++;
    typingScoreEl.textContent = typingScore;
    typingFeedbackEl.textContent = "✅ Đúng!";
    typingFeedbackEl.style.color = "#065f46";
  } else {
    typingFeedbackEl.textContent = `❌ Sai. Đáp án đúng là: ${currentWord.word}`;
    typingFeedbackEl.style.color = "#991b1b";
  }

  btnCheckTyping.disabled = true;
  typingInputEl.disabled = true;
  btnNextTyping.classList.remove("hidden");
});

btnNextTyping.addEventListener("click", () => {
  currentTypingIndex++;
  renderTypingQuestion();
});

function applyStudyMode() {
  const mode = studyModeEl.value;
  topicFilterEl.classList.toggle("hidden", mode !== "topic");

  if (mode === "topic") {
    const topics = [...new Set(allWords.map(item => item.topic).filter(Boolean))];
    if (!topics.includes(topicFilterEl.value)) {
      topicFilterEl.value = "all";
    }
  }

  words = getFilteredWords();
  currentIndex = 0;

  if (currentMode === "flashcard") {
    renderCard(currentIndex);
    return;
  }

  if (currentMode === "quiz") {
    startQuiz();
    return;
  }

  if (currentMode === "typing") {
    startTypingPractice();
  }
}

studyModeEl.addEventListener("change", () => {
  if (studyModeEl.value === "topic") {
    updateTopicOptions();
  }
  applyStudyMode();
});

topicFilterEl.addEventListener("change", applyStudyMode);
dataSourceEl.addEventListener("change", () => {
  updateTopicOptions();
  applyStudyMode();
});

// --- CHUYỂN ĐỔI GIAO DIỆN MÀN HÌNH ---
let currentMode = "flashcard";

function showFlashcardScreen() {
  currentMode = "flashcard";
  flashcardScreen.classList.remove("hidden");
  quizScreen.classList.add("hidden");
  typingScreen.classList.add("hidden");
  btnToggleMode.textContent = "🎮 Làm Quiz";
  words = getFilteredWords();
  renderCard(currentIndex);
}

function showQuizScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length < 4) {
    alert("Bạn cần ít nhất 4 từ vựng trong bộ lọc hiện tại để chuyển sang chế độ Quiz!");
    return;
  }

  currentMode = "quiz";
  flashcardScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");
  typingScreen.classList.add("hidden");
  btnToggleMode.textContent = "📖 Ôn Flashcard";
  words = filteredWords;
  startQuiz();
}

function showTypingScreen() {
  const filteredWords = getFilteredWords();
  if (filteredWords.length === 0) {
    alert("Không có từ vựng nào trong bộ lọc hiện tại để luyện gõ!");
    return;
  }

  currentMode = "typing";
  flashcardScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  typingScreen.classList.remove("hidden");
  btnToggleMode.textContent = "📖 Về Flashcard";
  startTypingPractice();
}

btnToggleMode.addEventListener("click", () => {
  if (currentMode === "flashcard") {
    showQuizScreen();
    return;
  }

  showFlashcardScreen();
});

typingModeBtn.addEventListener("click", () => {
  if (currentMode === "typing") {
    showFlashcardScreen();
    return;
  }

  showTypingScreen();
});

typingInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !btnCheckTyping.disabled) {
    event.preventDefault();
    btnCheckTyping.click();
  }
});

async function initApp() {
  allWords = await loadWords();
  words = [...allWords];
  updateDataSourceOptions();
  updateTopicOptions();
  topicFilterEl.classList.toggle("hidden", studyModeEl.value !== "topic");
  currentIndex = 0;
  renderCard(currentIndex);
}

// Khởi chạy ứng dụng lần đầu
initApp();
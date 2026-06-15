const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3113;
const DATA_FILE = path.join(__dirname, 'questions.json');

app.use(cors());
app.use(express.json());

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayStartTimestamp(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isNewDay(data) {
  const todayStr = getDateString();
  const todayStart = getDayStartTimestamp();
  if (!data.currentQuestion || !data.currentQuestion.date) {
    return true;
  }
  return todayStart > data.currentQuestion.timestamp;
}

function selectQuestionForToday(data) {
  const todayStr = getDateString();
  const todayStart = getDayStartTimestamp();
  const bank = data.questionBank;

  let usedIds = [];
  if (data.answers) {
    usedIds = Object.values(data.answers)
      .filter(a => a && a.questionId)
      .map(a => a.questionId);
  }

  let available = bank.filter(q => !usedIds.includes(q.id));
  if (available.length === 0) {
    available = bank;
  }

  const seed = todayStart;
  const index = Math.abs(seed) % available.length;
  const selected = available[index];

  data.currentQuestion = {
    questionId: selected.id,
    question: selected.question,
    date: todayStr,
    timestamp: todayStart
  };

  if (!data.answers[todayStr]) {
    data.answers[todayStr] = {
      questionId: selected.id,
      question: selected.question,
      answer: '',
      answered: false,
      answeredAt: null
    };
  }

  writeData(data);
  return data.currentQuestion;
}

function ensureTodayQuestion(data) {
  if (isNewDay(data)) {
    return selectQuestionForToday(data);
  }
  const todayStr = getDateString();
  if (!data.answers[todayStr]) {
    data.answers[todayStr] = {
      questionId: data.currentQuestion.questionId,
      question: data.currentQuestion.question,
      answer: '',
      answered: false,
      answeredAt: null
    };
    writeData(data);
  }
  return data.currentQuestion;
}

app.get('/api/today', (req, res) => {
  try {
    const data = readData();
    const question = ensureTodayQuestion(data);
    const todayStr = getDateString();
    const todayAnswer = data.answers[todayStr] || { answer: '', answered: false };
    const versions = todayAnswer.versions || [];
    res.json({
      success: true,
      data: {
        question: question,
        answer: todayAnswer.answer,
        answered: todayAnswer.answered,
        date: todayStr,
        currentVersion: todayAnswer.currentVersion || 0,
        versionsCount: versions.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.post('/api/answer', (req, res) => {
  try {
    const { answer } = req.body;
    if (typeof answer !== 'string') {
      return res.status(400).json({ success: false, message: '回答内容无效' });
    }
    const data = readData();
    ensureTodayQuestion(data);
    const todayStr = getDateString();
    const now = new Date().toISOString();

    if (!data.answers[todayStr].versions) {
      data.answers[todayStr].versions = [];
      data.answers[todayStr].currentVersion = 0;
    }

    const newVersionNum = data.answers[todayStr].versions.length + 1;
    const newVersion = {
      version: newVersionNum,
      answer: answer,
      savedAt: now
    };

    if (answer.trim().length > 0) {
      data.answers[todayStr].versions.push(newVersion);
      data.answers[todayStr].currentVersion = newVersionNum;
    }

    data.answers[todayStr].answer = answer;
    data.answers[todayStr].answered = answer.trim().length > 0;
    data.answers[todayStr].answeredAt = answer.trim().length > 0 ? now : null;

    writeData(data);
    res.json({
      success: true,
      data: {
        date: todayStr,
        answered: data.answers[todayStr].answered,
        answeredAt: data.answers[todayStr].answeredAt,
        currentVersion: data.answers[todayStr].currentVersion,
        versionsCount: data.answers[todayStr].versions.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.get('/api/answer/:date/versions', (req, res) => {
  try {
    const { date } = req.params;
    const data = readData();
    const answer = data.answers[date];

    if (!answer) {
      return res.status(404).json({ success: false, message: '该日期没有回答记录' });
    }

    const versions = answer.versions || [];
    const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

    res.json({
      success: true,
      data: {
        date,
        currentVersion: answer.currentVersion || 0,
        versions: sortedVersions,
        currentAnswer: answer.answer
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.post('/api/answer/:date/versions/:version/restore', (req, res) => {
  try {
    const { date, version } = req.params;
    const versionNum = parseInt(version);
    const data = readData();
    const answer = data.answers[date];

    if (!answer) {
      return res.status(404).json({ success: false, message: '该日期没有回答记录' });
    }

    const versions = answer.versions || [];
    const targetVersion = versions.find(v => v.version === versionNum);

    if (!targetVersion) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }

    const now = new Date().toISOString();
    const newVersionNum = versions.length + 1;
    const newVersion = {
      version: newVersionNum,
      answer: targetVersion.answer,
      savedAt: now,
      restoredFrom: versionNum
    };

    versions.push(newVersion);
    answer.answer = targetVersion.answer;
    answer.currentVersion = newVersionNum;
    answer.answered = true;
    answer.answeredAt = now;

    writeData(data);
    res.json({
      success: true,
      data: {
        date,
        currentVersion: newVersionNum,
        answer: targetVersion.answer,
        restoredFrom: versionNum
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const data = readData();
    const { year, month } = req.query;
    const y = year ? parseInt(year) : new Date().getFullYear();
    const m = month ? parseInt(month) : new Date().getMonth() + 1;

    const daysInMonth = new Date(y, m, 0).getDate();
    const calendar = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entry = data.answers[dateStr];
      calendar.push({
        date: dateStr,
        day: day,
        hasQuestion: !!entry,
        answered: !!(entry && entry.answered),
        answer: entry ? entry.answer : '',
        question: entry ? entry.question : ''
      });
    }

    let answeredCount = 0;
    let missedCount = 0;
    const allDates = Object.keys(data.answers).sort();
    if (allDates.length > 0) {
      const firstDate = new Date(allDates[0]);
      const today = new Date();
      const todayStr = getDateString(today);
      let cursor = new Date(firstDate);
      while (cursor <= today) {
        const curStr = getDateString(cursor);
        const entry = data.answers[curStr];
        if (curStr !== todayStr) {
          if (entry && entry.answered) {
            answeredCount++;
          } else {
            missedCount++;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    res.json({
      success: true,
      data: {
        calendar,
        year: y,
        month: m,
        stats: {
          answeredCount,
          missedCount,
          totalDays: answeredCount + missedCount
        },
        allAnswers: data.answers
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.get('/api/question-bank', (req, res) => {
  try {
    const data = readData();
    res.json({
      success: true,
      data: data.questionBank
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.listen(PORT, () => {
  console.log(`每日问答后端服务已启动 http://localhost:${PORT}`);
  const data = readData();
  ensureTodayQuestion(data);
  console.log(`今日问题已准备就绪 ${data.currentQuestion.question}`);
});

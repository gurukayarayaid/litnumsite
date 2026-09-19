const express = require('express');
const router = express.Router();
const { getDb, find, filter, insert, update, count } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth('siswa'), (req, res) => {
  const db = getDb();
  const studentId = req.session.user.studentId;

  const studentAttempts = db.attempts.filter(a => a.student_id === studentId);
  const totalAttempts = studentAttempts.length;
  const correctAttempts = studentAttempts.filter(a => a.is_correct).length;
  const accuracy = totalAttempts > 0 ? Math.round(correctAttempts / totalAttempts * 100) : 0;

  // Category stats
  const catMap = {};
  studentAttempts.forEach(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    if (!ex) return;
    if (!catMap[ex.category]) catMap[ex.category] = { category: ex.category, total: 0, correct: 0 };
    catMap[ex.category].total++;
    if (a.is_correct) catMap[ex.category].correct++;
  });

  const categoryStats = Object.values(catMap).map(c => ({
    ...c,
    total_attempts: c.total,
    correct_attempts: c.correct,
    accuracy: c.total > 0 ? Math.round(c.correct / c.total * 1000) / 10 : 0
  }));

  const recentAttempts = studentAttempts
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map(a => {
      const ex = find('exercises', e => e.id === a.exercise_id);
      return {
        ...a,
        category: ex ? ex.category : '',
        subcategory: ex ? ex.subcategory : '',
        question: ex ? ex.question : ''
      };
    });

  // Weekly activity
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weeklyAttempts = studentAttempts.filter(a => new Date(a.created_at) >= weekAgo);
  const weeklyMap = {};
  weeklyAttempts.forEach(a => {
    const date = a.created_at.split('T')[0];
    if (!weeklyMap[date]) weeklyMap[date] = { date, attempts: 0, correct: 0 };
    weeklyMap[date].attempts++;
    if (a.is_correct) weeklyMap[date].correct++;
  });
  const weeklyActivity = Object.values(weeklyMap).sort((a, b) => a.date.localeCompare(b.date));

  const currentLevel = db.student_progress.filter(p => p.student_id === studentId);

  res.json({ totalAttempts, correctAttempts, accuracy, categoryStats, recentAttempts, weeklyActivity, currentLevel });
});

router.get('/progress', requireAuth('siswa'), (req, res) => {
  const db = getDb();
  const studentId = req.session.user.studentId;

  const progress = db.student_progress.filter(p => p.student_id === studentId);

  const detailedStats = [];
  const diffMap = {};

  db.attempts.filter(a => a.student_id === studentId).forEach(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    if (!ex) return;
    const key = `${ex.category}|${ex.subcategory}|${ex.difficulty}`;
    if (!diffMap[key]) {
      diffMap[key] = { category: ex.category, subcategory: ex.subcategory, difficulty: ex.difficulty, total: 0, correct: 0 };
    }
    diffMap[key].total++;
    if (a.is_correct) diffMap[key].correct++;
  });

  Object.values(diffMap).forEach(d => {
    detailedStats.push({
      ...d,
      total_attempts: d.total,
      correct_attempts: d.correct,
      accuracy: d.total > 0 ? Math.round(d.correct / d.total * 1000) / 10 : 0
    });
  });

  detailedStats.sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory) || a.difficulty - b.difficulty);

  res.json({ progress, detailedStats });
});

router.post('/attempt', requireAuth('siswa'), (req, res) => {
  const { exerciseId, answer, timeSpent } = req.body;
  const studentId = req.session.user.studentId;
  const db = getDb();

  const exercise = find('exercises', e => e.id === exerciseId);
  if (!exercise) return res.status(404).json({ error: 'Soal tidak ditemukan' });

  const isCorrect = exercise.answer.toLowerCase().trim() === answer.toLowerCase().trim();

  insert('attempts', {
    student_id: studentId,
    exercise_id: exerciseId,
    student_answer: answer,
    is_correct: isCorrect,
    time_spent: timeSpent || 0
  });

  // Update progress
  const existingProgress = find('student_progress', p =>
    p.student_id === studentId && p.category === exercise.category && p.subcategory === exercise.subcategory
  );

  if (existingProgress) {
    update('student_progress', existingProgress.id, {
      total_attempts: existingProgress.total_attempts + 1,
      correct_attempts: existingProgress.correct_attempts + (isCorrect ? 1 : 0),
      last_updated: new Date().toISOString()
    });
  } else {
    insert('student_progress', {
      student_id: studentId,
      category: exercise.category,
      subcategory: exercise.subcategory,
      current_difficulty: exercise.difficulty,
      total_attempts: 1,
      correct_attempts: isCorrect ? 1 : 0
    });
  }

  // Adaptive difficulty
  const recentAttempts = db.attempts
    .filter(a => a.student_id === studentId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);

  const relevantAttempts = recentAttempts.filter(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    return ex && ex.category === exercise.category && ex.subcategory === exercise.subcategory;
  }).slice(0, 5);

  let newDifficulty = exercise.difficulty;
  if (relevantAttempts.length >= 5) {
    const correctCount = relevantAttempts.filter(a => a.is_correct).length;
    const recentAccuracy = correctCount / relevantAttempts.length;
    if (recentAccuracy >= 0.8 && exercise.difficulty < 5) {
      newDifficulty = exercise.difficulty + 1;
    } else if (recentAccuracy < 0.5 && exercise.difficulty > 1) {
      newDifficulty = exercise.difficulty - 1;
    }
  }

  if (newDifficulty !== exercise.difficulty && existingProgress) {
    update('student_progress', existingProgress.id, { current_difficulty: newDifficulty });
  }

  res.json({ success: true, isCorrect, correctAnswer: exercise.answer, explanation: exercise.explanation, newDifficulty });
});

module.exports = router;

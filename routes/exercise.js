const express = require('express');
const router = express.Router();
const { getDb, find, filter } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

router.get('/get', requireAuth('siswa'), (req, res) => {
  const { category, subcategory, count } = req.query;
  const studentId = req.session.user.studentId;
  const db = getDb();
  const numQuestions = parseInt(count) || 5;

  // Get student's current difficulty
  let difficulty = 1;
  const progress = db.student_progress.find(p =>
    p.student_id === studentId && p.category === (category || '') && p.subcategory === (subcategory || '')
  );
  if (progress) difficulty = progress.current_difficulty;

  const difficulties = [difficulty];
  if (difficulty > 1) difficulties.push(difficulty - 1);
  if (difficulty < 5) difficulties.push(difficulty + 1);

  // Get exercises student hasn't attempted recently
  const recentAttemptIds = db.attempts
    .filter(a => a.student_id === studentId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50)
    .map(a => a.exercise_id);

  let exercises = db.exercises.filter(ex => {
    if (!difficulties.includes(ex.difficulty)) return false;
    if (category && ex.category !== category) return false;
    if (subcategory && ex.subcategory !== subcategory) return false;
    if (recentAttemptIds.includes(ex.id)) return false;
    return true;
  });

  // If not enough new exercises, include attempted ones
  if (exercises.length < numQuestions) {
    exercises = db.exercises.filter(ex => {
      if (!difficulties.includes(ex.difficulty)) return false;
      if (category && ex.category !== category) return false;
      if (subcategory && ex.subcategory !== subcategory) return false;
      return true;
    });
  }

  // Shuffle and limit
  exercises = exercises.sort(() => Math.random() - 0.5).slice(0, numQuestions);

  // Parse options
  exercises = exercises.map(ex => ({
    ...ex,
    options: ex.options ? JSON.parse(ex.options) : null
  }));

  res.json({ exercises, currentDifficulty: difficulty });
});

router.get('/categories', requireAuth(), (req, res) => {
  const db = getDb();
  const catMap = {};

  db.exercises.forEach(ex => {
    const key = `${ex.category}|${ex.subcategory}`;
    if (!catMap[key]) {
      catMap[key] = { category: ex.category, subcategory: ex.subcategory, min_difficulty: ex.difficulty, max_difficulty: ex.difficulty };
    } else {
      catMap[key].min_difficulty = Math.min(catMap[key].min_difficulty, ex.difficulty);
      catMap[key].max_difficulty = Math.max(catMap[key].max_difficulty, ex.difficulty);
    }
  });

  res.json({ categories: Object.values(catMap) });
});

router.get('/:id', requireAuth(), (req, res) => {
  const exercise = find('exercises', e => e.id === parseInt(req.params.id));
  if (!exercise) return res.status(404).json({ error: 'Soal tidak ditemukan' });

  res.json({
    exercise: {
      ...exercise,
      options: exercise.options ? JSON.parse(exercise.options) : null
    }
  });
});

module.exports = router;

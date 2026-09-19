const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { getDb, find, filter, insert, update, remove, count } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file CSV yang diizinkan'));
    }
  }
});

const uploadJson = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file JSON yang diizinkan'));
    }
  }
});

// Backup database
router.get('/backup', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const backupData = JSON.stringify(db, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=litnum-backup-${date}.json`);
  res.send(backupData);
});

// Restore database
router.post('/restore', requireAuth('guru'), uploadJson.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File JSON harus diupload' });

  try {
    const jsonData = JSON.parse(req.file.buffer.toString('utf8'));

    if (!jsonData.users || !jsonData.students || !jsonData.exercises) {
      return res.status(400).json({ error: 'Format file backup tidak valid' });
    }

    const { saveDb } = require('../config/database');
    const db = getDb();

    db.users = jsonData.users || [];
    db.students = jsonData.students || [];
    db.exercises = jsonData.exercises || [];
    db.attempts = jsonData.attempts || [];
    db.student_progress = jsonData.student_progress || [];
    db._nextId = jsonData._nextId || { users: 1, students: 1, exercises: 1, attempts: 1, student_progress: 1 };

    saveDb();

    res.json({
      success: true,
      message: 'Database berhasil dipulihkan',
      stats: {
        users: db.users.length,
        students: db.students.length,
        exercises: db.exercises.length,
        attempts: db.attempts.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses file: ' + err.message });
  }
});

router.get('/dashboard', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const totalStudents = db.students.length;

  const recentAttempts = db.attempts
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map(a => {
      const student = find('students', s => s.id === a.student_id);
      const exercise = find('exercises', e => e.id === a.exercise_id);
      return {
        ...a,
        student_name: student ? student.full_name : 'Unknown',
        category: exercise ? exercise.category : '',
        subcategory: exercise ? exercise.subcategory : '',
        difficulty: exercise ? exercise.difficulty : 0
      };
    });

  // Group by category/subcategory
  const categoryMap = {};
  db.attempts.forEach(a => {
    const exercise = find('exercises', e => e.id === a.exercise_id);
    if (!exercise) return;
    const key = `${exercise.category}|${exercise.subcategory}`;
    if (!categoryMap[key]) {
      categoryMap[key] = { category: exercise.category, subcategory: exercise.subcategory, total: 0, correct: 0 };
    }
    categoryMap[key].total++;
    if (a.is_correct) categoryMap[key].correct++;
  });

  const categoryStats = Object.values(categoryMap).map(c => ({
    ...c,
    total_attempts: c.total,
    correct_attempts: c.correct,
    accuracy: c.total > 0 ? Math.round(c.correct / c.total * 1000) / 10 : 0
  }));

  // Weak students (accuracy < 50 and has attempts)
  const studentStats = {};
  db.attempts.forEach(a => {
    if (!studentStats[a.student_id]) {
      studentStats[a.student_id] = { total: 0, correct: 0 };
    }
    studentStats[a.student_id].total++;
    if (a.is_correct) studentStats[a.student_id].correct++;
  });

  const weakStudents = Object.entries(studentStats)
    .filter(([_, s]) => s.total >= 3 && (s.correct / s.total) < 0.5)
    .map(([id, s]) => {
      const student = find('students', st => st.id === parseInt(id));
      if (!student) return null;
      return {
        id: student.id,
        full_name: student.full_name,
        nis: student.nis,
        total_attempts: s.total,
        correct_attempts: s.correct,
        accuracy: Math.round(s.correct / s.total * 1000) / 10
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.accuracy - b.accuracy);

  const today = new Date().toISOString().split('T')[0];
  const todayAttempts = db.attempts.filter(a => a.created_at && a.created_at.startsWith(today));
  const todayCorrect = todayAttempts.filter(a => a.is_correct);

  res.json({
    totalStudents,
    categoryStats,
    weakStudents,
    recentAttempts,
    todayStats: {
      attempts: todayAttempts.length,
      correct: todayCorrect.length,
      accuracy: todayAttempts.length > 0 ? Math.round(todayCorrect.length / todayAttempts.length * 100) : 0
    }
  });
});

router.get('/students', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const students = db.students.map(s => {
    const user = find('users', u => u.id === s.user_id);
    const studentAttempts = db.attempts.filter(a => a.student_id === s.id);
    const total = studentAttempts.length;
    const correct = studentAttempts.filter(a => a.is_correct).length;
    const lastActivity = studentAttempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    return {
      ...s,
      username: user ? user.username : '',
      total_attempts: total,
      correct_attempts: correct,
      accuracy: total > 0 ? Math.round(correct / total * 1000) / 10 : 0,
      last_activity: lastActivity ? lastActivity.created_at : null
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));

  res.json({ students });
});

router.get('/students/:id', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const student = find('students', s => s.id === parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Murid tidak ditemukan' });

  const user = find('users', u => u.id === student.user_id);
  const studentAttempts = db.attempts.filter(a => a.student_id === student.id);
  const total = studentAttempts.length;
  const correct = studentAttempts.filter(a => a.is_correct).length;

  const progress = db.student_progress.filter(p => p.student_id === student.id);

  const recentAttempts = studentAttempts
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)
    .map(a => {
      const ex = find('exercises', e => e.id === a.exercise_id);
      return {
        ...a,
        category: ex ? ex.category : '',
        subcategory: ex ? ex.subcategory : '',
        difficulty: ex ? ex.difficulty : 0,
        question: ex ? ex.question : '',
        answer: ex ? ex.answer : '',
        explanation: ex ? ex.explanation : ''
      };
    });

  // Category stats
  const catMap = {};
  studentAttempts.forEach(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    if (!ex) return;
    const key = `${ex.category}|${ex.subcategory}`;
    if (!catMap[key]) catMap[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
    catMap[key].total++;
    if (a.is_correct) catMap[key].correct++;
  });

  const categoryStats = Object.values(catMap).map(c => ({
    ...c,
    total_attempts: c.total,
    correct_attempts: c.correct,
    accuracy: c.total > 0 ? Math.round(c.correct / c.total * 1000) / 10 : 0
  }));

  res.json({
    student: { ...student, username: user ? user.username : '', total_attempts: total, correct_attempts: correct, accuracy: total > 0 ? Math.round(correct / total * 1000) / 10 : 0 },
    progress,
    recentAttempts,
    categoryStats
  });
});

router.post('/students', requireAuth('guru'), (req, res) => {
  const { nis, full_name, class: studentClass } = req.body;
  if (!nis || !full_name) return res.status(400).json({ error: 'NIS dan nama harus diisi' });

  const existing = find('students', s => s.nis === nis);
  if (existing) return res.status(400).json({ error: 'NIS sudah terdaftar' });

  const hashedPassword = bcrypt.hashSync('123456', 10);
  const user = insert('users', { username: nis, password: hashedPassword, name: full_name, role: 'siswa' });
  const student = insert('students', { user_id: user.id, nis, full_name, class: studentClass || '3' });

  res.json({ success: true, message: 'Murid berhasil ditambahkan', studentId: student.id });
});

router.put('/students/:id', requireAuth('guru'), (req, res) => {
  const { nis, full_name, class: studentClass } = req.body;
  const student = find('students', s => s.id === parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Murid tidak ditemukan' });

  update('students', student.id, { nis, full_name, class: studentClass });
  const user = find('users', u => u.id === student.user_id);
  if (user) update('users', user.id, { name: full_name, username: nis });

  res.json({ success: true, message: 'Data murid berhasil diperbarui' });
});

router.delete('/students/:id', requireAuth('guru'), (req, res) => {
  const student = find('students', s => s.id === parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Murid tidak ditemukan' });

  const db = getDb();
  db.attempts = db.attempts.filter(a => a.student_id !== student.id);
  db.student_progress = db.student_progress.filter(p => p.student_id !== student.id);
  remove('students', student.id);
  remove('users', student.user_id);

  res.json({ success: true, message: 'Murid berhasil dihapus' });
});

router.post('/students/upload', requireAuth('guru'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File CSV harus diupload' });

  try {
    const csvData = req.file.buffer.toString('utf8');
    const delimiter = csvData.includes(';') ? ';' : ',';
    const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true, delimiter });

    const results = { success: 0, failed: 0, errors: [] };
    const hashedPassword = bcrypt.hashSync('123456', 10);

    records.forEach(record => {
      try {
        const nis = record.nis || record.NIS;
        const fullName = record.nama || record.full_name || record.nama_lengkap;
        const studentClass = record.kelas || record.class || '3';

        if (!nis || !fullName) { results.failed++; results.errors.push('NIS atau nama kosong'); return; }

        const existing = find('students', s => s.nis === nis);
        if (existing) { results.failed++; results.errors.push(`NIS ${nis} sudah terdaftar`); return; }

        const user = insert('users', { username: nis, password: hashedPassword, name: fullName, role: 'siswa' });
        insert('students', { user_id: user.id, nis, full_name: fullName, class: studentClass });
        results.success++;
      } catch (err) { results.failed++; results.errors.push(err.message); }
    });

    res.json({ success: true, message: `${results.success} murid berhasil diupload, ${results.failed} gagal`, results });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses file CSV: ' + err.message });
  }
});

router.get('/students/template', requireAuth('guru'), (req, res) => {
  const template = [
    { nis: '001', nama: 'Budi Santoso', kelas: '3' },
    { nis: '002', nama: 'Siti Rahayu', kelas: '3' },
    { nis: '003', nama: 'Andi Wijaya', kelas: '3A' }
  ];
  const csv = stringify(template, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template-upload-murid.csv');
  res.send(csv);
});

router.get('/students/:id/report', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const student = find('students', s => s.id === parseInt(req.params.id));
  if (!student) return res.status(404).json({ error: 'Murid tidak ditemukan' });

  const studentAttempts = db.attempts.filter(a => a.student_id === student.id);
  const catMap = {};
  studentAttempts.forEach(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    if (!ex) return;
    const key = `${ex.category}|${ex.subcategory}`;
    if (!catMap[key]) catMap[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
    catMap[key].total++;
    if (a.is_correct) catMap[key].correct++;
  });

  const categoryStats = Object.values(catMap).map(c => ({
    ...c, total_attempts: c.total, correct_attempts: c.correct,
    accuracy: c.total > 0 ? Math.round(c.correct / c.total * 1000) / 10 : 0
  }));

  const totalAttempts = studentAttempts.length;
  const totalCorrect = studentAttempts.filter(a => a.is_correct).length;

  res.json({
    student,
    categoryStats,
    summary: { totalAttempts, totalCorrect, overallAccuracy: totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0 },
    generatedAt: new Date().toISOString()
  });
});

router.get('/reports/all', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const students = db.students.map(s => {
    const sa = db.attempts.filter(a => a.student_id === s.id);
    const total = sa.length;
    const correct = sa.filter(a => a.is_correct).length;
    return {
      ...s,
      total_attempts: total,
      correct_attempts: correct,
      accuracy: total > 0 ? Math.round(correct / total * 1000) / 10 : 0
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const catMap = {};
  db.attempts.forEach(a => {
    const ex = find('exercises', e => e.id === a.exercise_id);
    if (!ex) return;
    const key = `${ex.category}|${ex.subcategory}`;
    if (!catMap[key]) catMap[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
    catMap[key].total++;
    if (a.is_correct) catMap[key].correct++;
  });

  const categoryStats = Object.values(catMap).map(c => ({
    ...c, total_attempts: c.total, correct_attempts: c.correct,
    accuracy: c.total > 0 ? Math.round(c.correct / c.total * 1000) / 10 : 0
  }));

  res.json({ students, categoryStats, generatedAt: new Date().toISOString() });
});

// ==================== EXERCISES CRUD ====================

router.get('/exercises', requireAuth('guru'), (req, res) => {
  const db = getDb();
  const { category, subcategory, difficulty, type, search } = req.query;

  let exercises = [...db.exercises];

  if (category) exercises = exercises.filter(e => e.category === category);
  if (subcategory) exercises = exercises.filter(e => e.subcategory === subcategory);
  if (difficulty) exercises = exercises.filter(e => e.difficulty === parseInt(difficulty));
  if (type) exercises = exercises.filter(e => e.type === type);
  if (search) {
    const q = search.toLowerCase();
    exercises = exercises.filter(e =>
      e.question.toLowerCase().includes(q) ||
      e.answer.toLowerCase().includes(q) ||
      (e.explanation && e.explanation.toLowerCase().includes(q))
    );
  }

  exercises.sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory) || a.difficulty - b.difficulty);

  // Parse options
  exercises = exercises.map(ex => ({
    ...ex,
    options: ex.options ? JSON.parse(ex.options) : null
  }));

  // Stats
  const total = db.exercises.length;
  const byCategory = {};
  db.exercises.forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = 0;
    byCategory[e.category]++;
  });

  res.json({ exercises, total, byCategory });
});

router.get('/exercises/:id', requireAuth('guru'), (req, res) => {
  const exercise = find('exercises', e => e.id === parseInt(req.params.id));
  if (!exercise) return res.status(404).json({ error: 'Soal tidak ditemukan' });

  res.json({
    exercise: {
      ...exercise,
      options: exercise.options ? JSON.parse(exercise.options) : null
    }
  });
});

router.post('/exercises', requireAuth('guru'), (req, res) => {
  const { category, subcategory, type, difficulty, question, answer, options, explanation } = req.body;

  if (!category || !subcategory || !type || !difficulty || !question || !answer) {
    return res.status(400).json({ error: 'Semua field wajib harus diisi' });
  }

  if (type === 'pilihan_ganda' && (!options || !Array.isArray(options) || options.length < 2)) {
    return res.status(400).json({ error: 'Pilihan ganda minimal 2 opsi' });
  }

  const exercise = insert('exercises', {
    category,
    subcategory,
    type,
    difficulty: parseInt(difficulty),
    question,
    answer,
    options: options ? JSON.stringify(options) : null,
    explanation: explanation || ''
  });

  res.json({ success: true, message: 'Soal berhasil ditambahkan', exercise });
});

router.put('/exercises/:id', requireAuth('guru'), (req, res) => {
  const exercise = find('exercises', e => e.id === parseInt(req.params.id));
  if (!exercise) return res.status(404).json({ error: 'Soal tidak ditemukan' });

  const { category, subcategory, type, difficulty, question, answer, options, explanation } = req.body;

  if (!category || !subcategory || !type || !difficulty || !question || !answer) {
    return res.status(400).json({ error: 'Semua field wajib harus diisi' });
  }

  if (type === 'pilihan_ganda' && (!options || !Array.isArray(options) || options.length < 2)) {
    return res.status(400).json({ error: 'Pilihan ganda minimal 2 opsi' });
  }

  update('exercises', exercise.id, {
    category,
    subcategory,
    type,
    difficulty: parseInt(difficulty),
    question,
    answer,
    options: options ? JSON.stringify(options) : null,
    explanation: explanation || ''
  });

  res.json({ success: true, message: 'Soal berhasil diperbarui' });
});

router.delete('/exercises/:id', requireAuth('guru'), (req, res) => {
  const exercise = find('exercises', e => e.id === parseInt(req.params.id));
  if (!exercise) return res.status(404).json({ error: 'Soal tidak ditemukan' });

  const db = getDb();
  db.attempts = db.attempts.filter(a => a.exercise_id !== exercise.id);
  remove('exercises', exercise.id);

  res.json({ success: true, message: 'Soal berhasil dihapus' });
});

router.delete('/exercises', requireAuth('guru'), (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Pilih soal yang akan dihapus' });
  }

  const db = getDb();
  const idSet = new Set(ids.map(id => parseInt(id)));

  db.attempts = db.attempts.filter(a => !idSet.has(a.exercise_id));
  db.exercises = db.exercises.filter(e => !idSet.has(e.id));

  res.json({ success: true, message: `${ids.length} soal berhasil dihapus` });
});

module.exports = router;

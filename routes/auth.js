const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, find, filter } = require('../config/database');

// Get unique classes
router.get('/classes', (req, res) => {
  const db = getDb();
  const classes = [...new Set(db.students.map(s => s.class))].sort();
  res.json({ classes });
});

// Get students by class
router.get('/students-by-class/:class', (req, res) => {
  const students = filter('students', s => s.class === req.params.class);
  const result = students.map(s => ({ id: s.id, nis: s.nis, full_name: s.full_name }));
  result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  res.json({ students: result });
});

// Teacher login (password only)
router.post('/login', (req, res) => {
  const { password, role } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password harus diisi' });
  }

  // Hardcoded password for guru
  if (password !== 'alal1010') {
    return res.status(401).json({ error: 'Password salah' });
  }

  // Find or create admin user
  let user = find('users', u => u.username === 'admin' && u.role === 'guru');
  if (!user) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('alal1010', 10);
    const { insert } = require('../config/database');
    user = insert('users', { username: 'admin', password: hashedPassword, name: 'Guru', role: 'guru' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    redirect: '/teacher/dashboard'
  });
});

// Student login
router.post('/login-student', (req, res) => {
  const { nis, password } = req.body;

  if (!nis || !password) {
    return res.status(400).json({ error: 'NIS dan password harus diisi' });
  }

  const db = getDb();
  const studentRecord = find('students', s => s.nis === nis);
  if (!studentRecord) {
    return res.status(401).json({ error: 'NIS atau password salah' });
  }

  const user = find('users', u => u.id === studentRecord.user_id && u.role === 'siswa');
  if (!user) {
    return res.status(401).json({ error: 'NIS atau password salah' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'NIS atau password salah' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: studentRecord.full_name,
    role: 'siswa',
    studentId: studentRecord.id,
    nis: studentRecord.nis,
    class: studentRecord.class
  };

  res.json({
    success: true,
    user: {
      id: user.id,
      name: studentRecord.full_name,
      role: 'siswa',
      nis: studentRecord.nis
    },
    redirect: '/student/dashboard'
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Gagal logout' });
    }
    res.json({ success: true, redirect: '/login' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Belum login' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;

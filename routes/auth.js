const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, find } = require('../config/database');

// Teacher login
router.post('/login', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password harus diisi' });
  }

  const user = find('users', u => u.username === username && u.role === (role || 'guru'));

  if (!user) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };

  if (user.role === 'siswa') {
    const student = find('students', s => s.user_id === user.id);
    req.session.user.studentId = student ? student.id : null;
    req.session.user.nis = student ? student.nis : null;
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    redirect: user.role === 'guru' ? '/teacher/dashboard' : '/student/dashboard'
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

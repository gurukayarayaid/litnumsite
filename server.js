const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8765;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: 'litnumsite-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// View engine (we'll serve static HTML)
app.set('view engine', 'html');
app.engine('html', (path, options, cb) => {
  fs.readFile(path, 'utf8', (err, data) => {
    if (err) return cb(err);
    cb(null, data);
  });
});

// Routes
const authRoutes = require('./routes/auth');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const exerciseRoutes = require('./routes/exercise');

app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/exercise', exerciseRoutes);

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/teacher/dashboard', requireAuth('guru'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'teacher', 'dashboard.html'));
});

app.get('/teacher/students', requireAuth('guru'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'teacher', 'students.html'));
});

app.get('/teacher/student/:id', requireAuth('guru'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'teacher', 'student-detail.html'));
});

app.get('/teacher/reports', requireAuth('guru'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'teacher', 'reports.html'));
});

app.get('/teacher/exercises', requireAuth('guru'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'teacher', 'exercises.html'));
});

app.get('/student/dashboard', requireAuth('siswa'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student', 'dashboard.html'));
});

app.get('/student/exercise', requireAuth('siswa'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student', 'exercise.html'));
});

app.get('/student/progress', requireAuth('siswa'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student', 'progress.html'));
});

function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      return res.redirect('/login');
    }
    next();
  };
}

// Initialize database and start server
const { initDatabase } = require('./config/database');
initDatabase();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

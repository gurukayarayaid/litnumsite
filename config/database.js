const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'litnum.json');

let data = {
  users: [],
  students: [],
  exercises: [],
  attempts: [],
  student_progress: [],
  _nextId: { users: 1, students: 1, exercises: 1, attempts: 1, student_progress: 1 }
};

function getDb() {
  return data;
}

function saveDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error loading DB:', e);
    }
  }
}

function nextId(table) {
  if (!data._nextId[table]) data._nextId[table] = 1;
  return data._nextId[table]++;
}

function find(table, predicate) {
  return data[table].find(predicate);
}

function filter(table, predicate) {
  return data[table].filter(predicate);
}

function insert(table, record) {
  record.id = nextId(table);
  record.created_at = record.created_at || new Date().toISOString();
  data[table].push(record);
  saveDb();
  return record;
}

function update(table, id, updates) {
  const record = data[table].find(r => r.id === id);
  if (record) {
    Object.assign(record, updates);
    saveDb();
  }
  return record;
}

function remove(table, id) {
  const idx = data[table].findIndex(r => r.id === id);
  if (idx !== -1) {
    data[table].splice(idx, 1);
    saveDb();
    return true;
  }
  return false;
}

function count(table, predicate) {
  if (predicate) return data[table].filter(predicate).length;
  return data[table].length;
}

function sum(table, field, predicate) {
  return data[table].filter(predicate || (() => true)).reduce((acc, r) => acc + (r[field] || 0), 0);
}

function initDatabase() {
  loadDb();

  // Seed default admin
  const existingAdmin = find('users', u => u.username === 'admin');
  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync('alal1010', 10);
    insert('users', {
      username: 'admin',
      password: hashedPassword,
      name: 'Guru Administrator',
      role: 'guru'
    });
    console.log('Default admin created: password alal1010');
  }

  // Seed exercises
  if (count('exercises') === 0) {
    seedExercises();
  }

  // Seed default students (Kelas 3)
  if (count('students') === 0) {
    seedStudents();
  }

  console.log(`Database loaded: ${count('users')} users, ${count('students')} students, ${count('exercises')} exercises`);
}

function seedExercises() {
  const exercises = require('./questionBank');

  exercises.forEach(ex => {
    ex.options = ex.options ? JSON.stringify(ex.options) : null;
    insert('exercises', ex);
  });

  console.log(`Seeded ${exercises.length} exercises from question bank`);
}

function seedStudents() {
  const defaultStudents = [
    { nis: '3262', name: 'ACHMAD DHAFIN KHALIF ALGHIFARI', class: '3' },
    { nis: '3263', name: 'ALFIRA NAHDA RAFANDA', class: '3' },
    { nis: '3264', name: 'ARSYILA ROMEESA FARZANA', class: '3' },
    { nis: '3265', name: 'ASSYFA PUTRI NAURA ZASKIA', class: '3' },
    { nis: '3266', name: 'ATIQAH FATIMATUS ZAHRA', class: '3' },
    { nis: '3267', name: 'ELLVINO GAVRIEL ALVARO', class: '3' },
    { nis: '3268', name: 'FALISA AMALIA PUTRI', class: '3' },
    { nis: '3269', name: 'GIBRAN KEENANDRA ARDIANSYAH', class: '3' },
    { nis: '3270', name: 'KANIA DWI NUR MAULIDDIAH', class: '3' },
    { nis: '3271', name: 'MUHAMMAD ABDULLOH FADIL', class: '3' },
    { nis: '3272', name: 'MUHAMMAD NATHAN HAFIZ PRADIPTA', class: '3' },
    { nis: '3273', name: 'MUHAMMAD NAUFAL AL RAJABI', class: '3' },
    { nis: '3274', name: 'MUHAMMAD RAKA ISLAMUDDIN', class: '3' },
    { nis: '3275', name: 'MUHAMMAD RAKHA FATKHUL HALIM', class: '3' },
    { nis: '3276', name: 'NAFISA AZZAHRA KHUSNANDAR', class: '3' },
    { nis: '3277', name: 'NIKMATUL NISA', class: '3' },
    { nis: '3278', name: 'OKTAVIA PUTRI GANESHA', class: '3' },
    { nis: '3279', name: 'RAYSA NABILAH PUTRI', class: '3' },
    { nis: '3280', name: 'RIKA ELVINA', class: '3' },
    { nis: '3281', name: 'SAYYID MAULANA IBRAHIM', class: '3' },
    { nis: '3282', name: 'TIKA ASSYIFAH ARRUM', class: '3' }
  ];

  defaultStudents.forEach(s => {
    const hashedPassword = bcrypt.hashSync(s.nis, 10);
    const user = insert('users', {
      username: s.nis,
      password: hashedPassword,
      name: s.name,
      role: 'siswa'
    });
    insert('students', {
      user_id: user.id,
      nis: s.nis,
      full_name: s.name,
      class: s.class
    });
  });

  console.log(`Seeded ${defaultStudents.length} default students`);
}

module.exports = { getDb, initDatabase, saveDb, loadDb, find, filter, insert, update, remove, count, sum, nextId };

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

module.exports = { getDb, initDatabase, saveDb, loadDb, find, filter, insert, update, remove, count, sum, nextId };

const DB = {
  collections: {
    USERS: 'users',
    STUDENTS: 'students',
    EXERCISES: 'exercises',
    ATTEMPTS: 'attempts',
    PROGRESS: 'student_progress'
  },

  async addDoc(collection, data) {
    data.created_at = data.created_at || new Date().toISOString();
    const ref = await db.collection(collection).add(data);
    await ref.update({ id: ref.id });
    return { id: ref.id, ...data };
  },

  async updateDoc(collection, id, data) {
    await db.collection(collection).doc(id).update(data);
    return { id, ...data };
  },

  async deleteDoc(collection, id) {
    await db.collection(collection).doc(id).delete();
  },

  async getDoc(collection, id) {
    const doc = await db.collection(collection).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async query(collection, filters = [], orderBy = null, limit = null) {
    let ref = db.collection(collection);
    filters.forEach(f => { ref = ref.where(f.field, f.op, f.value); });
    if (orderBy) ref = ref.orderBy(orderBy.field, orderBy.dir || 'asc');
    if (limit) ref = ref.limit(limit);
    const snap = await ref.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getAll(collection) {
    const snap = await db.collection(collection).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async batchDelete(collection, ids) {
    const batch = db.batch();
    ids.forEach(id => { batch.delete(db.collection(collection).doc(id)); });
    await batch.commit();
  },

  async getUniqueClasses() {
    const students = await this.getAll(this.collections.STUDENTS);
    return [...new Set(students.map(s => s.class))].sort();
  },

  async getStudentsByClass(className) {
    return await this.query(this.collections.STUDENTS, [{ field: 'class', op: '==', value: className }]);
  },

  async getAllStudentsWithStats() {
    const students = await this.getAll(this.collections.STUDENTS);
    const attempts = await this.getAll(this.collections.ATTEMPTS);
    const exercises = await this.getAll(this.collections.EXERCISES);

    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    return students.map(s => {
      const sAttempts = attempts.filter(a => a.student_id === s.id);
      const correct = sAttempts.filter(a => a.is_correct).length;
      const total = sAttempts.length;
      const lastAttempt = sAttempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      return {
        ...s,
        total_attempts: total,
        correct_attempts: correct,
        accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
        last_activity: lastAttempt ? lastAttempt.created_at : null
      };
    });
  },

  async getStudentDetail(studentId) {
    const student = await this.getDoc(this.collections.STUDENTS, studentId);
    if (!student) return null;

    const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'student_id', op: '==', value: studentId }]);
    const progress = await this.query(this.collections.PROGRESS, [{ field: 'student_id', op: '==', value: studentId }]);
    const exercises = await this.getAll(this.collections.EXERCISES);

    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter(a => a.is_correct).length;

    const categoryStats = {};
    attempts.forEach(a => {
      const ex = exMap[a.exercise_id];
      if (!ex) return;
      const key = `${ex.category}|${ex.subcategory}`;
      if (!categoryStats[key]) categoryStats[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
      categoryStats[key].total++;
      if (a.is_correct) categoryStats[key].correct++;
    });

    const recentAttempts = attempts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map(a => {
        const ex = exMap[a.exercise_id] || {};
        return { ...a, question: ex.question || '-', category: ex.category || '-', subcategory: ex.subcategory || '-', difficulty: ex.difficulty || 1 };
      });

    return {
      student,
      total_attempts: totalAttempts,
      correct_attempts: correctAttempts,
      accuracy: totalAttempts > 0 ? Math.round(correctAttempts / totalAttempts * 100) : 0,
      categoryStats: Object.values(categoryStats).map(s => ({ ...s, accuracy: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 })),
      recentAttempts,
      progress
    };
  },

  async getTeacherDashboard() {
    const students = await this.getAll(this.collections.STUDENTS);
    const attempts = await this.getAll(this.collections.ATTEMPTS);
    const exercises = await this.getAll(this.collections.EXERCISES);
    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    const today = new Date().toISOString().split('T')[0];
    const todayAttempts = attempts.filter(a => a.created_at && a.created_at.startsWith(today));
    const todayCorrect = todayAttempts.filter(a => a.is_correct).length;

    const studentStats = {};
    students.forEach(s => {
      const sAttempts = attempts.filter(a => a.student_id === s.id);
      const correct = sAttempts.filter(a => a.is_correct).length;
      studentStats[s.id] = { ...s, total_attempts: sAttempts.length, correct_attempts: correct, accuracy: sAttempts.length > 0 ? Math.round(correct / sAttempts.length * 100) : 0 };
    });

    const weakStudents = Object.values(studentStats)
      .filter(s => s.total_attempts > 0 && s.accuracy < 50)
      .sort((a, b) => a.accuracy - b.accuracy);

    const recentAttempts = attempts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(a => {
        const ex = exMap[a.exercise_id] || {};
        const student = students.find(s => s.id === a.student_id);
        return { ...a, student_name: student ? student.full_name : '-', category: ex.category || '-', subcategory: ex.subcategory || '-' };
      });

    const catStats = {};
    attempts.forEach(a => {
      const ex = exMap[a.exercise_id];
      if (!ex) return;
      const key = `${ex.category}|${ex.subcategory}`;
      if (!catStats[key]) catStats[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
      catStats[key].total++;
      if (a.is_correct) catStats[key].correct++;
    });

    return {
      totalStudents: students.length,
      todayStats: { attempts: todayAttempts.length, correct: todayCorrect, accuracy: todayAttempts.length > 0 ? Math.round(todayCorrect / todayAttempts.length * 100) : 0 },
      weakStudents,
      recentAttempts,
      categoryStats: Object.values(catStats).map(s => ({ ...s, accuracy: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 }))
    };
  },

  async getStudentDashboard(studentId) {
    const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'student_id', op: '==', value: studentId }]);
    const progress = await this.query(this.collections.PROGRESS, [{ field: 'student_id', op: '==', value: studentId }]);
    const exercises = await this.getAll(this.collections.EXERCISES);
    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter(a => a.is_correct).length;

    const catStats = {};
    attempts.forEach(a => {
      const ex = exMap[a.exercise_id];
      if (!ex) return;
      if (!catStats[ex.category]) catStats[ex.category] = { category: ex.category, total: 0, correct: 0 };
      catStats[ex.category].total++;
      if (a.is_correct) catStats[ex.category].correct++;
    });

    const recentAttempts = attempts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(a => {
        const ex = exMap[a.exercise_id] || {};
        return { ...a, question: ex.question || '-', category: ex.category || '-', subcategory: ex.subcategory || '-' };
      });

    const weeklyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayAttempts = attempts.filter(a => a.created_at && a.created_at.startsWith(dateStr));
      weeklyActivity.push({ date: dateStr, attempts: dayAttempts.length, correct: dayAttempts.filter(a => a.is_correct).length });
    }

    const currentLevel = progress.length > 0 ? Math.round(progress.reduce((a, p) => a + (p.current_difficulty || 1), 0) / progress.length) : 1;

    return {
      totalAttempts, correctAttempts, accuracy: totalAttempts > 0 ? Math.round(correctAttempts / totalAttempts * 100) : 0,
      categoryStats: Object.values(catStats).map(s => ({ ...s, accuracy: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 })),
      recentAttempts, weeklyActivity, currentLevel
    };
  },

  async getStudentProgress(studentId) {
    const progress = await this.query(this.collections.PROGRESS, [{ field: 'student_id', op: '==', value: studentId }]);
    const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'student_id', op: '==', value: studentId }]);
    const exercises = await this.getAll(this.collections.EXERCISES);
    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    const detailedStats = {};
    attempts.forEach(a => {
      const ex = exMap[a.exercise_id];
      if (!ex) return;
      const key = `${ex.category}|${ex.subcategory}|${ex.difficulty}`;
      if (!detailedStats[key]) detailedStats[key] = { category: ex.category, subcategory: ex.subcategory, difficulty: ex.difficulty, total: 0, correct: 0 };
      detailedStats[key].total++;
      if (a.is_correct) detailedStats[key].correct++;
    });

    const progressMap = {};
    progress.forEach(p => {
      const key = `${p.category}|${p.subcategory}`;
      progressMap[key] = p;
    });

    return {
      progress,
      detailedStats: Object.values(detailedStats).map(s => {
        const p = progressMap[`${s.category}|${s.subcategory}`];
        return {
          ...s,
          accuracy: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0,
          difficulty: p ? p.current_difficulty : s.difficulty
        };
      })
    };
  },

  async submitAttempt(studentId, exerciseId, studentAnswer, timeSpent) {
    const exercise = await this.getDoc(this.collections.EXERCISES, exerciseId);
    if (!exercise) throw new Error('Soal tidak ditemukan');

    const isCorrect = studentAnswer.trim().toLowerCase() === exercise.answer.trim().toLowerCase();

    await this.addDoc(this.collections.ATTEMPTS, {
      student_id: studentId, exercise_id: exerciseId, student_answer: studentAnswer, is_correct: isCorrect, time_spent: timeSpent || 0
    });

    const subKey = `${exercise.category}|${exercise.subcategory}`;
    const progressSnap = await db.collection(this.collections.PROGRESS)
      .where('student_id', '==', studentId)
      .where('category', '==', exercise.category)
      .where('subcategory', '==', exercise.subcategory)
      .get();

    let progress = progressSnap.empty ? null : { id: progressSnap.docs[0].id, ...progressSnap.docs[0].data() };

    if (!progress) {
      progress = await this.addDoc(this.collections.PROGRESS, {
        student_id: studentId, category: exercise.category, subcategory: exercise.subcategory,
        current_difficulty: exercise.difficulty, total_attempts: 1, correct_attempts: isCorrect ? 1 : 0
      });
    } else {
      const newTotal = (progress.total_attempts || 0) + 1;
      const newCorrect = (progress.correct_attempts || 0) + (isCorrect ? 1 : 0);
      let newDifficulty = progress.current_difficulty || exercise.difficulty;

      const recentAttempts = await this.query(this.collections.ATTEMPTS, [
        { field: 'student_id', op: '==', value: studentId }
      ]);
      const subAttempts = recentAttempts.filter(a => {
        const ex2 = exercises.find(e => e.id === a.exercise_id);
        return ex2 && ex2.category === exercise.category && ex2.subcategory === exercise.subcategory;
      }).slice(-5);

      if (subAttempts.length >= 5) {
        const recentCorrect = subAttempts.filter(a => a.is_correct).length;
        const recentAccuracy = recentCorrect / subAttempts.length;
        if (recentAccuracy >= 0.8 && newDifficulty < 5) newDifficulty++;
        else if (recentAccuracy < 0.5 && newDifficulty > 1) newDifficulty--;
      }

      await this.updateDoc(this.collections.PROGRESS, progress.id, {
        total_attempts: newTotal, correct_attempts: newCorrect, current_difficulty: newDifficulty, last_updated: new Date().toISOString()
      });
    }

    return {
      isCorrect, correctAnswer: exercise.answer, explanation: exercise.explanation,
      newDifficulty: progress.current_difficulty || exercise.difficulty
    };
  },

  async getExercisesForPractice(studentId, category, count) {
    const exercises = await this.getAll(this.collections.EXERCISES);
    const progress = await this.query(this.collections.PROGRESS, [{ field: 'student_id', op: '==', value: studentId }]);
    const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'student_id', op: '==', value: studentId }]);

    let difficulty = 1;
    if (category && category !== 'all') {
      const p = progress.find(pr => pr.category === category);
      if (p) difficulty = p.current_difficulty;
    } else if (progress.length > 0) {
      difficulty = Math.round(progress.reduce((a, p) => a + (p.current_difficulty || 1), 0) / progress.length);
    }

    const difficulties = [difficulty];
    if (difficulty > 1) difficulties.push(difficulty - 1);
    if (difficulty < 5) difficulties.push(difficulty + 1);

    const recentAttemptIds = attempts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50)
      .map(a => a.exercise_id);

    let filtered = exercises.filter(ex => {
      if (!difficulties.includes(ex.difficulty)) return false;
      if (category && category !== 'all' && ex.category !== category) return false;
      if (recentAttemptIds.includes(ex.id)) return false;
      return true;
    });

    if (filtered.length < count) {
      filtered = exercises.filter(ex => {
        if (!difficulties.includes(ex.difficulty)) return false;
        if (category && category !== 'all' && ex.category !== category) return false;
        return true;
      });
    }

    filtered = filtered.sort(() => Math.random() - 0.5).slice(0, count);

    return {
      exercises: filtered.map(ex => ({ ...ex, options: ex.options || null })),
      currentDifficulty: difficulty
    };
  },

  async getAllExercises(filters = {}) {
    let exercises = await this.getAll(this.collections.EXERCISES);

    if (filters.category) exercises = exercises.filter(e => e.category === filters.category);
    if (filters.type) exercises = exercises.filter(e => e.type === filters.type);
    if (filters.difficulty) exercises = exercises.filter(e => e.difficulty === parseInt(filters.difficulty));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      exercises = exercises.filter(e => e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q));
    }

    const byCategory = {};
    exercises.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + 1; });

    return { exercises, total: exercises.length, byCategory };
  },

  async saveExercise(data, id) {
    if (id) {
      await this.updateDoc(this.collections.EXERCISES, id, data);
      return { id, ...data };
    }
    return await this.addDoc(this.collections.EXERCISES, data);
  },

  async deleteExercise(id) {
    const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'exercise_id', op: '==', value: id }]);
    if (attempts.length > 0) {
      await this.batchDelete(this.collections.ATTEMPTS, attempts.map(a => a.id));
    }
    await this.deleteDoc(this.collections.EXERCISES, id);
  },

  async bulkDeleteExercises(ids) {
    for (const id of ids) {
      const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'exercise_id', op: '==', value: id }]);
      if (attempts.length > 0) await this.batchDelete(this.collections.ATTEMPTS, attempts.map(a => a.id));
    }
    await this.batchDelete(this.collections.EXERCISES, ids);
  },

  async createStudent(data) {
    const password = data.password || Auth.DEFAULT_STUDENT_PASSWORD;
    const userRef = await this.addDoc(this.collections.USERS, {
      username: data.nis, password, name: data.full_name, role: 'siswa'
    });
    const student = await this.addDoc(this.collections.STUDENTS, {
      user_id: userRef.id, nis: data.nis, full_name: data.full_name, class: data.class
    });
    return student;
  },

  async updateStudent(id, data) {
    const student = await this.getDoc(this.collections.STUDENTS, id);
    if (student && student.user_id) {
      const updates = {};
      if (data.nis) updates.username = data.nis;
      if (data.full_name) updates.name = data.full_name;
      if (Object.keys(updates).length > 0) await this.updateDoc(this.collections.USERS, student.user_id, updates);
    }
    await this.updateDoc(this.collections.STUDENTS, id, data);
  },

  async deleteStudent(id) {
    const student = await this.getDoc(this.collections.STUDENTS, id);
    if (student) {
      const attempts = await this.query(this.collections.ATTEMPTS, [{ field: 'student_id', op: '==', value: id }]);
      if (attempts.length > 0) await this.batchDelete(this.collections.ATTEMPTS, attempts.map(a => a.id));

      const progress = await this.query(this.collections.PROGRESS, [{ field: 'student_id', op: '==', value: id }]);
      if (progress.length > 0) await this.batchDelete(this.collections.PROGRESS, progress.map(p => p.id));

      if (student.user_id) await this.deleteDoc(this.collections.USERS, student.user_id);
      await this.deleteDoc(this.collections.STUDENTS, id);
    }
  },

  async getReportsAll() {
    const students = await this.getAllStudentsWithStats();
    const attempts = await this.getAll(this.collections.ATTEMPTS);
    const exercises = await this.getAll(this.collections.EXERCISES);
    const exMap = {};
    exercises.forEach(e => { exMap[e.id] = e; });

    const catStats = {};
    attempts.forEach(a => {
      const ex = exMap[a.exercise_id];
      if (!ex) return;
      const key = `${ex.category}|${ex.subcategory}`;
      if (!catStats[key]) catStats[key] = { category: ex.category, subcategory: ex.subcategory, total: 0, correct: 0 };
      catStats[key].total++;
      if (a.is_correct) catStats[key].correct++;
    });

    return {
      students,
      categoryStats: Object.values(catStats).map(s => ({ ...s, accuracy: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 })),
      generatedAt: new Date().toISOString()
    };
  },

  async backup() {
    const data = {};
    for (const key of Object.values(this.collections)) {
      data[key] = await this.getAll(key);
    }
    return data;
  },

  async restore(data) {
    for (const [collection, docs] of Object.entries(data)) {
      const existing = await this.getAll(collection);
      for (const doc of existing) {
        await this.deleteDoc(collection, doc.id);
      }
      for (const doc of docs) {
        const { id, ...rest } = doc;
        await db.collection(collection).doc(id).set(rest);
      }
    }
  },

  async parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim());
      if (values.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      results.push({
        nis: row.nis || '',
        full_name: row.nama || row.full_name || '',
        class: row.kelas || row.class || '3'
      });
    }
    return results;
  }
};

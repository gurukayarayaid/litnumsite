const Auth = {
  GURU_PASSWORD: 'alal1010',
  DEFAULT_STUDENT_PASSWORD: '123456',

  getUser() {
    const raw = localStorage.getItem('litnum_user');
    return raw ? JSON.parse(raw) : null;
  },

  setUser(user) {
    localStorage.setItem('litnum_user', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('litnum_user');
  },

  isLoggedIn() {
    return !!this.getUser();
  },

  requireRole(role) {
    const user = this.getUser();
    if (!user || user.role !== role) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  async loginGuru(password) {
    if (password !== this.GURU_PASSWORD) {
      throw new Error('Password salah');
    }
    const user = { id: 'admin', username: 'admin', name: 'Guru Administrator', role: 'guru' };
    this.setUser(user);
    return user;
  },

  async loginSiswa(nis, password) {
    const snapshot = await db.collection('users').where('username', '==', nis).where('role', '==', 'siswa').get();
    if (snapshot.empty) {
      throw new Error('NIS atau password salah');
    }
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    if (userData.password !== password) {
      throw new Error('NIS atau password salah');
    }

    const studentSnap = await db.collection('students').where('user_id', '==', userDoc.id).get();
    const student = studentSnap.empty ? null : { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() };

    const user = {
      id: userDoc.id,
      username: userData.username,
      name: student ? student.full_name : userData.name,
      role: 'siswa',
      studentId: student ? student.id : null,
      nis: student ? student.nis : null,
      class: student ? student.class : null
    };
    this.setUser(user);
    return user;
  }
};

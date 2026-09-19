const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const GURU_PASSWORD = 'alal1010';
const DEFAULT_STUDENT_PASSWORD = '123456';

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

async function seed() {
  console.log('Seeding Firestore...');

  // Seed admin
  const adminSnap = await db.collection('users').where('username', '==', 'admin').get();
  if (adminSnap.empty) {
    await db.collection('users').add({
      id: 'admin', username: 'admin', password: GURU_PASSWORD,
      name: 'Guru Administrator', role: 'guru', created_at: new Date().toISOString()
    });
    console.log('Admin user created');
  } else {
    console.log('Admin user already exists, skipping');
  }

  // Seed exercises
  const exSnap = await db.collection('exercises').limit(1).get();
  if (exSnap.empty) {
    const exercises = require('../config/questionBank');
    const batch = db.batch();
    exercises.forEach(ex => {
      const ref = db.collection('exercises').doc();
      batch.set(ref, {
        ...ex,
        id: ref.id,
        options: ex.options || null,
        created_at: new Date().toISOString()
      });
    });
    await batch.commit();
    console.log(`Seeded ${exercises.length} exercises`);
  } else {
    console.log('Exercises already exist, skipping');
  }

  // Seed students
  const studentSnap = await db.collection('students').limit(1).get();
  if (studentSnap.empty) {
    for (const s of defaultStudents) {
      const userRef = await db.collection('users').add({
        username: s.nis, password: DEFAULT_STUDENT_PASSWORD,
        name: s.name, role: 'siswa', created_at: new Date().toISOString()
      });
      await db.collection('students').add({
        user_id: userRef.id, nis: s.nis, full_name: s.name,
        class: s.class, created_at: new Date().toISOString()
      });
    }
    console.log(`Seeded ${defaultStudents.length} students`);
  } else {
    console.log('Students already exist, skipping');
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });

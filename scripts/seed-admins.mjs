// Run this once: node scripts/seed-admins.mjs
// This creates the Firestore admin profiles with the correct UIDs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

// Load env vars from .env.local
const envFile = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const firebaseConfig = {
  apiKey:            env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const admins = [
  {
    uid: '8SBTz9JLLjSVV8eOflhiPU1bKVA2',
    data: {
      name: 'Abhishek',
      email: 'abhishek@shipcube.com',
      role: 'super_admin',
      department: 'ai-team',
      status: 'active',
      notificationTokens: [],
      phone: '',
      photoURL: null,
    },
  },
  {
    uid: 'LeOSDf61T0dnUY34gwREwsrj8mi2',
    data: {
      name: 'Admin',
      email: 'admin@shipcube.com',
      role: 'super_admin',
      department: 'ai-team',
      status: 'active',
      notificationTokens: [],
      phone: '',
      photoURL: null,
    },
  },
];

async function seed() {
  for (const admin of admins) {
    try {
      await setDoc(doc(db, 'users', admin.uid), {
        ...admin.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`✅ Created profile for ${admin.data.email} (${admin.uid})`);
    } catch (err) {
      console.error(`❌ Failed for ${admin.data.email}:`, err.message);
    }
  }
  console.log('\nDone! You can now log in with the admin credentials.');
  process.exit(0);
}

seed();

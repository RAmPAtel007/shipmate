/**
 * seed-channels.mjs
 * Run with: node scripts/seed-channels.mjs
 * Creates default public + department channels in Firestore for SHIPMATE.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
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
const db  = getFirestore(app);

const channels = [
  { id: 'general',   name: 'general',   description: 'Company-wide announcements and updates', type: 'public',     departmentId: null,        members: [], isArchived: false, createdBy: 'system' },
  { id: 'random',    name: 'random',    description: 'Off-topic conversations and fun',         type: 'public',     departmentId: null,        members: [], isArchived: false, createdBy: 'system' },
  { id: 'ai-team',   name: 'ai-team',   description: 'AI Team channel',                         type: 'department', departmentId: 'ai-team',   members: [], isArchived: false, createdBy: 'system' },
  { id: 'marketing', name: 'marketing', description: 'Marketing team channel',                  type: 'department', departmentId: 'marketing',  members: [], isArchived: false, createdBy: 'system' },
  { id: 'finance',   name: 'finance',   description: 'Finance team channel',                    type: 'department', departmentId: 'finance',    members: [], isArchived: false, createdBy: 'system' },
  { id: 'hr',        name: 'hr',        description: 'HR team channel',                         type: 'department', departmentId: 'hr',         members: [], isArchived: false, createdBy: 'system' },
];

console.log('Seeding channels...');
for (const ch of channels) {
  const { id, ...data } = ch;
  await setDoc(doc(db, 'channels', id), {
    ...data,
    lastMessageAt: null,
    lastMessagePreview: '',
    lastMessageSenderId: null,
    createdAt: Timestamp.now(),
  }, { merge: true });
  console.log(`  ✓ #${ch.name}`);
}
console.log('Done! All channels created.');
process.exit(0);

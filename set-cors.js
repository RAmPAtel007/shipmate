/**
 * set-cors.js
 * Run once to configure CORS on your Firebase Storage bucket.
 *
 * SETUP (one-time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → save the JSON file
 *   3. Rename it to "serviceAccountKey.json" and place it in this folder
 *   4. Run:  node set-cors.js
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');

const BUCKET = 'gemini-enterprise-481717.firebasestorage.app';

const CORS_CONFIG = [
  {
    origin: ['*'],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'x-goog-resumable',
      'Access-Control-Allow-Origin',
      'ETag',
    ],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');

  let storage;
  try {
    storage = new Storage({ keyFilename: keyPath });
  } catch {
    console.error('❌  Could not load serviceAccountKey.json');
    console.error('   Download it from: Firebase Console → Project Settings → Service Accounts');
    process.exit(1);
  }

  const bucket = storage.bucket(BUCKET);

  console.log(`\n🔧  Applying CORS to gs://${BUCKET} …`);
  try {
    await bucket.setCorsConfiguration(CORS_CONFIG);
    console.log('✅  CORS configured successfully!\n');
    console.log('You can now upload files from any domain.');
    console.log('Remember to also run:  firebase deploy --only storage\n');
  } catch (err) {
    console.error('❌  Failed to set CORS:', err.message);
    console.error('\nMake sure the service account has the "Storage Admin" role.');
    process.exit(1);
  }
}

main();

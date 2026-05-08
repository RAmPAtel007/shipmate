# SHIPMATE Setup Guide

Complete step-by-step setup instructions for the SHIPMATE PWA application.

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Firebase CLI installed: `npm install -g firebase-tools`
- Google Cloud Project with Firebase enabled
- Google OAuth credentials
- @shipcube.com Google Workspace domain

## Step 1: Firebase Project Setup

### Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project named "SHIPMATE"
3. Enable Google Analytics (optional)
4. Wait for project creation to complete

### Enable Services

1. **Authentication**
   - Go to Authentication > Sign-in method
   - Enable Google
   - Add Authorized domains: `localhost:3000`, `shipmate.shipcube.com`

2. **Firestore Database**
   - Create database in "production" mode
   - Set location (suggest: `us-central1` or region closest to your users)

3. **Cloud Storage**
   - Create storage bucket
   - Name: `{project-id}.appspot.com`
   - Choose region matching Firestore

4. **Cloud Messaging (FCM)**
   - Go to Project Settings > Cloud Messaging
   - Copy Server API Key (for future use)

### Get Credentials

1. Go to Project Settings (gear icon)
2. Copy all values under "firebaseConfig":
   - API Key
   - Auth Domain
   - Project ID
   - Storage Bucket
   - Messaging Sender ID
   - App ID
   - Measurement ID

## Step 2: Local Development Setup

### Clone and Install

```bash
# Clone repository
git clone <repo-url> shipmate
cd shipmate

# Install dependencies
npm install

# Or with yarn
yarn install
```

### Configure Environment

```bash
# Copy example env file
cp .env.local.example .env.local

# Edit .env.local and fill in Firebase credentials
nano .env.local
```

**Example .env.local:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=shipmate-xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=shipmate-xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=shipmate-xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC...
NEXT_PUBLIC_FCM_VAPID_KEY=BCxxxx...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Initialize Firebase Locally

```bash
# Login to Firebase
firebase login

# Initialize Firebase in project
firebase init

# When prompted:
# - Select "Firestore" and "Storage"
# - Use existing project "SHIPMATE"
# - Accept defaults for other options
```

## Step 3: Deploy Firestore Rules & Indexes

### Deploy Rules

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage

# Deploy indexes
firebase deploy --only firestore:indexes
```

### Verify Deployment

1. Go to Firestore > Rules - verify rules are deployed
2. Go to Storage > Rules - verify storage rules
3. Go to Firestore > Indexes - verify composite indexes created

## Step 4: Local Development

```bash
# Start development server
npm run dev

# Server runs on http://localhost:3000
```

### Test Sign-In

1. Open http://localhost:3000
2. Click "Sign in with Google"
3. Select @shipcube.com account
4. Create new user profile in Firestore
5. Should redirect to `/home`

## Step 5: Production Deployment

### Build for Production

```bash
# Type check
npm run type-check

# Lint code
npm run lint

# Build Next.js app
npm run build

# This creates optimized production bundle
```

### Deploy to Firebase Hosting

```bash
# Ensure you're logged in
firebase login

# Deploy to Firebase Hosting
firebase deploy

# Or deploy specific resources
firebase deploy --only hosting
firebase deploy --only firestore:rules,storage
```

### Post-Deployment

1. Go to Firebase Hosting in console
2. Verify domain shows in Hosting tab
3. Test application at production URL
4. Update Google OAuth credentials with production domain

## Step 6: Custom Domain Setup

### Add Custom Domain to Firebase Hosting

```bash
# In Firebase Console:
# 1. Go to Hosting
# 2. Click "Connect Domain"
# 3. Enter "shipmate.shipcube.com"
# 4. Follow DNS verification steps
```

### DNS Configuration

For Shipcube domain registrar:
- Add CNAME record pointing to Firebase hosting
- Or follow Firebase's A record instructions
- Wait for DNS propagation (up to 24 hours)

### Google OAuth Update

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select SHIPMATE project
3. Go to APIs & Services > Credentials
4. Edit OAuth consent screen:
   - Add authorized domain: `shipmate.shipcube.com`
   - Update privacy policy URL if applicable
5. Edit OAuth 2.0 Client ID:
   - Add URI: `https://shipmate.shipcube.com`
   - Add URI: `https://shipmate.shipcube.com/`

## Step 7: Initialize Master Data

### Create Departments

```typescript
// Run in Firestore console or Cloud Functions
const departments = [
  { id: 'ai-team', name: 'AI Team', slug: 'ai-team' },
  { id: 'marketing', name: 'Marketing', slug: 'marketing' },
  { id: 'finance', name: 'Finance', slug: 'finance' },
  { id: 'hr', name: 'HR', slug: 'hr' },
];

// Use Firebase Console Firestore tab to add documents
```

### Create Public Channels

```
/channels/general
- name: "general"
- type: "public"
- description: "General discussion"
- members: []
- createdBy: (admin-uid)

/channels/announcements
- name: "announcements"
- type: "public"
- description: "Company announcements"
- members: []
- createdBy: (admin-uid)
```

### Setup Holidays

Add national holidays to `/leaveHolidays` collection:

```
/leaveHolidays/{id}
- name: "New Year"
- date: "2024-01-01"
- type: "national"
```

## Step 8: Assign Roles to Users

### Using Firebase Console

1. Go to Firestore > users collection
2. Edit first user document
3. Set `role` field to `'super_admin'`
4. Set other users as `'hr_admin'`, `'manager'`, or `'employee'`

### Using Custom Admin Script

Create `scripts/setup-admin.ts` and run via Cloud Functions

## Step 9: Enable PWA

PWA is automatically enabled in production via next-pwa config.

### Test PWA Offline

1. Build production: `npm run build && npm start`
2. Open DevTools > Application > Service Workers
3. Check "Offline" checkbox
4. Refresh page - should work offline
5. Chat messages cached locally
6. View offline indicator in UI

## Step 10: Monitoring & Maintenance

### Enable Error Tracking

1. Go to Cloud Logging
2. Create log sink for client errors
3. Route to Cloud Monitoring

### Set Up Alerts

1. Go to Cloud Monitoring > Alerting
2. Create alerts for:
   - High Firestore read rate
   - Storage quota approaching
   - Authentication failures

### Regular Maintenance

- Review Firestore indexes monthly
- Archive old messages (optional)
- Backup critical data to Cloud Storage
- Monitor service quotas

## Troubleshooting

### Sign-In Issues

```
Error: "Access denied. Only @shipcube.com accounts are authorized."
```
- Verify Google OAuth domain restriction is set
- Check user email ends with @shipcube.com
- Clear browser cookies and retry

### Firestore Rules Denials

```
Error: Missing or insufficient permissions
```
- Check firestore.rules file is deployed
- Verify user role in users/{uid} document
- Check department field matches
- Test with anonymous user (should fail)

### Storage Upload Failed

```
Error: 412 Precondition Failed
```
- Verify storage.rules deployed
- Check file size < 10MB
- Verify file MIME type is allowed
- Ensure user email ends with @shipcube.com

### PWA Service Worker Issues

```
Service Worker registration failed
```
- Ensure https (or localhost)
- Check /public/manifest.json exists
- Clear browser cache and storage
- Reinstall PWA

### Firebase CLI Auth Issues

```
Error: Unable to parse contents of 'firebase.json'
```
- Verify firebase.json syntax is valid
- Re-run: `firebase init` in project root
- Or manually update firebase.json

## Performance Optimization

### Firestore Optimization

- Composite indexes created (see firestore.indexes.json)
- Denormalize data where appropriate
- Use subcollections for large datasets
- Archive old data to separate collections

### Build Optimization

```bash
# Analyze bundle size
npm install --save-dev @next/bundle-analyzer

# Add to next.config.js and build
npm run build
```

### Caching Strategy

- Static assets: 1 year
- Next.js assets: immutable
- API responses: per-route via React Query
- Service worker: always check for updates

## Security Checklist

- [ ] Firestore rules deployed (production mode)
- [ ] Storage rules deployed
- [ ] Google OAuth domain restriction set
- [ ] HTTPS enabled on all domains
- [ ] Environment variables not in git
- [ ] Admin credentials not exposed
- [ ] Regular security audits scheduled
- [ ] Rate limiting configured (if behind proxy)
- [ ] Audit logging enabled

## Next Steps

1. Set up custom domain
2. Configure analytics
3. Create admin users
4. Initialize leave policy
5. Send invitations to team
6. Conduct user training
7. Monitor production metrics
8. Plan feature roadmap

## Support

For issues:
1. Check logs: `firebase functions:log`
2. Check Firestore usage: Firebase Console > Usage
3. Monitor Firestore Rules: Firestore > Indexes > Issues
4. Contact SHIPMATE team at shipmate@shipcube.com

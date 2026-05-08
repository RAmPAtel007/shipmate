# SHIPMATE Quick Start Guide

Get SHIPMATE up and running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Firebase project created
- Firebase CLI installed: `npm install -g firebase-tools`

## 1. Install Dependencies (1 min)

```bash
cd shipmate
npm install
```

## 2. Configure Firebase (2 min)

```bash
# Copy example env file
cp .env.local.example .env.local

# Edit and fill in your Firebase credentials
# You can find these in Firebase Console > Project Settings
```

**Required environment variables:**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FCM_VAPID_KEY`

## 3. Deploy Firebase Rules (1 min)

```bash
# Login to Firebase
firebase login

# Deploy security rules
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 4. Start Development Server (1 min)

```bash
npm run dev
```

Open http://localhost:3000

## 5. Sign In

1. Click "Sign in with Google"
2. Use your @shipcube.com account
3. First time creates your profile automatically
4. Redirects to home dashboard

## Verify Setup

- [ ] Sign-in page loads
- [ ] Google OAuth popup appears
- [ ] User profile created in Firestore
- [ ] Dashboard displays
- [ ] Sidebar navigation visible
- [ ] User menu works

## Common Issues

### Port Already in Use
```bash
# Use different port
npm run dev -- -p 3001
```

### Firebase Rules Denied
```bash
# Redeploy rules
firebase deploy --only firestore:rules
```

### "Only @shipcube.com accounts are authorized"
- Verify email ends with @shipcube.com
- Clear cookies and try again

### Module Not Found
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
```

## Next Steps

After successful setup:

1. **Explore Components**
   - Check `/src/components/ui` for Button, Input, Badge components
   - See `/src/components/layout` for Header and Sidebar

2. **Review Services**
   - `/src/lib/services/messages.ts` - Message operations
   - `/src/lib/services/leaves.ts` - Leave management
   - `/src/lib/services/channels.ts` - Channel operations

3. **Build Features**
   - Create new routes in `/src/app`
   - Use existing components from UI library
   - Call service functions for database operations

4. **Read Documentation**
   - `README.md` - Full documentation
   - `SETUP.md` - Detailed setup guide
   - `IMPLEMENTATION_SUMMARY.md` - Architecture overview

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Production build
npm start               # Run production build

# Quality
npm run lint            # Run ESLint
npm run type-check      # TypeScript check

# Firebase
firebase deploy         # Deploy everything
firebase deploy --only hosting  # Deploy only frontend
firebase functions:log  # View Cloud Functions logs
```

## Project Structure Quick Reference

```
src/
├── app/                 # Routes (page.tsx files)
├── components/
│   ├── ui/             # Button, Input, Badge, Avatar
│   └── layout/         # Header, Sidebar
├── contexts/           # AuthContext
├── hooks/              # useMessages, useChannels
├── lib/
│   ├── firebase/       # Auth helpers
│   ├── services/       # Database CRUD
│   ├── types/          # TypeScript types
│   └── utils/          # Helpers
├── middleware.ts       # Route protection
└── styles/globals.css  # Global styles
```

## Firestore Collections

**Start with these 3:**

1. **users**
   - User profiles with role/department
   - Created automatically on sign-in

2. **channels**
   - Team chat channels
   - Create via createChannel() service

3. **messages**
   - Channel messages
   - Create via sendMessage() service

See `src/lib/types/index.ts` for complete schema.

## Add First Feature

Example: Add a new button to dashboard

1. Open `src/app/home/page.tsx`
2. Import Button: `import { Button } from '@/components/ui/Button'`
3. Add to JSX: `<Button variant="primary">Click Me</Button>`
4. Save - hot reload shows changes

## Production Deploy

```bash
# Build optimized bundle
npm run build

# Deploy to Firebase Hosting
firebase deploy

# View live at your Firebase domain
# https://shipmate-xxx.web.app
```

## Get Help

- Check error messages in browser console
- Review `SETUP.md` for detailed setup
- Check Firebase Console for Firestore rules errors
- See `README.md` for API documentation

---

**You're ready to build!** 🚀

Start by exploring the codebase and familiarizing yourself with the existing components and services.

# SHIPMATE — Shipcube

Internal team operating system for Shipcube. One place for chat, leave management, announcements, documents, and team directory — built as a mobile-first PWA.

---

## Features

### Employee app
- **Home dashboard** — personalised greeting, leave balance, upcoming birthdays, who's on leave today, pinned announcements
- **Attendance** — GPS-verified punch-in/punch-out with live clock, status tracking, 30-day history, and 7-day stats
- **Chat** — real-time channels, DMs, @mentions, file sharing
- **Leave requests** — apply, track, and cancel leave with live balance display
- **Calendar** — team calendar view
- **Payslip** — view and download monthly payslips
- **People** — searchable employee directory with department filter
- **Documents** — upload and browse shared files (PDF, images, ZIP, DOCX, and more)
- **Notification bell** — in-app notification badge that clears when viewed
- **PWA** — installable on iOS and Android with Shipcube home-screen icon

### Admin panel
- **Dashboard** — live stat cards (team size, pending leaves, channels, documents)
- **Team management** — roles, departments, warehouses, member assignment
- **Account provisioning** — admin creates employee accounts with email + temporary password; credentials shown once at creation
- **Tab access control** — per-employee toggle to show/hide optional nav tabs (Chat, Payslip, People, Documents)
- **Leave approvals** — approve / reject with admin notes; full history
- **Announcements** — create, pin, and delete company notices
- **Payroll** — monthly payroll overview with Excel (.xlsx) export
- **Chat & Channels** — channel creation and moderation
- **Documents** — upload management
- **Settings** — company info and team structure

### Technical highlights
- Real-time updates via Firestore `onSnapshot`
- Role-based access: `super_admin`, `hr_admin`, `manager`, `employee`
- Email + password authentication — no self sign-up; admin provisions all accounts
- Admin creates accounts via secondary Firebase app instance (stays logged in while creating)
- Password reset via Firebase email link (works for migrating existing Google Sign-In users too)
- Per-employee tab access control managed by admins
- GPS location capture for attendance verification
- Push notifications via Firebase Cloud Messaging (FCM)
- Excel (.xlsx) export for payroll data via SheetJS
- Mobile-first responsive layout with safe-area support

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) App Router (Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Backend | Firebase — Firestore, Auth, Storage, FCM |
| State | Zustand + React Query |
| Forms | React Hook Form + Zod |
| UI | Lucide React, react-hot-toast, react-dropzone |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://firebase.google.com/) project with **Authentication** (Email/Password provider enabled), **Firestore**, and **Storage** enabled
- [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`)

### 1 — Clone and install

```bash
git clone https://github.com/your-org/shipmate.git
cd shipmate
npm install
```

### 2 — Environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Firebase credentials from **Firebase Console → Project Settings → Your Apps**:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=   # optional
NEXT_PUBLIC_FIREBASE_VAPID_KEY=        # for push notifications (see step 5)
```

### 3 — Enable Email/Password auth in Firebase

Firebase Console → **Authentication → Sign-in method → Email/Password → Enable**

> No Google Sign-In is used. All employee accounts are created by an admin through the admin panel (Admin → Employees → Create account). The first super admin account must be created directly in the Firebase Console or seeded manually.

### 4 — Deploy Firestore rules

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

### 5 — Generate PWA icons (one-time)

```bash
npm install sharp
node generate-icons.js
```

This fetches the Shipcube logo and generates all required PNG icon sizes into `public/icons/`. Commit the output.

### 6 — Push notifications (optional)

1. Firebase Console → **Project Settings → Cloud Messaging → Web Push certificates → Generate key pair**
2. Copy the key into `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in `.env.local` (and in Vercel env vars)
3. Fill in the Firebase config values inside `public/firebase-messaging-sw.js`

### 7 — Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Firestore Security Rules

The full rules file is at `firestore.rules`. Deploy with:

```bash
firebase deploy --only firestore:rules
```

Key rule highlights:
- Any signed-in user can read `users`, `departments`, `channels`, `announcements`, `leaveRequests`, `documents`, `birthdayWishes`
- Employees can only write their own `leaveRequests` (create) and `users` (update own profile)
- HR admins and super admins have full write access
- Announcements: any signed-in user can update only the `readBy` field (mark-as-read)

---

## Project Structure

```
shipmate/
├── src/
│   ├── app/
│   │   ├── (app)/               # Employee-facing pages
│   │   │   ├── home/            # Dashboard
│   │   │   ├── chat/            # Messaging
│   │   │   ├── leaves/          # Leave requests
│   │   │   ├── people/          # Team directory
│   │   │   ├── announcements/   # Company notices
│   │   │   ├── documents/       # File browser
│   │   │   ├── settings/        # Profile & preferences
│   │   │   └── layout.tsx       # App shell (sidebar + mobile nav)
│   │   ├── admin/               # Admin panel
│   │   │   ├── page.tsx         # Admin dashboard
│   │   │   ├── users/           # Team & department management
│   │   │   ├── leaves/          # Leave approvals
│   │   │   ├── announcements/   # Announcement management
│   │   │   ├── chat/            # Chat moderation
│   │   │   ├── channels/        # Channel management
│   │   │   ├── documents/       # Document management
│   │   │   └── settings/        # Company settings
│   │   ├── (auth)/login/        # Sign-in page (email + password)
│   │   └── layout.tsx           # Root layout (fonts, PWA meta)
│   ├── components/
│   │   ├── layout/              # AppShell, DesktopSidebar, MobileNav
│   │   └── ui/                  # Shared UI primitives
│   ├── hooks/                   # useUnreadCounts, usePushNotifications, useRole …
│   ├── contexts/                # AuthContext
│   └── lib/
│       ├── firebase/            # Firebase config
│       ├── services/            # Firestore service layer
│       ├── types/               # Shared TypeScript types
│       └── utils/               # Formatters and helpers
├── public/
│   ├── icons/                   # PWA icons (generated by generate-icons.js)
│   ├── firebase-messaging-sw.js # FCM service worker
│   └── manifest.json            # Web app manifest
├── firestore.rules              # Firestore security rules
├── generate-icons.js            # One-time PWA icon generator
├── .env.local.example           # Environment variable template
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build (no lint) |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript check (no emit) |
| `node generate-icons.js` | Generate PWA icons (run once after `npm install sharp`) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | Firestore project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✅ | Cloud Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✅ | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✅ | Firebase app ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | optional | Google Analytics |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | optional | FCM Web Push VAPID key |
| `NEXT_PUBLIC_APP_URL` | optional | Base URL (default: `http://localhost:3000`) |

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com/)
3. Add all `NEXT_PUBLIC_*` env vars in **Project Settings → Environment Variables**
4. Add your Vercel/custom domain to **Firebase Console → Authentication → Authorized domains**
5. Deploy

### First admin account

After deploying, create the first `super_admin` account directly in **Firebase Console → Authentication → Users → Add user**, then create the matching Firestore document in `users/{uid}` with `role: "super_admin"`. All subsequent employee accounts can be created from the admin panel.

---

## User Roles

| Role | Capabilities |
|---|---|
| `super_admin` | Full access — all admin features + settings |
| `hr_admin` | Team management, leave approvals, announcements |
| `manager` | Approve team leaves, post announcements |
| `employee` | Submit leave, chat, view directory, manage own profile |

---

## License

Private — internal use by Shipcube only.

<!-- updates -->
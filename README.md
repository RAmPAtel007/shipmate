# Shipmate

An internal HR and team management platform for Shipcube. Employees get a single place to view announcements, request leave, and manage their profile. Admins get full control over team members, departments, leave approvals, and company settings.

---

## Features

### Employee dashboard
- Personalised home page with leave balance, upcoming birthdays, and company announcements
- Leave request flow with date picker and leave-type selection
- Personal profile management

### Admin panel
- **Team Management** — real-time member table with role, department, and status editing; department cards with create / rename / delete and inline member assignment
- **Leave Approvals** — review, approve, or reject pending requests
- **Announcements** — publish and pin company-wide notices
- **Dashboard** — live stat cards with hover popovers showing users, pending leaves, and more
- **Settings** — company info, team structure, and notification preferences

### Technical highlights
- Real-time data via Firestore `onSnapshot` (no polling, no manual refreshes)
- Role-based access control: `super_admin`, `hr_admin`, `manager`, `employee`
- Google Sign-In with optional email-domain restriction
- Fully responsive — mobile through widescreen

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org/) App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database / Auth / Storage | Firebase (Firestore, Authentication, Storage) |
| State | Zustand + React Query |
| Forms | React Hook Form + Zod |
| UI | Lucide React, react-hot-toast, react-dropzone |

---

## Getting Started

### Prerequisites

- Node.js 18 or later
- A [Firebase](https://firebase.google.com/) project with **Authentication**, **Firestore**, and **Storage** enabled

### 1 — Clone and install

```bash
git clone https://github.com/your-org/shipmate.git
cd shipmate
npm install
```

### 2 — Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and paste in your Firebase credentials (Firebase Console → Project Settings → Your Apps → SDK setup and configuration):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

To restrict sign-up to your company domain, also set:

```env
NEXT_PUBLIC_ALLOWED_DOMAINS=yourdomain.com
```

### 3 — Configure Firebase

In the Firebase Console:

1. **Authentication** → Sign-in method → enable **Google**
2. **Firestore** → Create database → start in production mode → apply the rules below
3. **Storage** → Get started

**Firestore security rules:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function role() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin()   { return role() in ['super_admin']; }
    function isHR()      { return role() in ['super_admin', 'hr_admin']; }
    function isManager() { return role() in ['super_admin', 'hr_admin', 'manager']; }

    match /users/{uid} {
      allow read:  if request.auth != null;
      allow write: if request.auth.uid == uid || isHR();
    }
    match /departments/{id} {
      allow read:  if request.auth != null;
      allow write: if isHR();
    }
    match /leaveRequests/{id} {
      allow read:   if request.auth != null;
      allow create: if request.auth != null;
      allow update: if isManager();
    }
    match /announcements/{id} {
      allow read:  if request.auth != null;
      allow write: if isManager();
    }
    match /settings/{id} {
      allow read:  if request.auth != null;
      allow write: if isAdmin();
    }
  }
}
```

### 4 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
shipmate/
├── src/
│   ├── app/
│   │   ├── (app)/            # Employee-facing pages
│   │   │   ├── home/         # Dashboard
│   │   │   ├── leaves/       # Leave requests
│   │   │   ├── people/       # Team directory
│   │   │   ├── profile/      # User profile
│   │   │   └── layout.tsx    # App shell + sidebar
│   │   ├── admin/            # Admin panel
│   │   │   ├── page.tsx      # Admin dashboard
│   │   │   ├── users/        # Team & department management
│   │   │   ├── leaves/       # Leave approvals
│   │   │   ├── announcements/
│   │   │   └── settings/
│   │   ├── auth/             # Sign-in page
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── firebase/         # Firebase config + client
│   │   ├── services/         # Firestore service layer
│   │   ├── stores/           # Zustand global stores
│   │   ├── types/            # Shared TypeScript types
│   │   └── utils/            # Formatters and helpers
│   └── components/           # Shared UI components
├── public/
├── .env.example              # ← copy to .env.local
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript type check (no emit) |

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
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | optional | Analytics |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | optional | Push notification VAPID key |
| `NEXT_PUBLIC_APP_URL` | optional | Base URL (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_ALLOWED_DOMAINS` | optional | Allowed sign-up email domains |

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com/)
3. Add all `NEXT_PUBLIC_*` values in **Project Settings → Environment Variables**
4. Deploy

---

## User Roles

| Role | Capabilities |
|---|---|
| `super_admin` | Full access — all admin features + settings |
| `hr_admin` | Team management, leave approvals, announcements |
| `manager` | Approve team leaves, post announcements |
| `employee` | Submit leave, view directory, manage own profile |

---

## License

Private — internal use by Shipcube only.

# SHIPMATE - Shipcube Team Operating System

Enterprise-grade team collaboration and HR management platform built with Next.js, React, TypeScript, and Firebase.

## Overview

SHIPMATE is a comprehensive team operating system designed to streamline HR operations, leave management, team communication, and employee directory for Shipcube.

**Brand Colors:**
- Navy: `#1B2B5E`
- Yellow: `#F5C518`
- Background: `#F4F5F7`

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript
- **Styling:** Tailwind CSS, Lucide React Icons
- **Backend:** Firebase (Authentication, Firestore, Storage)
- **State Management:** React Context API
- **UI Components:** Custom component library + shadcn-inspired patterns

## Features

### Authentication
- Google OAuth with @shipcube.com domain restriction
- Session management with Firebase Auth
- Role-based access control (RBAC)

### Core Features
1. **Dashboard** - Time-based greeting, quick stats, announcements
2. **Leave Management** - Apply, track, and approve leaves with balance tracking
3. **Chat** - Team and direct messaging with real-time updates
4. **People Directory** - Search, filter, and connect with teammates
5. **Role Management** - Super Admin, HR Admin, Manager, Employee roles

### User Roles & Permissions

```
Super Admin
├── View/manage all users
├── Approve/reject all leaves
├── Manage holidays
├── View audit logs
└── System settings

HR Admin
├── Approve leaves
├── Manage leave balances
├── Post announcements
└── View department reports

Manager
├── Approve team leaves
├── Post team announcements
└── View team performance

Employee
├── Apply for leaves
├── Chat and messaging
└── View company announcements
```

## Project Structure

```
src/
├── app/
│   ├── auth/
│   │   └── login/
│   ├── app/
│   │   ├── home/
│   │   ├── leaves/
│   │   ├── chat/
│   │   ├── people/
│   │   └── layout.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/              # Reusable UI components
│   ├── layout/          # Layout components
│   ├── home/            # Home page components
│   ├── leaves/          # Leave management components
│   ├── chat/            # Chat components
│   ├── people/          # People directory components
│   └── hr/              # HR admin components
├── contexts/            # React Context providers
├── hooks/               # Custom React hooks
├── lib/
│   ├── firebase.ts      # Firebase configuration
│   ├── types.ts         # TypeScript types
│   ├── services/        # Firebase service classes
│   └── utils/           # Utility functions
└── public/              # Static assets
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase project with Firestore and Authentication enabled

### Installation

```bash
# Clone repository
git clone <repo-url>
cd shipmate

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Firebase credentials

# Run development server
npm run dev
```

Visit `http://localhost:3000`

### Firebase Setup

1. Create a Firebase project at https://firebase.google.com
2. Enable Google Authentication
3. Create Firestore database in test mode (configure rules later)
4. Add Firebase config to `.env.local`
5. Create Firestore collections:
   - `users` - User profiles
   - `leaves` - Leave applications
   - `leave_balances` - Leave balance tracking
   - `chat_channels` - Chat channels
   - `chat_messages` - Chat messages
   - `announcements` - Company announcements
   - `holidays` - Holiday calendar

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth.uid != null;
      allow update: if request.auth.uid == userId || isAdmin();
      allow create: if request.auth.uid == userId;
    }

    // Leaves collection
    match /leaves/{leaveId} {
      allow read: if request.auth.uid != null && isOwnerOrManager();
      allow create: if request.auth.uid != null;
      allow update: if isOwnerOrManager() || isHRAdmin();
    }

    // Chat messages
    match /chat_messages/{messageId} {
      allow read, write: if request.auth.uid != null && userInChannel();
    }

    // Announcements
    match /announcements/{announcementId} {
      allow read: if request.auth.uid != null;
      allow write: if isManagerOrAbove();
    }
  }

  function isAdmin() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['super_admin'];
  }

  function isHRAdmin() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['super_admin', 'hr_admin'];
  }

  function isManagerOrAbove() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['super_admin', 'hr_admin', 'manager'];
  }

  function isOwner(userId) {
    return request.auth.uid == userId;
  }

  function isOwnerOrManager() {
    let currentUser = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    return request.auth.uid == resource.data.userId || currentUser.role in ['manager', 'super_admin', 'hr_admin'];
  }

  function userInChannel() {
    return true; // Implement channel membership check
  }
}
```

## Key Components

### AuthContext
Global authentication state with Firebase Auth integration, domain validation, and user profile management.

### Custom Hooks
- `useAuth()` - Access current user and auth methods
- `useRole()` - Check permissions based on role

### Services
- `userService` - User CRUD and profile management
- `leaveService` - Leave applications and approval workflow
- `chatService` - Real-time messaging

### UI Components
- Button (variants: primary, secondary, ghost, danger)
- Card (header, content, footer)
- Badge (status indicators)
- Avatar (with online indicator)
- EmptyState (placeholder screens)

## Styling

Uses Tailwind CSS with custom configuration:
- Navy (#1B2B5E) for primary actions
- Yellow (#F5C518) for highlights and CTAs
- Gray scale for content hierarchy

Responsive design with mobile-first approach and PWA support.

## Deployment

### Vercel (Recommended)
```bash
npm run build
vercel deploy
```

### Firebase Hosting
```bash
npm run build
firebase deploy
```

## Environment Variables

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_ALLOWED_DOMAINS
```

## Performance Optimizations

- Code splitting with Next.js dynamic imports
- Image optimization
- CSS-in-JS with Tailwind
- Firebase connection pooling
- Lazy loading of non-critical routes

## Security Features

- @shipcube.com domain-only authentication
- Firebase security rules for data access control
- CORS headers configured
- CSRF protection via Next.js
- Input validation and sanitization
- Role-based access control (RBAC)

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- iOS Safari: Latest 2 versions

## Development

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Building for production
npm run build

# Starting production server
npm run start
```

## Contributing

1. Create feature branch
2. Follow existing code patterns
3. Add TypeScript types
4. Test on mobile and desktop
5. Submit pull request

## License

Proprietary - Shipcube Inc.

## Support

For issues and questions, contact the development team.

## Roadmap

- [ ] Advanced analytics dashboard
- [ ] Expense management
- [ ] Performance reviews
- [ ] Learning & development module
- [ ] Integration with payroll systems
- [ ] Mobile app (React Native)
- [ ] Slack/Teams integration
- [ ] Calendar sync

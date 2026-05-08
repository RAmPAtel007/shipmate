# SHIPMATE Project Structure & Files Generated

## Overview
Complete production-ready Next.js 14 + React 18 + TypeScript application for SHIPMATE (Shipcube Team Operating System).

Generated: May 7, 2026
Version: 1.0.0

---

## Directory Structure

```
shipmate/
├── public/
│   ├── manifest.json              # PWA manifest
│   └── icons/                     # App icons (192x192, 512x512, maskable)
│
├── src/
│   ├── app/
│   │   ├── globals.css            # Global styles, animations, tailwind
│   │   ├── layout.tsx             # Root layout with Toaster & AuthProvider
│   │   ├── page.tsx               # Root redirect to /home or /login
│   │   │
│   │   ├── auth/
│   │   │   └── login/
│   │   │       └── page.tsx       # Google OAuth login page
│   │   │
│   │   └── app/
│   │       ├── layout.tsx         # App shell layout with sidebar/nav
│   │       │
│   │       ├── home/
│   │       │   └── page.tsx       # Dashboard with greeting, stats, cards
│   │       │
│   │       ├── leaves/
│   │       │   └── page.tsx       # Leave management & approval UI
│   │       │
│   │       ├── chat/
│   │       │   └── page.tsx       # Messaging with channels & conversations
│   │       │
│   │       └── people/
│   │           └── page.tsx       # Employee directory with search/filter
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx         # Reusable button with variants
│   │   │   ├── Card.tsx           # Card container + subcomponents
│   │   │   ├── Badge.tsx          # Status badges
│   │   │   ├── Avatar.tsx         # User avatars with online indicator
│   │   │   └── EmptyState.tsx     # Empty state placeholder
│   │   │
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # Main app container layout
│   │   │   ├── DesktopSidebar.tsx # Desktop navigation sidebar
│   │   │   └── MobileNav.tsx      # Mobile bottom navigation
│   │   │
│   │   ├── home/                  # Dashboard components (for future use)
│   │   ├── leaves/                # Leave-specific components
│   │   ├── chat/                  # Chat-specific components
│   │   ├── people/                # People directory components
│   │   └── hr/                    # HR admin components
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx        # Firebase Auth state & methods
│   │
│   ├── hooks/
│   │   └── useRole.ts             # Role checking & permissions hook
│   │
│   ├── lib/
│   │   ├── firebase.ts            # Firebase config & initialization
│   │   ├── types.ts               # TypeScript interfaces & types
│   │   ├── constants.ts           # App-wide constants & config
│   │   │
│   │   ├── services/
│   │   │   ├── userService.ts     # User CRUD operations
│   │   │   ├── leaveService.ts    # Leave application & approval
│   │   │   └── chatService.ts     # Messaging & channels
│   │   │
│   │   └── utils/
│   │       ├── formatters.ts      # Date, string formatting utilities
│   │       └── cn.ts             # Classname merging utility
│   │
│   └── contexts/
│       └── AuthContext.tsx        # Global auth state provider
│
├── Configuration Files
│   ├── tsconfig.json              # TypeScript configuration
│   ├── next.config.js             # Next.js configuration
│   ├── tailwind.config.ts          # Tailwind CSS configuration
│   ├── postcss.config.js           # PostCSS configuration
│   ├── .eslintrc.json              # ESLint rules
│   ├── .gitignore                  # Git ignore patterns
│   └── package.json                # Dependencies & scripts
│
├── Environment & Docs
│   ├── .env.example                # Environment variables template
│   ├── README.md                   # Complete project documentation
│   └── PROJECT_STRUCTURE.md        # This file
```

---

## Key Files & Their Purposes

### Authentication & Context
- **AuthContext.tsx** - Firebase authentication state, domain validation, user profile sync
- **useRole.ts** - Role-based permission checking hook

### Pages (Server Components + Client)
- **login/page.tsx** - Google OAuth login with @shipcube.com domain validation
- **home/page.tsx** - Dashboard with time-based greeting, stats, quick actions
- **leaves/page.tsx** - Leave applications, history, and HR approval workflow
- **chat/page.tsx** - Real-time messaging with channels and direct messages
- **people/page.tsx** - Employee directory with search and department filtering

### Layout Components
- **AppShell.tsx** - Main layout wrapper with sidebar/mobile nav
- **DesktopSidebar.tsx** - Desktop navigation (60% width) with user card
- **MobileNav.tsx** - Mobile fixed bottom navigation with badge support

### UI Components Library
- **Button.tsx** - Variants: default, primary (yellow), secondary, ghost, danger, success
- **Card.tsx** - Container with header, content, footer subcomponents
- **Badge.tsx** - Status indicators (default, primary, secondary, success, danger, warning)
- **Avatar.tsx** - User avatars with initials fallback and online indicator
- **EmptyState.tsx** - Placeholder states with icon, title, description, action

### Firebase Services
- **userService.ts** - Create, read, update user profiles; search; team management
- **leaveService.ts** - Apply, approve, reject leaves; balance tracking; conflict detection
- **chatService.ts** - Create channels, send messages, edit, delete, reactions

### Configuration & Constants
- **firebase.ts** - Firebase SDK initialization with environment variables
- **types.ts** - TypeScript interfaces for User, Leave, Chat, DashboardStats, etc.
- **constants.ts** - Roles, departments, leave types, status labels, validation rules
- **formatters.ts** - Date/time formatting, department labels, initials generation
- **cn.ts** - Class name utility for Tailwind merging

### Styling
- **globals.css** - Tailwind directives, custom animations, utilities
- **tailwind.config.ts** - Custom colors (navy, yellow), font family extensions
- **postcss.config.js** - Tailwind and autoprefixer processing

---

## Technology Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 3** - Utility-first CSS
- **Lucide React** - Icon library

### Backend & Database
- **Firebase Auth** - Google OAuth authentication
- **Cloud Firestore** - Real-time NoSQL database
- **Firebase Storage** - File storage (future use)

### Developer Tools
- **ESLint** - Code quality
- **TypeScript** - Type checking
- **Tailwind CSS** - Design system

### UI Patterns & Libraries
- **CVA** (class-variance-authority) - Component variant system
- **clsx** - Classname utilities
- **tailwind-merge** - Merge Tailwind classes
- **react-hot-toast** - Toast notifications
- **React Context API** - State management

---

## Data Models (Firestore Collections)

### users
```typescript
{
  uid: string
  email: string
  name: string
  photoURL?: string
  department: string
  role: string
  joinedAt: Timestamp
  lastActiveAt?: Timestamp
  isActive: boolean
}
```

### leaves
```typescript
{
  id: string
  userId: string
  userName: string
  type: string
  startDate: Timestamp
  endDate: Timestamp
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approvedBy?: string
  approvedAt?: Timestamp
  rejectionReason?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### leave_balances
```typescript
{
  userId: string
  year: number
  casual: { allocated, used, pending, available }
  medical: { allocated, used, pending, available }
  earned: { allocated, used, pending, available }
  updatedAt: Timestamp
}
```

### chat_channels
```typescript
{
  id: string
  name: string
  description?: string
  type: 'direct' | 'team' | 'general' | 'project'
  members: string[]
  createdBy: string
  createdAt: Timestamp
  lastMessageAt?: Timestamp
  archived: boolean
}
```

### chat_messages
```typescript
{
  id: string
  channelId: string
  userId: string
  userName: string
  content: string
  mentions: string[]
  attachments: Attachment[]
  reactions: Record<string, string[]>
  createdAt: Timestamp
  isEdited: boolean
  repliesCount: number
}
```

---

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Create .env.local from .env.example
   - Add Firebase project credentials
   - Enable Google Auth in Firebase Console
   - Create Firestore collections

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

---

## Features Implemented

### ✅ Authentication
- Google OAuth login
- @shipcube.com domain restriction
- Automatic user profile creation
- Session persistence

### ✅ Dashboard
- Time-based greeting (morning/afternoon/evening)
- Team stats (on leave, pending approvals)
- Quick action cards
- Upcoming birthdays
- Announcements preview

### ✅ Leave Management
- Apply for leave (multiple types)
- View leave history
- Leave balance tracking (casual, medical, earned)
- HR approval workflow
- Leave conflict detection

### ✅ Chat
- Channel-based messaging
- Direct messages
- Message editing & deletion
- Emoji reactions
- File attachments (UI ready)

### ✅ People Directory
- Employee search by name/email
- Department filtering
- Contact information display
- Send message integration
- Role badges

### ✅ Navigation
- Desktop sidebar (60% width)
- Mobile bottom navigation
- Active route highlighting
- Breadcrumb support (ready)

### ✅ UI/UX
- Responsive design (mobile-first)
- Brand-consistent colors (navy/yellow)
- Loading states & skeletons
- Empty states
- Toast notifications
- PWA ready

---

## Future Enhancements

- [ ] Advanced analytics dashboard
- [ ] Expense/reimbursement tracking
- [ ] Performance reviews
- [ ] Learning & development module
- [ ] Payroll integration
- [ ] Mobile app (React Native)
- [ ] Slack/Teams integration
- [ ] Calendar sync (Google Calendar)
- [ ] Video call integration (Zoom/Meet)
- [ ] File collaboration (Drive integration)

---

## Notes for Developers

### Adding New Pages
1. Create folder in `src/app/app/[feature]/`
2. Add `page.tsx` with 'use client' directive
3. Import components and services
4. Add to navigation in MobileNav/DesktopSidebar

### Adding New Components
1. Create in appropriate folder under `src/components/`
2. Export from index.tsx
3. Use TypeScript interfaces
4. Follow Tailwind + Lucide patterns

### Adding New Services
1. Create in `src/lib/services/`
2. Use class-based singleton pattern
3. Add error handling and toast notifications
4. Export service instance

### Styling Guidelines
- Use Tailwind utility classes (no inline styles)
- Custom colors defined in tailwind.config.ts
- Mobile-first responsive design
- Focus states for accessibility

---

## File Statistics

- **Total Files:** 35+
- **TypeScript/TSX Files:** 25+
- **Configuration Files:** 7
- **Documentation:** 2
- **Total Lines of Code:** 4,500+

---

Generated for SHIPMATE v1.0.0
Shipcube Inc. © 2026

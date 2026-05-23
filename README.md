# WhatsApp Blast Management - Frontend

React + Vite frontend with real-time SSE integration.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Start Development Server

```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Features

- **Real-Time Updates**: Live campaign progress via SSE
- **Session Health Monitoring**: Real-time health scores
- **Campaign Management**: Create, monitor, control campaigns
- **Authentication**: JWT-based with role-based access
- **Responsive Design**: Works on desktop and mobile

## Project Structure

```
src/
├── components/
│   ├── auth/          # Login component
│   ├── layout/        # Layout, Sidebar, ProtectedRoute
│   ├── dashboard/     # Dashboard, LiveProgress, SessionHealthCard
│   └── campaigns/     # CampaignList, CampaignDetail
├── hooks/
│   ├── useAuth.js     # Authentication hook
│   └── useRealtime.js # SSE hooks
├── services/
│   ├── api.js         # API client (axios)
│   └── supabase.js    # Supabase client
├── store/
│   ├── authStore.js   # Auth state (Zustand)
│   └── realtimeStore.js # Realtime state
├── styles/
│   └── index.css      # Tailwind CSS
├── App.jsx            # Main app with routing
└── main.jsx           # Entry point
```

## Key Components

### Dashboard
- System overview statistics
- Session health cards
- Recent events feed
- Real-time updates

### LiveProgress
- Real-time campaign progress bar
- Sent/Failed/Queued counters
- Success rate calculation
- Auto-updating via SSE

### CampaignList
- All campaigns with filtering
- Progress visualization
- Status badges
- Quick actions

### CampaignDetail
- Full campaign view
- Live progress tracking
- Start/Pause/Resume controls
- Message template preview

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Build

```bash
npm run build
```

Output will be in `dist/` directory.

## Environment Variables

- `VITE_API_URL` - Backend API URL
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **React Router** - Routing
- **Axios** - HTTP client
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **EventSource** - SSE client

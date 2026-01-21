# Frontend Dashboard Guidelines

This file provides guidance for Claude Code when working with the SecondMe frontend.

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js 16 App Router
│   │   ├── layout.tsx          # Root layout with metadata
│   │   ├── page.tsx            # Dashboard home
│   │   ├── error.tsx           # Error boundary
│   │   ├── not-found.tsx       # 404 page
│   │   ├── auth/page.tsx       # QR code authentication
│   │   ├── contacts/           # Contact management
│   │   │   ├── page.tsx        # Contacts list
│   │   │   └── [id]/page.tsx   # Contact detail
│   │   ├── persona/page.tsx    # Persona editor
│   │   ├── offline/page.tsx    # Offline fallback
│   │   └── api/                # Route handlers
│   │       ├── health/route.ts
│   │       ├── pause/route.ts
│   │       ├── kill-switch/route.ts
│   │       ├── contacts/route.ts
│   │       ├── persona/route.ts
│   │       ├── metrics/route.ts
│   │       ├── settings/route.ts
│   │       └── session/route.ts
│   ├── components/             # React components
│   │   ├── ui/                 # Base UI components
│   │   │   ├── Avatar.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   └── Toast.tsx
│   │   ├── BotStatus.tsx
│   │   ├── KillSwitch.tsx
│   │   ├── QRCodeDisplay.tsx
│   │   ├── ContactList.tsx
│   │   ├── ConversationThread.tsx
│   │   ├── PersonaEditor.tsx
│   │   ├── SleepHoursConfig.tsx
│   │   ├── MetricsDisplay.tsx
│   │   ├── ActivityLog.tsx
│   │   ├── Navigation.tsx
│   │   └── SessionExpiryCountdown.tsx
│   ├── contexts/
│   │   └── ToastContext.tsx    # Toast notifications
│   ├── lib/
│   │   ├── socket.ts           # Socket.io client singleton
│   │   └── redis-client.ts     # Server-side Redis client
│   └── styles/
│       └── globals.css         # Tailwind imports
├── server.ts                   # Custom server with Socket.io
├── next.config.js              # Next.js configuration
├── tailwind.config.js          # Tailwind CSS 4.1.18
└── tsconfig.json               # TypeScript config
```

## Next.js 16 Patterns

### Async Route Parameters
```typescript
// ✅ Correct - Next.js 16 requires await
export default async function ContactPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  return <ContactDetail contactId={id} />;
}

// ❌ Wrong - will cause runtime errors
export default function ContactPage({ params }: { params: { id: string } }) {
  const id = params.id; // Error!
}
```

### Server Components (Default)
```typescript
// Server Component - can use async/await directly
export default async function ContactsPage() {
  const contacts = await fetchContacts();
  return <ContactList contacts={contacts} />;
}
```

### Client Components
```typescript
'use client';

import { useState, useEffect } from 'react';
import { socket } from '@/lib/socket';

export function KillSwitch() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    socket.on('kill-switch:status', setIsActive);
    return () => { socket.off('kill-switch:status'); };
  }, []);

  return <button onClick={handleToggle}>...</button>;
}
```

### API Route Handlers
```typescript
// app/api/pause/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';

export async function POST(request: NextRequest) {
  const { contactId, reason } = await request.json();
  await redis.setex(`PAUSE:${contactId}`, 3600, reason);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get('contactId');
  await redis.del(`PAUSE:${contactId}`);
  return NextResponse.json({ success: true });
}
```

## React 19 Patterns

### useRef Requires Argument
```typescript
// ✅ Correct - React 19 requires initial value
const canvasRef = useRef<HTMLCanvasElement>(null);
const timerRef = useRef<NodeJS.Timeout>(null);

// ❌ Wrong - will cause TypeScript errors
const ref = useRef();
```

### Component Pattern
```typescript
'use client';

interface Props {
  contactId: string;
  onPause: () => void;
}

export function ContactCard({ contactId, onPause }: Props) {
  const [isPaused, setIsPaused] = useState(false);

  const handlePause = async () => {
    await fetch('/api/pause', {
      method: 'POST',
      body: JSON.stringify({ contactId })
    });
    setIsPaused(true);
    onPause();
  };

  return (
    <div className="rounded-lg border p-4">
      {/* ... */}
    </div>
  );
}
```

## Socket.io Integration

### Client Singleton
```typescript
// lib/socket.ts
import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

export const socket: Socket = io(GATEWAY_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000
});
```

### Event Subscription Pattern
```typescript
'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

export function BotStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    socket.connect();

    socket.on('whatsapp:connected', () => setStatus('connected'));
    socket.on('whatsapp:disconnected', () => setStatus('disconnected'));

    return () => {
      socket.off('whatsapp:connected');
      socket.off('whatsapp:disconnected');
    };
  }, []);

  return <StatusIndicator status={status} />;
}
```

### Socket Events
| Event | Direction | Payload |
|-------|-----------|---------|
| `whatsapp:qr` | Server → Client | `{ qr: string }` |
| `whatsapp:connected` | Server → Client | `{ session: string }` |
| `whatsapp:disconnected` | Server → Client | `{ reason: string }` |
| `message:received` | Server → Client | `{ contactId, message }` |
| `message:sent` | Server → Client | `{ contactId, message }` |
| `pause:updated` | Server → Client | `{ contactId, isPaused }` |
| `kill-switch:status` | Server → Client | `boolean` |

## Tailwind CSS Patterns

### Custom Theme
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { /* custom palette */ },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444'
      }
    }
  }
};
```

### Component Styling
```typescript
// Use className composition
<div className="flex items-center gap-4 rounded-lg border bg-white p-4 shadow-sm">
  <StatusIndicator status={status} />
  <span className="text-sm font-medium text-gray-700">{label}</span>
</div>
```

## API Routes Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/pause` | POST | Pause contact |
| `/api/pause?contactId={id}` | DELETE | Resume contact |
| `/api/pause?contactId={id}` | GET | Check pause status |
| `/api/kill-switch` | POST | Enable global pause |
| `/api/kill-switch` | DELETE | Disable global pause |
| `/api/kill-switch` | GET | Check kill switch status |
| `/api/contacts` | GET | List all contacts |
| `/api/contacts/refresh` | POST | Refresh contacts from WhatsApp |
| `/api/persona` | GET | List personas |
| `/api/persona` | POST | Create persona |
| `/api/persona/[id]` | PUT | Update persona |
| `/api/settings` | GET/PUT | Bot settings |
| `/api/metrics` | GET | Performance metrics |
| `/api/session` | GET | Session info |

## Component Categories

### UI Components (`components/ui/`)
Base-level, reusable components:
- `Avatar` - User/contact avatars
- `EmptyState` - Empty list placeholders
- `Skeleton` - Loading skeletons
- `StatusIndicator` - Connection/status dots
- `Toast` - Notification toasts

### Feature Components (`components/`)
Domain-specific components:
- `BotStatus` - WhatsApp connection status
- `KillSwitch` - Global pause toggle
- `QRCodeDisplay` - QR code canvas renderer
- `ContactList` - Contact management list
- `ConversationThread` - Chat history display
- `PersonaEditor` - Persona configuration
- `SleepHoursConfig` - Sleep hours settings
- `MetricsDisplay` - Performance dashboard
- `ActivityLog` - Recent activity feed

## Testing

```bash
# Unit tests
npm run test -w frontend

# E2E tests
npm run test:e2e

# Type checking
npm run type-check -w frontend
```

## Development

```bash
# Start frontend only
npm run dev -w frontend

# Build
npm run build -w frontend

# Start production server
npm run start -w frontend
```

## Custom Server

The frontend uses a custom server (`server.ts`) to integrate Socket.io with Next.js:
- Serves Next.js pages
- Proxies Socket.io connections to Gateway
- Handles health checks at `/api/health`

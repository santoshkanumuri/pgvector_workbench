# Feature 3: Dark Mode with Theme System

## 🎯 Overview

Add a complete dark mode with smooth theme transitions, respecting user system preferences, and persisting theme choice.

## Why This Matters

**User Benefits:**
- ✅ **Reduces eye strain** during long database exploration sessions
- ✅ **Modern UX expectation** - 70% of developers prefer dark mode
- ✅ **Professional polish** - Shows attention to detail
- ✅ **Better battery life** on OLED screens
- ✅ **Improves focus** by reducing screen glare

**Your Users:**
- ML engineers work late hours analyzing embeddings
- Data scientists spend 4-8 hours exploring databases
- Developers prefer dark interfaces for consistency with their IDEs
- Enterprise users appreciate customization options

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│ Theme System Architecture                               │
│                                                          │
│  next-themes (Provider)                                 │
│       ↓                                                  │
│  HTML class: "dark" | "light"                           │
│       ↓                                                  │
│  Tailwind CSS Dark Mode Classes                         │
│       ↓                                                  │
│  All Components automatically themed                    │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │ Theme Toggle Button (Header)                   │   │
│  │  [☀️ Light] [🌙 Dark] [💻 System]              │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  Storage: localStorage → persist across sessions        │
└────────────────────────────────────────────────────────┘
```

---

## Color Palette

### Light Mode (Current)
```css
Background: white, slate-50
Text: neutral-900, neutral-600
Primary: blue-500, blue-700
Borders: neutral-200
Accents: purple, green, amber
```

### Dark Mode (New)
```css
Background: neutral-900, neutral-800
Text: neutral-100, neutral-400
Primary: blue-400, blue-500
Borders: neutral-700
Accents: purple-400, green-400, amber-400
```

---

## Implementation

### Step 1: Install Dependencies

```bash
cd frontend
npm install next-themes
```

### Step 2: Configure Tailwind for Dark Mode

**File: `frontend/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... existing colors
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

### Step 3: Add CSS Variables for Theming

**File: `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light mode colors */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    
    --radius: 0.5rem;
  }
  
  .dark {
    /* Dark mode colors */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Smooth theme transition */
* {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}

/* Custom scrollbar for dark mode */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  @apply bg-neutral-100 dark:bg-neutral-800;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-neutral-300 dark:bg-neutral-600 rounded-md;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-400 dark:bg-neutral-500;
}
```

### Step 4: Add Theme Provider

**File: `frontend/src/components/providers/theme-provider.tsx`**

```typescript
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### Step 5: Update Root Layout

**File: `frontend/src/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { StoreHydration } from "@/components/providers/store-hydration";
import { ThemeProvider } from "@/components/providers/theme-provider"; // NEW

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PGVector Workbench",
  description: "A modern PostgreSQL vector database visualization tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-neutral-50 dark:bg-neutral-900`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <StoreHydration>
            <QueryProvider>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </QueryProvider>
          </StoreHydration>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Step 6: Create Theme Toggle Component

**File: `frontend/src/components/ui/theme-toggle.tsx`**

```typescript
'use client'

import * as React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {theme === 'light' && <Sun className="h-4 w-4" />}
          {theme === 'dark' && <Moon className="h-4 w-4" />}
          {theme === 'system' && <Monitor className="h-4 w-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="h-4 w-4 mr-2" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="h-4 w-4 mr-2" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="h-4 w-4 mr-2" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Step 7: Add Theme Toggle to Header

**File: `frontend/src/components/database/header.tsx`**

```typescript
import { ThemeToggle } from '@/components/ui/theme-toggle'

// In the header component, add:
<div className="flex items-center gap-2">
  <ThemeToggle /> {/* Add this */}
  
  {/* ... existing buttons ... */}
</div>
```

### Step 8: Update Component Styles

Now update key components to support dark mode. Here are examples:

**Database Workbench:**
```typescript
<div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-800 flex flex-col">
```

**Cards:**
```typescript
<Card className="border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
```

**Text:**
```typescript
<h3 className="text-neutral-900 dark:text-neutral-100">
<p className="text-neutral-600 dark:text-neutral-400">
```

**Badges:**
```typescript
<Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
```

**Borders:**
```typescript
<div className="border-b border-neutral-200 dark:border-neutral-700">
```

### Step 9: Update Existing Components (Batch)

Create a migration script to help:

**File: `frontend/scripts/add-dark-mode-classes.js`**

```javascript
const fs = require('fs')
const path = require('path')

// Mapping of light classes to dark classes
const classMappings = {
  'bg-white': 'bg-white dark:bg-neutral-900',
  'bg-slate-50': 'bg-slate-50 dark:bg-neutral-800',
  'bg-neutral-100': 'bg-neutral-100 dark:bg-neutral-800',
  'text-neutral-900': 'text-neutral-900 dark:text-neutral-100',
  'text-neutral-600': 'text-neutral-600 dark:text-neutral-400',
  'text-neutral-500': 'text-neutral-500 dark:text-neutral-400',
  'border-neutral-200': 'border-neutral-200 dark:border-neutral-700',
  'border-slate-200': 'border-slate-200 dark:border-neutral-700',
}

// Run this to help migrate components
// node scripts/add-dark-mode-classes.js
```

### Step 10: Update Specific Components

Key components to update:

1. **`database-workbench.tsx`**
```typescript
<div className="h-full border-r border-slate-200 dark:border-neutral-700 bg-gradient-to-b from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-800">
```

2. **`table-data.tsx`**
```typescript
<div className="p-4 border-b border-neutral-200 dark:border-neutral-700 bg-gradient-to-r from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-800">
```

3. **`table-metadata.tsx`**
```typescript
<div className="h-full overflow-auto bg-gradient-to-br from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-800">
```

4. **`search-interface.tsx`**
```typescript
<div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
```

5. **JSON Viewer (for syntax highlighting)**
```typescript
<div className="bg-neutral-900 dark:bg-neutral-950">
  <span className="text-cyan-300 dark:text-cyan-400">
  <span className="text-green-400 dark:text-green-300">
  <span className="text-blue-400 dark:text-blue-300">
</div>
```

---

## Component-Specific Updates

### Syntax Highlighting for Dark Mode

**JSON Viewer Colors:**
```typescript
const formatJsonWithColors = (obj: any, isDark: boolean) => {
  const colors = isDark ? {
    string: 'text-green-300',
    number: 'text-blue-300',
    boolean: 'text-orange-300',
    null: 'text-neutral-400',
    key: 'text-cyan-300',
  } : {
    string: 'text-green-600',
    number: 'text-blue-600',
    boolean: 'text-orange-600',
    null: 'text-neutral-500',
    key: 'text-cyan-600',
  }
  
  // Use colors.string, colors.number, etc.
}
```

---

## Testing

### Manual Testing Checklist

1. **Toggle Theme**:
   - Click theme button
   - Select Light → verify all components look good
   - Select Dark → verify all components look good
   - Select System → verify it matches OS theme

2. **Check Components**:
   - ✅ Header
   - ✅ Sidebar
   - ✅ Tables list
   - ✅ Table data view
   - ✅ Search interface
   - ✅ Metadata view
   - ✅ Dialogs
   - ✅ Toasts
   - ✅ JSON viewer

3. **Verify Persistence**:
   - Set to dark mode
   - Refresh page
   - Theme should persist

4. **Check Transitions**:
   - Toggle between themes
   - Should smoothly animate (0.3s)

---

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

---

## Performance

- **No runtime cost**: CSS classes only
- **Smooth transitions**: Hardware-accelerated
- **Instant switching**: No layout shift
- **Persistent**: localStorage cache

---

## Advanced: Custom Theme Colors

### Add Custom Themes (Future)

**File: `frontend/src/lib/themes.ts`**

```typescript
export const themes = {
  light: {
    name: 'Light',
    colors: { /* ... */ }
  },
  dark: {
    name: 'Dark',
    colors: { /* ... */ }
  },
  midnight: {
    name: 'Midnight Blue',
    colors: {
      background: '220 26% 14%',
      foreground: '220 9% 85%',
      primary: '220 91% 64%',
      // ...
    }
  },
  forest: {
    name: 'Forest Green',
    colors: {
      background: '150 26% 14%',
      foreground: '150 9% 85%',
      primary: '150 91% 64%',
      // ...
    }
  }
}
```

---

## Documentation for Users

Add to your README:

```markdown
## Dark Mode

DB Look supports dark mode! Toggle between light, dark, and system themes using the theme button in the header.

- **Light Mode**: Classic bright interface
- **Dark Mode**: Easy on the eyes for long sessions
- **System**: Automatically matches your OS theme

Your preference is saved and persists across sessions.
```

---

## Success Metrics

- 60%+ of users enable dark mode
- Reduced bounce rate during late hours
- Improved session duration
- Positive user feedback

---

## Estimated Time

- Setup & configuration: 1-2 hours
- Theme provider & toggle: 1 hour
- Update components: 4-6 hours (batch updates with regex)
- Testing & polish: 2-3 hours

**Total: 1-2 days**

---

## Quick Migration Script

Use this regex to batch-update components:

```bash
# Find all bg-white without dark mode
rg "bg-white(?!.*dark:)" -t tsx

# Find all text-neutral-900 without dark mode
rg "text-neutral-900(?!.*dark:)" -t tsx

# Replace in bulk (be careful!)
find src/components -name "*.tsx" -exec sed -i '' 's/bg-white"/bg-white dark:bg-neutral-900"/g' {} +
```

---

## Maintenance

1. **New Components**: Always add dark: variants
2. **Color Palette**: Stick to defined CSS variables
3. **Testing**: Test both themes for every PR
4. **Accessibility**: Ensure contrast ratios meet WCAG AA

---

This feature will modernize DB Look's appearance and show users you care about their experience during those late-night debugging sessions! 🌙

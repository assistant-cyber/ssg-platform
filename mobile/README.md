# SSG Field — React Native Mobile App

Field assessment app for Scottish Stained Glass technicians.

## Requirements

- Node.js 18+
- Expo CLI: `npm install -g expo-cli` (or just use `npx expo`)
- Expo Go app on your iPhone/Android for instant testing

## Setup

```bash
cd ~/Desktop/ssg-platform/mobile

# Install dependencies
npm install

# Copy env and set your backend URL
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_URL to your Mac's LAN IP:
#   EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000
# Find your IP with: ifconfig | grep "inet " | grep -v 127.0.0.1

# Start the backend first (in another terminal)
cd ../backend && .venv/bin/uvicorn main:app --host 0.0.0.0 --reload

# Start the app
npx expo start
```

Scan the QR code with **Expo Go** (iOS) or the **Camera app** (Android).

## Finding Your Local IP

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# Look for something like 192.168.1.42
```

Set `EXPO_PUBLIC_API_URL=http://192.168.1.42:8000` in your `.env`.

The backend must be started with `--host 0.0.0.0` so it listens on the network:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Login

Default PIN: **0000**

## Screens

| Screen | Path | Description |
|---|---|---|
| Auth | `(auth)/` | PIN keypad entry |
| Project List | `(app)/` | All projects + create FAB |
| New Project | `(app)/new-project` | Create project form |
| Project Detail | `(app)/[id]/` | Photos list + camera button |
| Camera | `(app)/[id]/camera` | Full-screen camera + notes |
| Photo Review | `(app)/[id]/photo/[photoId]` | Edit/delete a photo |
| Finish | `(app)/[id]/finish` | Confirmation + sync |

## Shorthand Notation (from field)

Type in the **Window notes** field on camera screen:

```
1A w2 l1 b0 61pc 30x36
```

| Token | Meaning |
|---|---|
| `1A` | Window 1, Panel A (put first) |
| `1` | Window 1 overall (no panel letter) |
| `w0–w5` | Warping severity (0=none) |
| `l0–l5` | Lead deterioration severity |
| `b0–b9` | Glass break count |
| `rot` | Wood rot present |
| `p` | Failing paint/caulk |
| `61pc` | Number of glass pieces |
| `30x36` | Panel width × height (inches) |
| `ov48x96` | Overall window dimensions |

**Severity:** 0–1 = Good · 2 = Fair · 3–5 = Poor

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Configure (first time only)
eas build:configure

# Build iOS
eas build --platform ios

# Build Android
eas build --platform android
```

## Project Structure

```
mobile/
├── app/
│   ├── _layout.tsx          Root layout + AuthProvider
│   ├── index.tsx            Auth redirect
│   ├── (auth)/
│   │   └── index.tsx        PIN login screen
│   └── (app)/
│       ├── _layout.tsx      Authenticated stack (SSG green header)
│       ├── index.tsx        Project list
│       ├── new-project.tsx  Create project
│       └── [id]/
│           ├── index.tsx    Project detail (field mode)
│           ├── camera.tsx   Camera + shorthand notes
│           ├── finish.tsx   Sync + complete
│           └── photo/
│               └── [photoId].tsx  Photo review + edit
├── components/
│   ├── ProjectCard.tsx
│   ├── PhotoThumbnail.tsx
│   └── ShorthandHint.tsx    Collapsible notation reference
├── constants/
│   └── Colors.ts            SSG brand palette
├── context/
│   └── AuthContext.tsx      JWT auth + SecureStore
└── services/
    └── api.ts               Backend API client
```

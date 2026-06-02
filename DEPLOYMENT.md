# SSG Platform — Deployment Guide

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Mobile App    │     │  Web Dashboard   │     │ Customer Portal  │
│  (Expo/RN)      │────▶│  (Next.js)       │────▶│  /portal/[id]    │
│  iOS + Android  │     │  Vercel          │     │  same Next.js    │
└─────────────────┘     └──────────────────┘     └──────────────────┘
         │                       │                        │
         └───────────────────────┴────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    FastAPI Backend       │
                    │    Railway              │
                    │    PostgreSQL (Railway) │
                    │    File Storage (S3 or │
                    │    Railway volumes)     │
                    └─────────────────────────┘
```

---

## 1. Backend — Railway

### Initial Setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project (from backend directory)
cd ~/Desktop/ssg-platform/backend
railway init

# Add PostgreSQL addon in Railway dashboard, then link
railway link
```

### Environment Variables (set in Railway dashboard)

| Variable                  | Value                                         | Required |
|---------------------------|-----------------------------------------------|----------|
| `SECRET_KEY`              | `openssl rand -hex 32`                        | ✅ |
| `DATABASE_URL`            | Auto-set by Railway PostgreSQL addon          | ✅ |
| `STORAGE_TYPE`            | `s3` (for production) or `local` (dev)        | ✅ |
| `AWS_ACCESS_KEY_ID`       | Your S3/Supabase key                          | If S3 |
| `AWS_SECRET_ACCESS_KEY`   | Your S3/Supabase secret                       | If S3 |
| `AWS_BUCKET_NAME`         | `ssg-platform-photos`                         | If S3 |
| `AWS_REGION`              | `us-east-1` (or your region)                  | If S3 |
| `AWS_ENDPOINT_URL`        | Supabase: `https://<project>.supabase.co/storage/v1/s3` | If Supabase |
| `REPORTS_OUTPUT_PATH`     | `/tmp/reports` (Railway ephemeral)            | ✅ |
| `ANTHROPIC_API_KEY`       | `sk-ant-...` (optional — for AI parsing mode) | ❌ |
| `DEBUG`                   | `false`                                       | ✅ |

### Deploy

```bash
cd ~/Desktop/ssg-platform/backend
railway up
```

### After Deploy

1. Open Railway dashboard → your service → shell
2. Run: `python seed.py`
3. This creates the initial staff user with PIN `0000`
4. **Change the PIN immediately** via the API or directly in the database

### Database: Supabase (Alternative to Railway PostgreSQL)

```bash
# In Railway env vars, set:
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
```

Supabase free tier: 500MB database, perfect for SSG scale.

---

## 2. Web Dashboard — Vercel

### Setup

```bash
# Install Vercel CLI
npm install -g vercel

cd ~/Desktop/ssg-platform/dashboard
vercel

# Follow prompts, then set env vars:
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://your-railway-app.railway.app
```

### Environment Variables (Vercel dashboard)

| Variable               | Value                                    |
|------------------------|------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | `https://your-railway-app.railway.app`   |

### Deploy

```bash
vercel --prod
```

Dashboard will be live at `https://your-app.vercel.app`

---

## 3. Mobile App — EAS Build (Expo)

### Prerequisites

```bash
npm install -g eas-cli
eas login  # login with your Expo account
```

### Configure

```bash
cd ~/Desktop/ssg-platform/mobile

# Set your production API URL
echo "EXPO_PUBLIC_API_URL=https://your-railway-app.railway.app" > .env
```

### Create `eas.json`

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "env": { "EXPO_PUBLIC_API_URL": "https://your-railway-app.railway.app" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://your-railway-app.railway.app" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your@apple.com", "ascAppId": "1234567890" },
      "android": { "serviceAccountKeyPath": "./google-service-account.json" }
    }
  }
}
```

### Build for TestFlight (iOS)

```bash
eas build --platform ios --profile preview
# After build, submit to TestFlight:
eas submit --platform ios
```

### Build for Internal Testing (Android)

```bash
eas build --platform android --profile preview
# Download APK and install on test devices
```

### For instant testing (Expo Go)

```bash
npx expo start
# Scan QR with Expo Go app — no build needed for dev testing
```

---

## 4. Storage — Supabase Storage (Recommended)

Supabase Storage is S3-compatible and pairs perfectly with your PostgreSQL.

### Setup

1. Create a Supabase project at supabase.com
2. Go to Storage → Create bucket: `ssg-platform`
3. Set bucket to **Private** (photos should not be publicly accessible by default)
4. Go to Settings → API → copy your S3 credentials:
   - Endpoint: `https://<project-ref>.supabase.co/storage/v1/s3`
   - Access Key ID and Secret (under Service Role)

### Backend env vars for Supabase Storage

```env
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=<supabase-s3-key>
AWS_SECRET_ACCESS_KEY=<supabase-s3-secret>
AWS_BUCKET_NAME=ssg-platform
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=https://<project-ref>.supabase.co/storage/v1/s3
```

---

## 5. All Environment Variables — Master Reference

### Backend (`.env` for local / Railway dashboard for production)

```env
# ── Security ──────────────────────────────────────────────────
SECRET_KEY=<openssl rand -hex 32>      # NEVER commit this
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24

# ── Database ──────────────────────────────────────────────────
DATABASE_URL=sqlite:///./ssg.db                          # local dev
# DATABASE_URL=postgresql://user:pass@host:5432/dbname   # production

# ── Storage ───────────────────────────────────────────────────
STORAGE_TYPE=local                         # local | s3
STORAGE_LOCAL_PATH=./uploads               # local dev only
# For S3/Supabase (production):
# STORAGE_TYPE=s3
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_BUCKET_NAME=ssg-platform
# AWS_REGION=us-east-1
# AWS_ENDPOINT_URL=...   # leave blank for AWS S3; set for Supabase/R2

# ── Reports ───────────────────────────────────────────────────
REPORTS_OUTPUT_PATH=./reports    # use /tmp/reports on Railway

# ── Optional ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=               # only needed for AI note parsing mode
DEBUG=false
```

### Web Dashboard (`.env.local` / Vercel)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000   # dev
# NEXT_PUBLIC_API_URL=https://your-app.railway.app   # production
```

### Mobile (`.env` / EAS secrets)

```env
EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000  # dev (your Mac's LAN IP)
# EXPO_PUBLIC_API_URL=https://your-app.railway.app  # production
```

---

## 6. PIN Management

**Initial PIN: `0000` — change before going live.**

To add a new staff user via the API:
```bash
# First login to get a token
TOKEN=$(curl -s -X POST https://your-app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"0000"}' | jq -r '.access_token')

# Create a new staff user with a custom PIN
curl -X POST https://your-app/auth/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Smith","role":"staff","pin":"1234"}'
```

Customer PINs are generated automatically (6 digits) when a project is created.
They appear in: Project detail → Customer Portal tab.

---

## 7. Local Development — Full Stack

```bash
# Terminal 1: Backend
cd ~/Desktop/ssg-platform/backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Dashboard
cd ~/Desktop/ssg-platform/dashboard
cp .env.example .env  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# → http://localhost:3000

# Terminal 3: Mobile (requires physical device or simulator)
cd ~/Desktop/ssg-platform/mobile
cp .env.example .env  # set EXPO_PUBLIC_API_URL to your Mac's LAN IP
npx expo start
# Scan QR with Expo Go

# Find your LAN IP:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## 8. Production Checklist

Before going live:

- [ ] Change default staff PIN from `0000`
- [ ] Set `SECRET_KEY` to a random 32-char hex string
- [ ] Switch `DATABASE_URL` to PostgreSQL
- [ ] Switch `STORAGE_TYPE` to `s3` with real credentials
- [ ] Set `DEBUG=false`
- [ ] Configure CORS in `main.py` — replace `allow_origins=["*"]` with your actual domain
- [ ] Set `REPORTS_OUTPUT_PATH=/tmp/reports` (Railway ephemeral) or an S3 bucket path
- [ ] Test the full flow: create project → upload photos → generate report → estimate → customer accept → proposal
- [ ] Set up HTTPS (Railway and Vercel handle this automatically)
- [ ] Set up a custom domain (optional)

---

## 9. Quick CORS Fix for Production

In `backend/main.py`, replace:
```python
allow_origins=["*"]
```
With:
```python
allow_origins=[
    "https://your-dashboard.vercel.app",
    "https://your-custom-domain.com",
]
```

---

## 10. Recommended Hosting Costs (estimate)

| Service         | Provider  | Cost       | Notes                              |
|-----------------|-----------|------------|------------------------------------|
| Backend         | Railway   | ~$5/mo     | Hobby plan, includes PostgreSQL    |
| Web Dashboard   | Vercel    | Free       | Free tier covers SSG scale easily  |
| File Storage    | Supabase  | Free       | 1GB storage on free tier           |
| Mobile builds   | EAS       | Free       | Free tier: 30 builds/month         |
| **Total**       |           | **~$5/mo** |                                    |

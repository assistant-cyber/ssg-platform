# SSG Platform — Project Index
**Built:** May 15, 2026 | **Client:** Scottish Stained Glass | **Operator:** J Riemer Media

---

## Quick Start

```bash
# 1. Backend
cd ~/Desktop/ssg-platform/backend
.venv/bin/uvicorn main:app --host 0.0.0.0 --reload
# → http://localhost:8000/docs   (Staff PIN: 0000)

# 2. Dashboard
cd ~/Desktop/ssg-platform/dashboard
npm run dev
# → http://localhost:3000

# 3. Mobile
cd ~/Desktop/ssg-platform/mobile
npx expo start
# Scan QR with Expo Go app
```

---

## File Map

```
ssg-platform/
│
├── DEPLOYMENT.md              ← Full deployment guide (Railway + Vercel + EAS)
├── PROJECT_INDEX.md           ← This file
│
├── backend/                   ← FastAPI Python backend
│   ├── main.py                  App entry point
│   ├── seed.py                  Create initial staff user (PIN 0000)
│   ├── requirements.txt
│   ├── Procfile                 Railway deployment
│   ├── railway.json             Railway config
│   ├── .env.example             Environment variable template
│   ├── ssg.db                   SQLite database (local dev)
│   ├── uploads/                 Local photo storage
│   ├── reports/                 Generated PDFs/spreadsheets
│   ├── app/
│   │   ├── models.py            SQLAlchemy DB models
│   │   ├── schemas.py           Pydantic request/response schemas
│   │   ├── security.py          PIN hashing + JWT
│   │   ├── dependencies.py      Auth middleware
│   │   ├── storage.py           File storage (local + S3)
│   │   └── routers/
│   │       ├── auth.py          POST /auth/login
│   │       ├── projects.py      Project CRUD
│   │       ├── photos.py        Photo upload + note parsing
│   │       ├── estimates.py     Estimate builder endpoints
│   │       └── reports.py       Report + proposal generation
│   └── processing/
│       ├── photo_naming.py      Ported from companycam_integration.py
│       ├── condition_sheet.py   Ported from populate_condition_sheet.py
│       ├── report_generator.py  Adapted from beautify_report.py
│       └── proposal_generator.py  New — 7-section branded proposal PDF
│
├── dashboard/                 ← Next.js web dashboard
│   ├── app/
│   │   ├── (auth)/login/        PIN login page
│   │   ├── (dashboard)/
│   │   │   ├── projects/        Project list + detail
│   │   │   └── projects/[id]/   4-tab project detail
│   │   └── portal/[id]/         Customer portal (public, code-auth)
│   ├── components/
│   │   ├── layout/Sidebar.tsx   Responsive sidebar (hamburger on tablet)
│   │   ├── tabs/
│   │   │   ├── PhotosTab.tsx    Photo gallery + modal editor
│   │   │   ├── ReportTab.tsx    Generate report + activity log
│   │   │   ├── EstimateTab.tsx  Estimate editor wrapper
│   │   │   └── CustomerPortalTab.tsx  Portal link + proposal
│   │   └── estimate/
│   │       ├── EstimateEditor.tsx   Full line-item editor with sections
│   │       ├── EstimatePdf.tsx      React PDF document
│   │       └── PdfPreviewModal.tsx  In-browser PDF preview
│   ├── lib/
│   │   ├── api.ts               Typed API client
│   │   ├── auth.ts              localStorage token management
│   │   └── shorthand.ts         Shorthand → plain English translator
│   ├── vercel.json              Vercel deployment config
│   └── .env.example
│
└── mobile/                    ← React Native + Expo mobile app
    ├── app/
    │   ├── (auth)/index.tsx     PIN keypad login
    │   └── (app)/
    │       ├── index.tsx        Project list
    │       ├── new-project.tsx  Create project
    │       └── [id]/
    │           ├── index.tsx    Project detail (field mode)
    │           ├── camera.tsx   Camera + notes + background upload
    │           ├── finish.tsx   Sync/complete screen
    │           └── photo/[photoId].tsx  Photo review + edit
    ├── components/
    │   ├── ProjectCard.tsx
    │   ├── PhotoThumbnail.tsx
    │   └── ShorthandHint.tsx    Collapsible notation cheat sheet
    ├── services/api.ts          API client
    ├── context/AuthContext.tsx  JWT + SecureStore persistence
    └── .env.example
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | PIN login, returns JWT |
| GET | `/projects` | Staff/Customer | List projects |
| POST | `/projects` | Staff | Create project (auto-generates customer code) |
| GET | `/projects/:id` | Staff/Customer | Project detail with photos |
| PATCH | `/projects/:id` | Staff | Update project |
| POST | `/projects/:id/photos` | Staff/Customer | Upload photo + notes |
| PATCH | `/photos/:id` | Staff | Update photo notes |
| DELETE | `/photos/:id` | Staff | Delete photo |
| GET | `/projects/:id/estimate` | Staff/Customer | Get estimate |
| POST | `/projects/:id/estimate` | Staff | Create/replace estimate |
| POST | `/projects/:id/estimate/send` | Staff | Send to customer |
| POST | `/projects/:id/estimate/respond` | Customer | Accept/decline |
| POST | `/projects/:id/generate-report` | Staff | Trigger report generation (async) |
| GET | `/projects/:id/report` | Staff/Customer | Get latest report |
| POST | `/projects/:id/generate-proposal` | Staff | Trigger proposal PDF (async) |
| GET | `/projects/:id/proposal` | Staff/Customer | Get proposal |

---

## Data Model

```
User            id, name, role(staff/customer), pin_hash, linked_project_id
Project         id, name, church_name, address, status, customer_access_code
Photo           id, project_id, storage_url, thumbnail_url, filename, window_number, panel_letter, notes
ConditionData   id, photo_id — parsed shorthand (warping, lead, breaks, rot, etc.)
Estimate        id, project_id, status(draft/sent/accepted/declined), total_amount
EstimateLineItem id, estimate_id, description, quantity, unit, unit_price, total
Report          id, project_id, narrative(JSON), spreadsheet_url, pdf_url
Proposal        id, project_id, estimate_id, pdf_url, status, viewed_by_customer
```

---

## Shorthand Notation (field technicians)

```
Format:  [window][panel] [tokens...]
Example: 1A w2 l1 b0 rot p 61pc 30x36

Tokens:
  1A       Window 1, Panel A
  1        Window 1 overall (no panel)
  w0–w5    Warping (0=none, 5=critical)
  l0–l5    Lead deterioration
  b0+      Glass breaks count
  rot      Wood rot present
  p        Failing paint/caulk
  61pc     Glass piece count
  30x36    Panel W×H inches
  ov48x96  Overall window dimensions

Rubric: 0–1 = Good · 2 = Fair · 3–5 = Poor
```

---

## Brand Colors

| Name | Hex |
|------|-----|
| Primary green | `#83A94B` |
| Dark green | `#5B7A35` |
| Light green bg | `#E8F0DC` |
| Charcoal | `#2C2C2C` |
| Warm gray | `#6B6B6B` |

---

## Source Reference

Original Streamlit automation scripts (do not modify):
`~/Desktop/Assessment Report Automation copy/`

| File | What it does | Status |
|------|-------------|--------|
| `app.py` | Streamlit UI | Reference only — replaced by web dashboard |
| `companycam_integration.py` | CompanyCam API | Naming logic ported to `processing/photo_naming.py` |
| `populate_condition_sheet.py` | Shorthand parser + Excel | Ported to `processing/condition_sheet.py` |
| `beautify_report.py` | ReportLab PDF | Adapted into `processing/report_generator.py` |
| `build_templates.py` | Excel templates | Called by condition sheet |
| `parse_companycam_pdf.py` | PDF parser | No longer needed — CompanyCam replaced |

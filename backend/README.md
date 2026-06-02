# Scottish Stained Glass Platform — Backend

A FastAPI backend for the SSG field assessment, reporting, and customer portal platform.

---

## Requirements

- Python 3.11+
- pip

---

## Setup

### 1. Clone / navigate to the backend directory

```bash
cd ~/Desktop/ssg-platform/backend
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set a strong SECRET_KEY
```

Key settings in `.env`:

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | (change me) | JWT signing secret — use `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DEBUG` | `false` | Enable SQLAlchemy query logging |
| `DATABASE_URL` | `sqlite:///./ssg.db` | SQLite or PostgreSQL URL |
| `STORAGE_TYPE` | `local` | `local` or `s3` |
| `UPLOAD_DIR` | `./uploads` | Local file storage root |
| `S3_BUCKET_NAME` | (blank) | Bucket name for S3/Supabase Storage |
| `S3_REGION` | `us-east-1` | Region for S3-compatible storage |
| `S3_ENDPOINT_URL` | (blank) | Required for Supabase Storage S3 endpoint |
| `REPORTS_OUTPUT_PATH` | `./reports` | Where report/proposal PDFs are written before upload |
| `ANTHROPIC_API_KEY` | (optional) | Required only for AI/hybrid parsing mode |

### 5. Seed the database

```bash
python seed.py
```

This creates an initial staff user with PIN `0000`. **Change the PIN in production.**

### 6. Run the server

```bash
uvicorn main:app --reload --port 8000
```

### 7. Open the API docs

```
http://localhost:8000/docs
```

---

## Authentication

All endpoints (except `POST /login`) require a Bearer JWT token.

**Login:**
```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"code": "0000"}'
```

Response:
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "role": "staff",
  "user_id": "...",
  "name": "Admin"
}
```

Use the token in subsequent requests:
```bash
curl http://localhost:8000/projects \
  -H "Authorization: Bearer <jwt>"
```

---

## Key Workflows

### Create a project
```bash
curl -X POST http://localhost:8000/projects \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "First Baptist 2025",
    "church_name": "First Baptist Church",
    "address_street": "123 Main St",
    "address_city": "Denver",
    "address_state": "CO"
  }'
```
→ Returns project + auto-generated 6-digit customer access code.

### Upload a photo with shorthand notes
```bash
curl -X POST http://localhost:8000/projects/<id>/photos \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@photo.jpg" \
  -F "notes=1A w2 l1 b0 rot 45x60"
```

### Generate a report
```bash
curl -X POST http://localhost:8000/projects/<id>/generate-report \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "narrative": {
      "overview": "...",
      "current_condition": "...",
      "causes": "...",
      "hundred_year_plan": "...",
      "summary": "..."
    },
    "parsing_mode": "shorthand",
    "count_pieces": false,
    "glass_flavor": "stained"
  }'
```
→ Returns immediately (202). Generation runs in background. Poll `GET /projects/<id>/report` for the PDF URL.

---

## Shorthand Notation Reference

Type in the photo notes field when capturing assessments in the field.

| Token | Meaning | Example |
|---|---|---|
| `1A` | Window 1, Panel A (leading digits = window, letter = panel) | `1A` |
| `1` | Window 1 overall (no panel letter = whole-window photo) | `1` |
| `w0`–`w5` | Warping severity (0=none, 5=critical) | `w2` |
| `l0`–`l5` | Lead deterioration severity | `l1` |
| `b0`–`b999` | Glass break count | `b3` |
| `rot` | Wood rot present (omit if none) | `rot` |
| `p` | Failing paint/caulk (omit if none) | `p` |
| `NNpc` | Number of glass pieces | `61pc` |
| `WxH` | Panel dimensions in inches | `30x36` |
| `ovWxH` | Overall window dimensions | `ov48x96` |

**Full example:** `1A w2 l1 b0 rot p 61pc 30x36 north`

Rubric: 0–1 = Good, 2 = Fair, 3–5 = Poor

---

## Project Structure

```
backend/
├── main.py                    # FastAPI app entry point
├── seed.py                    # Database seed script
├── requirements.txt
├── .env.example
├── README.md
├── app/
│   ├── __init__.py
│   ├── config.py              # Pydantic settings
│   ├── database.py            # SQLAlchemy engine + session
│   ├── models.py              # ORM models (User, Project, Photo, …)
│   ├── schemas.py             # Pydantic v2 request/response schemas
│   ├── security.py            # bcrypt PIN hashing + JWT
│   ├── dependencies.py        # FastAPI dependency functions
│   ├── storage.py             # Local / S3 storage service
│   └── routers/
│       ├── __init__.py
│       ├── auth.py            # POST /login
│       ├── projects.py        # CRUD /projects
│       ├── photos.py          # Photo upload + management
│       ├── estimates.py       # Estimate lifecycle
│       └── reports.py        # Report + proposal generation
└── processing/
    ├── __init__.py
    ├── photo_naming.py        # Auto-filename generation from shorthand
    ├── condition_sheet.py     # Shorthand parser + Excel generator
    ├── report_generator.py    # ReportLab assessment PDF
    └── proposal_generator.py  # ReportLab proposal PDF
```

---

## Running in Production

Use `uvicorn` behind a reverse proxy (nginx recommended):

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

For production:
- Set `DATABASE_URL` to a PostgreSQL URL
- Set `STORAGE_TYPE=s3` and configure S3 credentials
- Generate a strong `SECRET_KEY`
- Disable `DEBUG=false`

## Supabase Setup

Use Supabase for both PostgreSQL and object storage by setting:

```env
DATABASE_URL=postgresql://postgres:password@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
STORAGE_TYPE=s3
S3_BUCKET_NAME=ssg-platform
S3_REGION=us-east-1
S3_ENDPOINT_URL=https://<project-ref>.supabase.co/storage/v1/s3
AWS_ACCESS_KEY_ID=<supabase-s3-key>
AWS_SECRET_ACCESS_KEY=<supabase-s3-secret>
```

The backend now serves all stored assets through `/media/...`, so the app can keep using relative media URLs even when files live in Supabase.

## Migrating Existing Data

After setting your target Supabase env vars, run:

```bash
cd ~/Desktop/ssg-platform/backend
python scripts/migrate_to_supabase.py
```

That copies:
- SQLite records into the configured target database
- Photos and thumbnails into the configured storage bucket
- Report spreadsheets, report PDFs, and proposal PDFs into the configured storage bucket

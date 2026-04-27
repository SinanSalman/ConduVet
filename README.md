# ConduVet

A web application for vetting crowd-sourced tabular data. Admins upload Excel workbooks that carry both the data and its schema; users log in, fill in or correct their assigned records, and submit. Every change is audited, backups run automatically, and the data can be downloaded at any time as a clean Excel file.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup — Docker (recommended)](#setup--docker-recommended)
- [Setup — Local Development](#setup--local-development)
- [First-Run Configuration](#first-run-configuration)
- [Excel File Format](#excel-file-format)
- [Admin Guide](#admin-guide)
- [User Guide](#user-guide)
- [Environment Variables](#environment-variables)
- [Automatic Backups](#automatic-backups)
- [Authentication & Security](#authentication--security)

---

## How It Works

1. The admin uploads a **YAML config** (title, credentials) and a **users CSV** (userid, name, password) on first launch.
2. The admin uploads one or more **Excel workbooks**. Each workbook has a `Data` sheet (the records) and a `Schema` sheet (field definitions, validation rules, help text).
3. Users log in and see the files assigned to them. They open a file, edit their records in a spreadsheet-like grid, and submit.
4. The grid enforces the schema in real time — field types, allowed values, length limits, and conditional requirements.
5. Every submitted change is written to the audit log. The admin can view reports, download the current data as Excel, and re-upload the file to a new instance at any time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI 0.115 |
| Database | PostgreSQL 15, SQLAlchemy 2.x |
| Auth | JWT (OAuth2 password flow) |
| Background jobs | APScheduler 3.10 |
| Excel I/O | openpyxl 3.1 |
| Frontend | React 18, Vite 5 |
| Data grid | AG Grid Community 32 |
| Styling | Tailwind CSS 3 |
| Containerisation | Docker + Docker Compose |

---

## Project Structure

```
Conduvet/
├── backend/
│   ├── main.py                   # FastAPI app, CORS, middleware
│   ├── database.py               # SQLAlchemy engine and session
│   ├── auth/
│   │   ├── jwt.py                # Token creation and verification
│   │   └── ldap_stub.py          # Pluggable auth provider interface
│   ├── models/
│   │   └── db_models.py          # ORM models (6 tables)
│   ├── routers/
│   │   ├── admin.py              # /api/admin/* routes
│   │   ├── auth.py               # /api/auth/login
│   │   └── data.py               # /api/files/* user routes
│   ├── services/
│   │   ├── excel_service.py      # Excel import / export
│   │   ├── backup_service.py     # Scheduled backup jobs
│   │   └── schema_parser.py      # Data type and depends-on parsing
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api.js                # Axios API client
│   │   ├── App.jsx               # Router and layout
│   │   ├── pages/
│   │   │   ├── AdminSetup.jsx
│   │   │   ├── AdminLogin.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── UserLogin.jsx
│   │   │   ├── UserDashboard.jsx
│   │   │   └── DataEntry.jsx     # AG Grid data entry
│   │   ├── components/
│   │   │   ├── ContextPanel.jsx  # Field help + edit history
│   │   │   ├── MultiSelectEditor.jsx  # Custom checkbox grid editor
│   │   │   └── ReportViewer.jsx
│   │   └── utils/
│   │       └── schemaHelpers.js  # Client-side type parsing and validation
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── config.yaml                   # Instance configuration
└── users.csv                     # User credentials
```

---

## Setup — Docker (recommended)

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

### Steps

```bash
# 1. Clone or copy the project
cd /path/to/Conduvet

# 2. Set a strong secret key in docker-compose.yml
#    Change the SECRET_KEY value under the backend service; you could use the output of the below:
python3 -c 'import secrets; print(secrets.token_hex(32))'

# 3. Build and start all services
docker-compose up --build

# 4. Open the app
open http://localhost
```

The first time you open the app you will be redirected to `/admin/setup` to upload your configuration. See [First-Run Configuration](#first-run-configuration).

To stop:
```bash
docker-compose down          # keep data
docker-compose down -v       # also delete the database volume
```

---

## Setup — Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15 running locally

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/conduvet \
SECRET_KEY=dev-secret \
uvicorn main:app --reload --port 8000
```

The API will be at `http://localhost:8000`. Interactive docs are at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend

npm install
npm run dev
```

The dev server will be at `http://localhost:5173` and proxies all `/api` requests to the backend on port 8000.

---

## First-Run Configuration

When the database has no configuration, every page redirects to **Admin Setup** at `/admin/setup`.

### 1. Prepare `config.yaml`

```yaml
title: "My Instance Title"
admin_account: "admin"
admin_pass: "choose-a-strong-password"
users_file: "users.csv"
backup_dir: "./backups"
```

| Key | Description |
|---|---|
| `title` | Shown in the header as **title**. Supports multi-line strings with `\n`. |
| `admin_account` | Username for the admin login at `/admin/login`. |
| `admin_pass` | Admin password. Stored as a bcrypt hash. |
| `users_file` | Path to the users CSV (used as a label; the file is uploaded alongside the YAML). |
| `backup_dir` | Directory where automatic Excel backups are written. Created if it does not exist. |

### 2. Prepare `users.csv`

```
userid,name,password
Z1234,Jane Smith,abc123
Z5678,John Doe,xyz789
```

- `userid` — used as the login username and to match record ownership. Case-insensitive.
- `name` — display name shown after login.
- `password` — stored as a bcrypt hash on upload.

### 3. Upload on the Setup page

Go to `/admin/setup`, upload both files, and click **Save Configuration**. You will be redirected to the admin login.

> The configuration can be updated at any time from the **Configuration** tab in the Admin Dashboard.

---

## Excel File Format

Every workbook uploaded by the admin must contain exactly two sheets.

### Sheet: `Data`

The records to be reviewed. First row is the header. Required system columns:

| Column | Description |
|---|---|
| `Owner` | User ID of the record owner, or `ALL` for all users. Hidden from users. |
| `Last Updated` | Auto-populated on submit. Format: `DD/MM/YYYY HH:MM:SS`. |
| `Record Status` | `New`, `Updated`, `Old`, or `Delete`. Existing records default to `Old` on upload. |

All other columns are defined by the Schema sheet.

### Sheet: `Schema`

One row per data field.

| Column | Description |
|---|---|
| `Field Name` | Must exactly match a column header in the Data sheet. |
| `Description` | Markdown-formatted help text shown in the context panel. |
| `Data Type` | See type syntax below. |
| `Sample Data` | Example value shown to the user. |
| `Depends on` | Conditional requirement rule (see below). |
| `Accept Null Values` | `Yes` or `No`. |

#### Data Type Syntax

| Syntax | Editor |
|---|---|
| `Text (255)` | Text input, max 255 characters |
| `Number (0,100)` | Numeric input, value must be in [0, 100] |
| `List (A,B,C)` | Single-select dropdown |
| `Multiple (A,B,C)` | Multi-select checkbox popup; stored as comma-separated values |
| `Date (DD/MM/YYYY)` | Date picker |
| `Date (DD/MM/YYYY HH:MM:SS)` | Datetime picker |

#### Depends On Syntax

Makes a field conditionally required based on the value of another field. Even if `Accept Null Values` is `Yes`, the field becomes required when the condition is met.

```
FieldName = value
FieldName = value1 or value2
```

Examples:
```
Joint Industry Research Indicator = Y
Type of industry contribution = F or B
```

Multiple conditions can be placed on separate lines; any matching condition makes the field required.

---

## Admin Guide

Access the admin interface at `/admin/login` (link in the top-right corner of every page).

### Files Tab

**Uploading a file**

1. Click **Upload Excel File** or drag a workbook onto the drop zone.
2. The app validates that both sheets exist and that every Schema field matches a Data column.
3. Field-level error messages are shown if validation fails.
4. On success, the file appears in the file list with its record count.

**Managing files**

| Action | Effect |
|---|---|
| **View / Edit** | Opens the AG Grid for that file. Admins see all records (not filtered by owner) and the Owner column is editable. |
| **Download** | Downloads the current state as an Excel workbook (Data + Schema sheets) that can be re-uploaded to any Conduvet instance. |
| **Remove** | Soft-deletes the file (data is retained in the database, the file is removed from the active list). |

### Reports Tab

Select a file, then choose a report type:

| Report | Description |
|---|---|
| By User | Records updated or added, grouped by userid with counts. |
| By Record | Which users touched each record and when. |
| Untouched Records | Records still at `Unvetted` status, grouped by userid. |

Each report renders as a table on screen and can be downloaded as Excel.

### Configuration Tab

Upload a new `config.yaml` to update the title, admin credentials, or backup directory. Optionally upload a new `users.csv` to replace the user list.

---

## User Guide

### Logging In

Go to the app's root URL. Enter your **User ID** and **Password** on the login page and click **Login**.

### Choosing a File

After login you will see one button for each active data file. Click a button to open that file.

### Editing Records

The data entry page shows your assigned records in a spreadsheet grid.

- **Navigate** with Tab, arrow keys, or by clicking a cell.
- **Edit** by double-clicking or pressing Enter on a focused cell.
- **Cell types** — text inputs, number fields, dropdowns (single-select), and checkbox popups (multi-select) are configured automatically from the schema.
- **Red cells** indicate a validation error. Hover over the cell for the error message.

The **context panel** at the bottom of the screen shows:
- **Left** — field description (Markdown) and a sample value.
- **Right** — the edit history for that field: who changed it, when, and what the previous value was.

### Adding a Record

Click **Add Record** to insert a new empty row. The row is owned by your user ID and has status `New`.

### Submitting

Click **Submit** when you are done. Full validation runs before saving. If there are errors, the affected cells are highlighted and you must correct them before the submission is accepted. On success you are returned to the file selection screen.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://conduvet:conduvet@db:5432/conduvet` | PostgreSQL connection string. |
| `SECRET_KEY` | `conduvet-secret-key-change-in-production` | JWT signing key. **Must be changed in production.** |
| `CORS_ORIGINS` | `*` | Comma-separated list of allowed origins, or `*` for all. |

Set these in `docker-compose.yml` (under `backend.environment`) or as shell environment variables for local development.

---

## Automatic Backups

- A backup job runs every **2 hours** for each active data file.
- Each backup is a full Excel export (Data + Schema sheets).
- A maximum of **24 backups per file** are kept. The oldest is deleted when the 25th is written.
- Backup filenames: `{display_name}_{YYYYMMDD_HHMM}.xlsx`
- The backup directory is set via `backup_dir` in `config.yaml` and created automatically if it does not exist.

---

## Authentication & Security

- All routes except `/admin/setup`, `/admin/login`, and `/login` require a valid JWT.
- User tokens expire after **1 hour**; admin tokens after **2 hours**.
- Passwords are stored as **bcrypt hashes**; plaintext is never persisted.
- The authentication logic is behind a pluggable `AuthProvider` interface (`backend/auth/ldap_stub.py`). The default implementation checks bcrypt hashes against the database. To switch to LDAP or SAML, implement `LDAPAuthProvider(AuthProvider)` and replace `auth_provider` — no other code needs to change.

> **Production checklist**
> - Set `SECRET_KEY` to a long random string.
> - Restrict `CORS_ORIGINS` to your actual domain.
> - Change the default PostgreSQL password in `docker-compose.yml`.
> - Place the app behind HTTPS (reverse proxy such as nginx or Caddy).

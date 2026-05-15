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
- [License & Copyright](#license--copyright)

---

## How It Works

1. The admin uploads a **YAML config** (title, credentials) and a **users CSV** (userid, name, password) on first launch.
2. The admin uploads one or more **Excel workbooks**. Each workbook has a `Data` sheet (the records), a `Schema` sheet (field definitions, validation rules, help text), and an optional `Edit History` sheet (pre-existing audit trail).
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
ConduVet/
├── backend/
│   ├── main.py                   # FastAPI app, CORS, middleware, migrations
│   ├── database.py               # SQLAlchemy engine and session
│   ├── rate_limiter.py           # slowapi rate limiter
│   ├── auth/
│   │   ├── jwt.py                # Token creation and verification
│   │   └── ldap_stub.py          # Pluggable auth provider interface
│   ├── models/
│   │   └── db_models.py          # ORM models (6 tables)
│   ├── routers/
│   │   ├── admin.py              # /api/admin/* routes
│   │   ├── auth.py               # /api/auth/login
│   │   ├── data.py               # /api/files/* user routes
│   │   └── _helpers.py           # Shared helpers (field history logging, record response)
│   ├── services/
│   │   ├── excel_service.py      # Excel import / export (Data + Schema + Edit History)
│   │   ├── backup_service.py     # Scheduled backup jobs
│   │   └── schema_parser.py      # Data type and depends-on parsing
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api.js                # Axios API client
│   │   ├── App.jsx               # Router, layout, auto-logout hook
│   │   ├── pages/
│   │   │   ├── AdminSetup.jsx
│   │   │   ├── AdminLogin.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── UserLogin.jsx
│   │   │   ├── UserDashboard.jsx
│   │   │   └── DataEntry.jsx     # AG Grid data entry with locking and vetting
│   │   ├── components/
│   │   │   ├── ContextPanel.jsx  # Field help + edit history
│   │   │   └── ReportViewer.jsx
│   │   ├── hooks/
│   │   │   └── useSessionTimeout.js  # Inactivity-based auto-logout
│   │   └── utils/
│   │       └── schemaHelpers.jsx # Client-side type parsing, validation, boolean coercion
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
cd /path/to/ConduVet

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
backup_dir: "./backups"
auto_logout_minutes: 30

# PIN authentication settings
user_domain: "zayeduniversity.ae"   # Email domain for PIN emails (userid@domain)
pin_expiration_minutes: 15          # How long PINs remain valid (in minutes)

# SMTP configuration for PIN email delivery
smtp_config:
  host: "smtp.gmail.com"             # SMTP server hostname (required)
  port: 587                          # SMTP server port (required)
  username: "your-email@gmail.com"   # SMTP username (required)
  password: "your-app-password"      # SMTP password (optional - omit for no-auth SMTP)
  use_tls: true                      # Use TLS for connection (optional, default: true)
```

| Key | Description | Required | Default |
|---|---|---|---|
| `title` | Shown in the header. | ✓ | — |
| `admin_account` | Username for the admin login at `/admin/login`. | ✓ | — |
| `admin_pass` | Admin password. Stored as a bcrypt hash. | ✓ | — |
| `backup_dir` | Directory where automatic Excel backups are written. Created if it does not exist. | ✓ | — |
| `auto_logout_minutes` | Inactivity timeout in minutes (range: 1–480). | optional | 30 |
| `user_domain` | Email domain for PIN emails (e.g., `userid@zayeduniversity.ae`). | optional | `example.com` |
| `pin_expiration_minutes` | How long PINs remain valid (range: 1–1440 minutes). | optional | 15 |
| `smtp_config` | Email server configuration for PIN delivery. See below. | optional* | {} |

**SMTP Configuration Details (`smtp_config` section):**
- `host` — SMTP server hostname (e.g., `smtp.gmail.com`, `smtp.office365.com`) — **required**
- `port` — SMTP server port (typically 587 for TLS, 465 for SSL, 25 for no-auth) — **required**
- `username` — SMTP username/sender email — **required**
- `password` — SMTP password (use Gmail app passwords for Gmail accounts) — optional (omit for no-auth SMTP)
- `use_tls` — Use TLS encryption (optional, default: `true`)

**Note:** `smtp_config` is required if you want PIN-based email authentication. If omitted, only password authentication will work.

**Example Configurations:**

*Gmail with App Password:*
```yaml
title: "My Instance"
admin_account: "admin"
admin_pass: "strong-password"
backup_dir: "./backups"
user_domain: "zayeduniversity.ae"
pin_expiration_minutes: 15

smtp_config:
  host: "smtp.gmail.com"
  port: 587
  username: "your-email@gmail.com"
  password: "xxxx xxxx xxxx xxxx"  # 16-char app password from Google Account
  use_tls: true
```

*Office 365:*
```yaml
user_domain: "company.ae"
pin_expiration_minutes: 20

smtp_config:
  host: "smtp.office365.com"
  port: 587
  username: "your-email@company.com"
  password: "your-password"
  use_tls: true
```

*Custom SMTP Server (with authentication):*
```yaml
user_domain: "yourdomain.com"
pin_expiration_minutes: 10

smtp_config:
  host: "mail.yourdomain.com"
  port: 587
  username: "noreply@yourdomain.com"
  password: "server-password"
  use_tls: true
```

*No-Auth SMTP Server (local or unauthenticated):*
```yaml
user_domain: "yourdomain.com"
pin_expiration_minutes: 15

smtp_config:
  host: "mail.yourdomain.com"
  port: 25
  username: "noreply@yourdomain.com"
  # password: omitted for no-auth SMTP
  use_tls: false
```

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

Every workbook uploaded by the admin must contain the following sheets.

### Sheet: `Data` (required)

The records to be reviewed. First row is the header. Required system columns:

| Column | Description |
|---|---|
| `Owner` | User ID of the record owner, or `ALL` for all users. Hidden from users. |
| `Record Vetter` | User ID of the assigned vetter. |
| `Last Updated` | Auto-populated on submit. Format: `DD/MM/YYYY HH:MM:SS`. |
| `Record Status` | `New`, `Updated`, `Old`, or `Delete`. Existing records default to `Old` on upload. |

All other columns are defined by the Schema sheet.

### Sheet: `Schema` (required)

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
| `Multiple (A,B,C)` | Multi-select; stored as comma-separated values |
| `Boolean` | Checkbox (true/false). Accepts `true`/`false`, `1`/`0`, `yes`/`no` |
| `Date (DD/MM/YYYY)` | Date picker |
| `Date (DD/MM/YYYY HH:MM:SS)` | Datetime picker |

#### Depends On Syntax

Makes a field conditionally required based on the value of another field.

```
FieldName = value
FieldName = value1 or value2
```

### Sheet: `Edit History` (optional)

If present, this sheet is imported as the initial edit history for the dataset. Columns:

| Column | Description |
|---|---|
| `Record ID` | Original record ID (remapped to new IDs on import) |
| `Field Name` | Field that was changed |
| `Old Value` | Previous value |
| `New Value` | New value |
| `Changed By` | User ID |
| `Changed At` | Timestamp |

This sheet is always included in downloads and backups, making workbooks fully portable.

---

## Admin Guide

Access the admin interface at `/admin/login` (link in the top-right corner of every page).

### Files Tab

**Uploading a file**

1. Click **Upload Excel File** or drag a workbook onto the drop zone.
2. The app validates that both sheets exist and that every Schema field matches a Data column.
3. If an `Edit History` sheet is present, it is imported as the audit trail for the dataset.
4. Field-level error messages are shown if validation fails.
5. On success, the file appears in the file list with its record count.

**Managing files**

| Action | Effect |
|---|---|
| **View / Edit** | Opens the AG Grid for that file. Admins see all records (not filtered by owner) with the Owner and Vetter columns editable. |
| **Download** | Downloads the current state as an Excel workbook (Data + Schema + Edit History sheets). |
| **Remove** | Soft-deletes the file (data is retained in the database). |

### Reports Tab

Select a file, then choose a report type:

| Report | Columns | Description |
|---|---|---|
| By User | Owner, Total, New, Updated, Old, Delete | Record counts per owner, broken down by status |
| By Record | ID, Owner, Status, Last Updated, Field Changes | Per-record details with edit count |

Each report renders as a table on screen and can be downloaded as Excel.

### Configuration Tab

Upload a new `config.yaml` to update the title, admin credentials, backup directory, or auto-logout timeout. Optionally upload a new `users.csv` to replace the user list.

**Reset All Data**

The Configuration tab includes a **Reset All Data** button (in the Danger Zone section). This permanently deletes all datasets, user accounts, and the current configuration, returning the app to its initial unconfigured state. A confirmation step is required. After a successful reset, you are redirected to the setup page.

---

## User Guide

### Logging In

Go to the app's root URL. Enter your **User ID** and **Password** and click **Login**.

### Choosing a File

After login you will see one button for each active data file. Click a button to open that file.

### Editing Records

The data entry page shows your assigned records in a spreadsheet grid.

- **Navigate** with Tab, arrow keys, or by clicking a cell.
- **Edit** by clicking or typing in a focused cell.
- **Boolean fields** appear as checkboxes — click to toggle.
- **Red cells** indicate a validation error. Hover over the cell for the error message.

The **context panel** at the bottom shows:
- **Left** — field description (Markdown) and a sample value.
- **Right** — the edit history for that field: who changed it, when, and the old → new value. Also shows lock status if the record is locked.

### Vetting & Vetted-Lock

- The **Vetted** checkbox (on records where you are the assigned vetter) lets you mark a record as approved.
- Once **Vetted = true**, the record owner **cannot edit any fields** until you uncheck it. You (the vetter) retain full edit access regardless.
- Record Status is editable by the owner only when the record is not vetted; you can always edit it.

### Record Locking

When you start editing a record it is automatically locked to prevent conflicting changes from other users. The lock is released when you submit, log out, or your session times out.

### Adding a Record

Click **+ Add Record** to insert a new empty row. The row is owned by your user ID and has status `New`.

### Submitting

Click **Submit** at the top of the grid. Full validation runs before saving. Fix any highlighted errors and resubmit. On success you are returned to the file selection screen.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://conduvet:conduvet@db:5432/conduvet` | PostgreSQL connection string. |
| `SECRET_KEY` | `conduvet-secret-key-change-in-production` | JWT signing key. **Must be changed in production.** |
| `CORS_ORIGINS` | `*` | Comma-separated list of allowed origins, or `*` for all. |
| `USER_DOMAIN` | (from config.yaml) | Optional override for email domain in PINs. Normally configured in `smtp_config.user_domain`. |
| `PIN_EXPIRATION_MINUTES` | (from config.yaml) | Optional override for PIN expiration. Normally configured in `smtp_config.pin_expiration_minutes`. |

**Note:** SMTP configuration (host, port, username, password, TLS) is no longer set via environment variables. Configure it in `config.yaml` under the `smtp_config` section during admin setup or via the Configuration tab in the Admin Dashboard.

Set these in `docker-compose.yml` (under `backend.environment`) or as shell environment variables for local development.

---

## Automatic Backups

- A backup job runs every **2 hours** for each active data file.
- Each backup is a full Excel export (Data + Schema + Edit History sheets).
- A maximum of **24 backups per file** are kept. The oldest is deleted when the 25th is written.
- Backup filenames: `{display_name}_{YYYYMMDD_HHMM}.xlsx`
- The backup directory is set via `backup_dir` in `config.yaml` and created automatically if it does not exist.

---

## Authentication & Security

### Login Methods

ConduVet supports two authentication methods:

1. **PIN-Based Email Authentication (Primary)**
   - Users enter their User ID on the login page
   - A random 5-digit PIN is sent to `{userid}@{user_domain}` (configured in config.yaml)
   - Users enter the PIN to log in
   - PINs expire after `pin_expiration_minutes` (default: 15 minutes, configured in config.yaml)
   - Requires SMTP configuration in `config.yaml` under `smtp_config` section

2. **Password Authentication (Fallback)**
   - Traditional username/password login available as fallback
   - Click "Use Password" on the login page to switch to password mode
   - Passwords are stored as bcrypt hashes; plaintext is never persisted

### General Security

- All routes except `/admin/setup`, `/admin/login`, and `/api/auth/*` require a valid JWT.
- User and admin tokens expire after **8 hours**.
- The authentication logic is behind a pluggable `AuthProvider` interface (`backend/auth/ldap_stub.py`). The default implementation checks bcrypt hashes against the database. To switch to LDAP or SAML, implement the provider interface — no other code needs to change.
- **Rate limiting** is applied to login endpoints via slowapi to prevent brute-force attacks.

> **Production checklist**
> - Set `SECRET_KEY` to a long random string.
> - Restrict `CORS_ORIGINS` to your actual domain.
> - Change the default PostgreSQL password in `docker-compose.yml`.
> - Place the app behind HTTPS (reverse proxy such as nginx or Caddy).

---

## License & Copyright

(c) 2026 Sinan Salman, Ph.D.

ConduVet is released under the GPLv3 license, which is available at [GNU](https://www.gnu.org/licenses/gpl-3.0.html).

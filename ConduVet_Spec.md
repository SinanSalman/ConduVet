# ConduVet — Technical Specification

## Overview

**ConduVet** is a web application that serves as a conduit for vetting crowd-sourced tabular data. It supports data collection and review workflows driven by Excel files that carry both data and schema definitions.

The app name is always rendered as **Instance Title**, where the title comes from the configuration file.

---

## Tech Stack (Fixed)

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI |
| ORM / DB | SQLAlchemy 2.x, PostgreSQL 15+ |
| Auth | JWT (OAuth2 password flow); LDAP/SSO integration as an optional extension point |
| Frontend | React 18, Vite |
| Data Grid | AG Grid Community Edition |
| Styling | Tailwind CSS |
| Background tasks | APScheduler (for periodic backups) |
| Excel I/O | openpyxl |
| Markdown rendering | react-markdown |
| Containerization | Docker + Docker Compose (for self-hosted university deployment) |

---

## Configuration File

The app is configured via a YAML file. The structure is:

```yaml
title: "Instance title displayed next to app name"
admin_account: "admin_username"
admin_pass: "admin_password"
backup_dir: "./backups"        # local directory for rotating backups
auto_logout_minutes: 30        # optional; default: 30, range: 1-480 (inactivity timeout)
```

The users CSV has the following columns (no header variation permitted):

```
userid, name, password
```

Example:
```
Z1234,firstname1 lastname1,abc123
Z2345,firstname2 lastname2,xyz789
```

---

## Application Startup Logic

1. On first launch, check for a persisted configuration in the database.
2. If none exists, redirect all traffic to the **Admin Setup Page**.
3. Once configured, the landing page becomes the **User Login Page**.
4. The Admin interface is always accessible via `/admin` with its own authentication page.

---

## Excel File Format

Each Excel workbook uploaded by the admin must contain the following sheets:

### Sheet: `Data` (required)

Contains the records to be reviewed or updated. The first row is the header. Required columns (at minimum):

- `Owner` — user ID (e.g., `z1234`). A value of `ALL` means all authenticated users can see the record. This column is hidden from users.
- `Record Vetter` — user ID of the assigned vetter who can vet and delete this record. May be empty initially; auto-assigned to vetter with fewest records or admin if no vetters exist.
- `Last Updated` — auto-populated datetime; format: `DD/MM/YYYY HH:MM:SS`.
- `Record Status` — controlled vocabulary: `New`, `Updated`, `Old`, `Delete`. Existing records are set to `Old` on upload; new records added by users are set to `New` automatically.

All other columns are defined by the Schema sheet.

### Sheet: `Schema` (required)

A table with the following columns (all required):

| Column | Description |
|---|---|
| `Field Name` | Must exactly match a column header in the Data sheet |
| `Description` | Markdown-formatted help text shown to users |
| `Data Type` | See data type syntax below |
| `Sample Data` | Example value shown to users |
| `Depends on` | Conditional nullability rule (see below) |
| `Accept Null Values` | `Yes` or `No` (case-insensitive) |
| `Protected` | `Yes` or `No` (case-insensitive); default `No`. Whether the field is read-only for record owners on existing records (see Field Protection below) |

#### Data Type Syntax

| Syntax | Behavior |
|---|---|
| `Text (n)` | Free-text input, max length n characters |
| `Number (a,b)` | Numeric input, value must be in range [a, b] |
| `Multiple (a,b,c,...)` | Multi-select; stored as comma-separated values |
| `List (a,b,c,...)` | Single-select dropdown |
| `Boolean` | Checkbox (true/false). Stored as boolean. Accepts: `true`/`false`, `1`/`0`, `yes`/`no` (case-insensitive) |
| `Date (DD/MM/YYYY)` | Date picker; accepts DD/MM/YYYY format with flexible spacing (single digits: 1/1/2024 or 01/01/2024) |
| `Date (DD/MM/YYYY HH:MM:SS)` | Datetime picker; accepts flexible spacing for date and time components |

#### Depends On Syntax

The `Depends on` column encodes conditional mandatory rules. If the condition evaluates to true, the field cannot be null even if `Accept Null Values` is `Yes`.

Syntax: `FieldName = value` or multiple conditions separated by `or`.

Examples:
- `Joint Industry Research Indicator = Y` — field is required when that indicator is Y
- `Type of industry contribution = F or B` — field is required when contribution is F or B

The parser must handle all patterns above. Leading/trailing whitespace in field names and values must be trimmed before comparison.

### Sheet: `Edit History` (optional)

If present, this sheet is imported as the initial edit history for the dataset. Expected columns:

| Column | Description |
|---|---|
| `Record ID` | The original record ID (remapped to new IDs on import) |
| `Field Name` | Name of the field that was changed |
| `Old Value` | Previous value |
| `New Value` | New value after the change |
| `Changed By` | User ID of who made the change |
| `Changed At` | Timestamp of the change |

If the sheet is absent, no prior edit history is assumed. This sheet is always included in downloads and backups, making workbooks fully portable across ConduVet instances.

---

## Admin Interface

### Setup Page (`/admin/setup`)

Shown on first launch or when no config exists. Accepts upload of the YAML configuration file and the referenced users CSV. Validates both before saving. On success, redirects to the Admin Dashboard.

### Admin Login (`/admin/login`)

Standard username/password form using credentials from the config file. Issues a JWT with admin scope. Link accessible from top-right of every page.

### Admin Dashboard (`/admin`)

After login. Functions:

**File Management**
- Upload a new Excel workbook. On upload:
  - Validate that both `Data` and `Schema` sheets exist.
  - Validate that every `Field Name` in Schema matches a column in Data.
  - Validate that no column in Data is missing from Schema (warn but do not block for system columns: `Owner`, `Record Vetter`, `Last Updated`, `Record Status`).
  - Import the optional `Edit History` sheet if present, remapping record IDs to the newly assigned database IDs.
  - Display specific, field-level error messages if validation fails.
  - On success, persist data to PostgreSQL and display a confirmation message.
- Remove an uploaded file (soft delete; data retained in DB, file removed from active list).
- List all currently active files with upload date and record count.

**Configuration**
- Re-upload a new configuration YAML at any time to replace current settings (including `auto_logout_minutes`).
- **Reset All Data**: Permanently deletes all datasets, user accounts, and configuration, returning the app to its initial unconfigured state. Requires explicit confirmation. After a successful reset, the admin is redirected to the setup page.

**Data Access and Editing**
- View and edit all records for any uploaded file (full access, not filtered by Owner).
- Uses the same AG Grid interface as users but with Owner column visible and editable.
- **Can edit all fields including the Record Vetter field** to reassign vetters to records.

**Download**
- Download any data file as an Excel workbook. The download includes three sheets:
  1. **Data sheet**: Current state of all records with all columns (including Owner, Record Vetter, Last Updated, Record Status, and Record ID)
  2. **Schema sheet**: Field definitions (original schema)
  3. **Edit History sheet**: Complete audit trail of all field changes with Record ID, Field Name, Old Value, New Value, Changed By (user ID), and Changed At (timestamp). Row additions and deletions are also included.
- The file is fully compatible with re-uploading to a new ConduVet instance.

**Reports**

All reports are rendered on-screen as a table and downloadable as Excel files.

| Report | Columns | Description |
|---|---|---|
| By User | Owner, Total, New, Updated, Old, Delete | Record counts grouped by owner, broken down by status |
| By Record | ID, Owner, Status, Last Updated, Field Changes | One row per record with its edit count and last-updated timestamp |

---

## User Interface

### Login Page (`/login`) — Landing Page After Configuration

Fields: `User ID`, `Password`. Authenticates against the users CSV data stored in DB. Issues a JWT with user scope on success.

### Main Menu (`/dashboard`)

Displays one button per active data file uploaded by the admin. Button label is the dataset name (from display_name). Also shows a Logout button.

### Data Entry Interface (`/data/:file_id`)

#### Record Filtering

- Display only records where `Owner` matches the logged-in user's userid or where `Owner` is `ALL`.
- The `Owner` column is hidden from the user view.
- New records added by the user have `Owner` set to their userid.

#### Grid Layout

- AG Grid with one row per record.
- **Dataset name displayed at top** (e.g., "Research Projects" instead of "File 5").
- Each column is configured per its schema Data Type:
  - `Text (n)` → text cell editor with maxLength enforcement
  - `Number (a,b)` → numeric cell editor with min/max validation
  - `Multiple (...)` → text input field; users can enter comma-separated values
  - `List (...)` → AG Grid select cell editor (single value)
  - `Boolean` → checkbox rendered inline; click to toggle; respects all lock and permission rules
  - `Date (DD/MM/YYYY)` → date picker cell editor accepting flexible formats
- Keyboard navigation: Tab and arrow keys move between cells. Cell focus drives the context panel (see below).
- **URLs are automatically detected and made clickable** in cell display (http://, https://, ftp://, www., etc.)

#### Vetting Workflow & Vetted-Lock

- **Vetted field**: A `Boolean` field named `Vetted` (or legacy names `Vetting Status` / `Record Vetting Status`) represents the vetting approval state.
  - Only the assigned **vetter** can change this field.
  - The owner and other users see it as read-only.
- **Vetted-lock**: When the vetter sets `Vetted = true`, the record is locked for the **owner**. While vetted:
  - The owner cannot edit any data field or the Record Status.
  - The vetter can still edit all fields including the Record Status.
  - Admin can always edit all fields.
  - Locked cells are visually grayed out for the owner.
- **Vetted-lock release**: The vetter unchecks `Vetted` to allow the owner to edit again.

#### Record Status Editability

- **Owner**: Can edit Record Status only when the record is not vetted (`Vetted = false`). Grayed out when vetted.
- **Vetter**: Can always edit Record Status, regardless of vetted state.
- **Admin**: Can always edit Record Status.
- Record Status changes are tracked in the edit history.

#### Field-Level Protection

- **Protected fields**: Fields marked as `Protected = Yes` in the Schema sheet are read-only for record **owners** on existing records.
- **Owner behavior**:
  - Can **view** protected field values on existing records (displayed with amber/yellow background and italicized text to indicate protection status).
  - **Cannot edit** protected fields on existing records; attempting to submit changes to protected fields results in a validation error.
  - **Can edit** protected fields when **adding new records** — the protection only applies after initial submission.
  - After submission, normal protection logic applies and the field becomes read-only.
- **Vetter & Admin**: Always have full edit access to protected fields, regardless of whether the record is new or existing.
- **Use case**: Set critical fields (e.g., calibration parameters, institutional identifiers) as protected to ensure they remain unchanged by data owners while still allowing vetters/admins to modify them if needed.

#### Record Locking & Concurrent Edit Prevention

- **Hard record locks**: When a user starts editing any field in a record, the entire record is locked until submit/logout/session expiration.
- **Lock visualization**:
  - Lock icon (🔒) displayed on locked records
  - Lock status shown in context panel with locked-by user ID and locked-at timestamp
  - Other users cannot edit locked records (cells are grayed out)
- **Lock release**:
  - Automatic unlock on successful submit
  - Automatic unlock on logout
  - Automatic unlock on session timeout (auto-logout)

#### Session Timeout & Auto-Logout

- **Configurable inactivity timeout** set in YAML (`auto_logout_minutes`, default: 30 minutes, range: 1-480).
- **Activity monitoring**: Reset on user interaction (click, keypress, mousemove, scroll).
- **Auto-logout**: After inactivity period, user is automatically logged out and redirected to login page.
- **Graceful unlock**: Any locks held by the session are released on timeout.

#### Validation and Highlighting

- Cells with invalid values (wrong type, out-of-range, null where not permitted, failed `Depends on` condition) are highlighted red.
- A brief red validation message appears near the cell (tooltip or inline below the cell).
- Validation runs on cell exit (blur) and on submit.
- **Detailed error messages** include specific guidance (e.g., "must be a number", "must be between X and Y").

#### Context Panel (Lower Third of Screen)

Split into two columns:

**Left — Field Help**
- Field `Description` rendered as Markdown.
- `Sample Data` value displayed below description.
- Updates as the user moves focus between cells.

**Right — Edit History**
- For the currently focused field, shows a chronological list of previous values entered by any user.
- Each entry displays:
  - **User Name** (instead of ID, resolved from AppUser table)
  - **Timestamp** in DD/MM/YYYY HH:MM format
  - **Old Value** → **New Value** transition
  - **URLs are clickable** in both old and new values
- **Lock status** for the record is shown at the top of this panel if the record is currently locked.
- Sourced from a `field_history` table in the database (see Data Model).

#### Record Management

- **Add Record** button: Creates a new empty row with:
  - `Owner` set to current user's userid
  - `Record Status` set to `New`
  - `Record Vetter` auto-assigned to vetter with fewest records in the file; or to admin account if no vetters exist
  - `Vetted` (Boolean) defaulted to `false`; or `Unvetted` if using a legacy List-type vetting field
- **Record Vetter** (system field): Visible to admin only; shows the assigned vetter's userid.
- **Vetted** field (Boolean): Only the assigned vetter can edit. Checking it locks the record for the owner.
- **Record Status** field: Editable dropdown (`Old`, `Updated`, `Delete`, `New`). Owner-editable when not vetted; vetter-editable always.
- **Last Updated** is read-only in the grid; auto-populated with current datetime on submit.
- **Delete button** (row-level): Assigned vetter can delete their records; confirmation required. Deletion is recorded in edit history with the original record ID preserved in `old_value`.

#### Submit

- Submit button at the top of the grid.
- Runs full validation before saving.
- **Date normalization**: Dates are normalized to DD/MM/YYYY format (leading zeros added: 1/1/2024 → 01/01/2024).
- On success, saves all changes to the database, logs changed field values (including Record Status) to the history table, unlocks the record, and returns the user to the dashboard.
- **Vetted-lock enforcement**: If an owner attempts to submit changes to a record the vetter has marked as vetted, the submission is rejected with a per-record error.
- **Detailed error reporting**: Field-level errors are highlighted; user can fix and resubmit.

---

## Data Model (PostgreSQL)

### `app_config`
Stores the active configuration. Single row.

```
id, title, admin_account, admin_pass_hash, backup_dir, auto_logout_minutes, created_at, updated_at
```

### `app_users`
Populated from the users CSV.

```
userid (PK), name, password_hash
```

### `data_files`
One row per uploaded Excel file.

```
id (PK), filename, display_name, uploaded_at, is_active
```

### `schema_definitions`
One row per field per file.

```
id (PK), file_id (FK → data_files), field_name, description, data_type, sample_data, depends_on, accept_null, field_order
```

### `data_records`
One row per data record per file. Data stored as JSONB.

```
id (PK), file_id (FK → data_files), owner, vetter, record_data (JSONB), record_status,
last_updated, created_at, is_locked, locked_by, locked_at
```

- `is_locked` (Boolean): Flag indicating if record is being actively edited
- `locked_by` (String): User ID who holds the lock
- `locked_at` (DateTime): When the lock was acquired

### `field_history`
Audit trail for individual field changes, including Record Status changes and system events.

```
id (PK), record_id (FK → data_records, ON DELETE SET NULL, nullable),
file_id, field_name, old_value, new_value, changed_by (userid), changed_at
```

- `record_id` is **nullable**. When a record is deleted, history rows are preserved with `record_id = NULL`. The original record ID is stored in `old_value` for `_ROW_DELETED` events.
- System event field names: `_ROW_ADDED` (on record creation), `_ROW_DELETED` (on record deletion).
- `Record Status` changes are logged as regular field history entries with `field_name = "Record Status"`.

---

## Backup System

- APScheduler runs a job every 2 hours per active data file.
- Each backup is a full Excel export of the data file (Data + Schema + Edit History sheets).
- Rotating: maximum 24 backups per file. When the 25th is written, the oldest is deleted.
- Backup filenames: `{display_name}_{YYYYMMDD_HHMM}.xlsx`
- Backup directory is specified in the config YAML (`backup_dir`). App creates the directory if it does not exist.

---

## Authentication Notes

- All routes except `/admin/setup`, `/admin/login`, and `/login` require a valid JWT.
- Admin routes require admin-scoped JWT.
- JWT expiry: 8 hours for both users and admins.
- **LDAP/SSO extension point**: The user authentication service should be implemented behind an interface so that the password-check logic can be swapped for an LDAP bind or SAML assertion without changing the rest of the app. Document the interface but implement standalone auth by default.

---

## Key Features Summary

### Record Vetting Workflow
- **Vetter assignment**: Auto-assigned on record creation or manually assigned by admin.
- **Vetting permissions**: Only assigned vetter can edit the `Vetted` (Boolean) field.
- **Vetted-lock**: When `Vetted = true`, the owner is locked out of all edits. Vetter and admin retain full edit access.
- **Record deletion**: Only assigned vetter can delete their records.
- **Flexible vetter management**: Admin can reassign vetters or change record ownership at any time.

### Record Status
- Owner-editable when the record is not vetted; vetter and admin can always edit.
- All status changes are recorded in the edit history for a full audit trail.

### Concurrent Edit Prevention
- Records are locked while being edited by any user.
- Lock status visible to all users viewing the file.
- Automatic lock release on submit, logout, or session timeout.

### Session Management
- Configurable auto-logout timer (default: 30 minutes).
- Activity monitoring resets the timeout.
- Graceful cleanup on timeout (locks released, user logged out).

### Data Integrity & Audit
- Complete edit history with user names and timestamps, including Record Status changes.
- Row addition and deletion events logged as system events in the history.
- URL detection and hyperlinking throughout the UI.
- Detailed validation messages guide users to correct invalid entries.

### Excel Import / Export
- Downloads include three sheets: Data, Schema, and Edit History (full audit trail).
- Uploads accept an optional Edit History sheet to pre-populate audit history.
- Fully compatible with re-uploading for data migration or backup.

### Reset All Data
- Admin can permanently wipe all datasets, user accounts, and configuration.
- Requires explicit confirmation before proceeding.
- Redirects to the setup wizard after a successful reset.

---

## Reference: `Research_Projects.xlsx` Schema Summary

The following is extracted directly from the Schema sheet of the reference file. Claude Code should use this to validate that the app correctly handles all data type and dependency patterns present in a real deployment.

**Key field types observed:**
- `Text (n)` — e.g., `Text (50)`, `Text (255)`, `Text (3000)`
- `Number (a,b)` — e.g., `Number (2025,2040)`, `Number (0,999999999)`, `Number (0,100)`
- `Multiple (...)` — e.g., Funding Source with values `G,BS,HEI,NO,IF,SF`; Field of R&D with ~40 codes
- `List (...)` — e.g., Priority Technology `(CS,AS,AM,SS,DE,CR,QU,AR,PR,BI,BD,OT)`, Status `(A,O,C)`, TRL `(TRL-1,...,TRL-9)`
- `Boolean` — e.g., `Vetted` field (vetting approval checkbox)
- `Date (DD/MM/YYYY)` — Start Date, End Date
- `Date (DD/MM/YYYY HH:MM:SS)` — Last Updated

**Dependency chains observed (must all be supported):**
- `Joint Industry Research Indicator = Y` → makes Industrial partner name, Partner Type, Type of industry contribution required
- `Type of industry contribution = F or B` → makes Partner_funding required
- `Type of industry contribution = I or B` → makes Intellectual Contribution required
- `Intellectual Contribution = O` → makes Intellectual Contribution_other required
- `International Research Collaboration Indicator = Y` → makes international partner fields required
- `Type of international partner contribution = F or B` → makes International_Partner_funding required
- `Type of international partner contribution = I or B` → makes International_Partner_Intellectual Contribution required
- `International_Partner_Intellectual Contribution = O` → makes the _other field required

**Users with `ALL` records:** All authenticated users should see records where Owner = `ALL`.
**Owner matching:** Case-insensitive match on the userid.

---

## Project Structure (Recommended)

```
conduvet/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── rate_limiter.py
│   ├── auth/
│   │   ├── jwt.py
│   │   └── ldap_stub.py          # LDAP extension point
│   ├── routers/
│   │   ├── admin.py
│   │   ├── auth.py
│   │   ├── data.py
│   │   └── _helpers.py           # Shared helpers (log_field_changes, record_to_response)
│   ├── models/
│   │   └── db_models.py
│   ├── services/
│   │   ├── excel_service.py      # import/export/validation
│   │   ├── backup_service.py     # APScheduler jobs
│   │   └── schema_parser.py      # data type + depends-on parsing
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AdminSetup.jsx
│   │   │   ├── AdminLogin.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── UserLogin.jsx
│   │   │   ├── UserDashboard.jsx
│   │   │   └── DataEntry.jsx
│   │   ├── components/
│   │   │   ├── ContextPanel.jsx
│   │   │   └── ReportViewer.jsx
│   │   ├── hooks/
│   │   │   └── useSessionTimeout.js
│   │   ├── utils/
│   │   │   └── schemaHelpers.jsx
│   │   └── api.js
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

---

## Notes for Implementation

- The `schema_parser.py` module is critical. It must parse all data type patterns (including `Boolean`) and the `depends_on` expression language. Build and unit-test it independently before wiring into the grid.
- AG Grid column definitions should be generated client-side from the schema API response so that adding a new file automatically produces the correct grid configuration without frontend code changes.
- Boolean fields render as inline checkboxes using a custom `cellRenderer`. The AG Grid default text editor is suppressed; toggling happens via the checkbox `onChange` event which calls `node.setDataValue`.
- URL detection uses regex patterns to identify http://, https://, ftp://, and www. URLs; these are converted to clickable links throughout the UI.
- History logging must capture the old and new value on every cell change at submit time, not on every keystroke. Record Status changes are logged in the same `field_history` table.
- Dates are accepted in flexible format (1/1/2024 or 01/01/2024) but stored and displayed as DD/MM/YYYY.
- The Owner column should be excluded from the schema-driven column generation for regular users. For admins, it is included and editable.
- Record locking uses three columns on `data_records` (`is_locked`, `locked_by`, `locked_at`). Bulk deletes during Reset must clear tables in FK dependency order (FieldHistory → SchemaDefinition → DataRecord → DataFile → AppUser → AppConfig) since bulk deletes bypass ORM cascades.
- Session timeout is configurable and monitored client-side; all user activity resets the timer.
- The vetted-lock is enforced on both the frontend (cell editability, visual graying) and the backend (submit endpoint rejects vetted-record changes from the owner).

# ConduVet User Manual

Welcome to ConduVet! This manual will guide you through all the features of the application and help you work effectively with your datasets.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Dashboard](#login--dashboard)
3. [Data Entry Interface](#data-entry-interface)
4. [Editing Records](#editing-records)
5. [Vetting Workflow](#vetting-workflow)
6. [Record Status](#record-status)
7. [Record Locking](#record-locking)
8. [Validation & Error Messages](#validation--error-messages)
9. [Submitting Changes](#submitting-changes)
10. [Session & Auto-Logout](#session--auto-logout)
11. [Tips & Best Practices](#tips--best-practices)
12. [Frequently Asked Questions](#frequently-asked-questions)
13. [License & Copyright](#license--copyright)

---

## Getting Started

### System Requirements

- **Browser**: Modern web browser (Chrome, Firefox, Safari, Edge)
- **Connection**: Stable internet connection
- **Account**: Valid username and password provided by your administrator

### First Time Login

1. Navigate to the ConduVet login page
2. Enter your **User ID** and **Password**
3. Click **Login**
4. You will be redirected to the main dashboard

---

## Login & Dashboard

### The Main Dashboard

After logging in, you'll see a list of available datasets. Each dataset is displayed as a button showing the dataset name.

**To work with a dataset:**
1. Click on the dataset button (e.g., "Research Projects")
2. You will be taken to the data entry interface for that dataset

### Logging Out

- Click the **Logout** button in the top-right corner
- You will be redirected to the login page
- All unsaved changes will be lost, and any locks on your records will be released

---

## Data Entry Interface

### Overview

The data entry interface is divided into three main sections:

1. **Top Header Bar** — Shows dataset name, back button, and action buttons
2. **Data Grid** — The main table showing records
3. **Context Panel** — Lower section showing field help and edit history

### Header Bar

- **Dataset Name**: Shows the name of the dataset you're working with
- **Back Button**: Returns to the dashboard
- **+ Add Record Button**: Creates a new empty record
- **Submit Button**: Saves all changes to the database

### Data Grid

The data grid displays your records as rows and fields as columns.

**Navigation:**
- **Tab Key**: Move to the next cell
- **Shift+Tab**: Move to the previous cell
- **Arrow Keys**: Move up/down/left/right between cells
- **Click**: Focus on a specific cell

**Cell Types:**
- **Text Input**: Type freely within character limits
- **Number Input**: Enter numbers within the specified range
- **Date Picker**: Click to open a calendar picker (accepts flexible date format)
- **Dropdown (List)**: Click to select from a predefined list of options
- **Checkbox (Boolean)**: Click to toggle true/false — used for the Vetted field
- **Multi-value (Multiple)**: Type comma-separated values
- **Hyperlinked URLs**: URLs in cells are automatically detected and made clickable

### Understanding Cell Colors

- **White background**: Normal, editable cell
- **Light blue background**: Cell has been changed and is pending submit
- **Light red background**: Cell contains a validation error
- **Gray background**: Cell cannot be edited (locked, vetted-locked, or permission restriction)

### Context Panel (Lower Section)

The context panel is split into two columns:

**Left Column — Field Help:**
- **Description**: Help text explaining what this field is for (formatted text)
- **Sample Data**: An example of valid input

**Right Column — Edit History:**
- **Field Changes**: All previous values entered for the currently focused field
- **Change Details**: Who made the change (user name), when, and what changed (Old Value → New Value)
- **Lock Status**: If the record is currently locked, the top of this panel shows who locked it and when

---

## Editing Records

### Creating a New Record

1. Click the **+ Add Record** button
2. A new empty row is added to the grid
3. The new record will be:
   - Owned by you
   - Assigned a vetter automatically
   - Set to **New** status
   - **Vetted** checkbox set to unchecked (false)

### Editing Existing Records

1. Click on any editable cell and start typing (or click a checkbox to toggle it)
2. Press **Tab** or **Enter** to move to the next cell
3. Changed cells have a blue tint to indicate pending changes

**You can only edit records where:**
- You are the **owner** of the record (you created it), OR
- The record's **Owner** is `ALL` (shared records)

**You cannot edit:**
- Records locked by another user
- Fields restricted by your role (see Vetting Workflow)
- Any field when the record is **vetted** and you are the owner

### Deleting a Record

Only the **assigned vetter** of a record can delete it. A confirmation prompt is shown before deletion. Deletions are recorded in the edit history.

---

## Vetting Workflow

### Key Roles

| Role | What they can do |
|---|---|
| **Record Owner** | Create and edit their own records; change Record Status when not vetted |
| **Record Vetter** | Edit all fields; check/uncheck Vetted; delete records assigned to them |
| **Admin** | Full access to all records and fields |

### The Vetted Checkbox

The **Vetted** column is a checkbox that the assigned vetter uses to mark a record as approved.

- **Only the assigned vetter** can check or uncheck this box
- The owner sees this as read-only

### Vetted-Lock (Owner Restriction)

When the vetter checks **Vetted = true**, the record is locked for the **owner**:

- The owner **cannot edit any fields** while the record is vetted
- All cells appear **grayed out** for the owner
- The vetter retains full edit access
- The admin retains full edit access

**To allow the owner to edit again**, the vetter simply unchecks the **Vetted** checkbox.

### If You Are the Vetter

You can:
- **Check or uncheck Vetted** to approve or re-open a record
- **Edit all fields**, including fields the owner cannot edit while vetted
- **Edit Record Status** at any time
- **Delete records** that are assigned to you

### If You Are the Record Owner

You can:
- **Create and edit your records** — as long as they are not vetted
- **See the Vetted status** (read-only) to know if your record has been approved
- **Edit Record Status** — only when the record is not vetted (Vetted = false)
- Fix and resubmit records after a vetter unmarks them

You **cannot**:
- Change the Vetted checkbox
- Edit any field when the record is vetted
- Delete records (only the vetter can do this)

---

## Record Status

The **Record Status** column reflects the lifecycle state of each record:

| Status | Meaning |
|---|---|
| `New` | Newly created record |
| `Updated` | Record has been edited since upload |
| `Old` | Existing record from the original dataset, not yet changed |
| `Delete` | Marked for deletion |

**Who can change Record Status:**
- **Owner**: Can edit Record Status only when the record is **not vetted** (Vetted = false)
- **Vetter**: Can always edit Record Status, even when the record is vetted
- **Admin**: Can always edit Record Status

Record Status changes are tracked in the **edit history**, visible in the context panel.

---

## Protected Fields

### What are Protected Fields?

Some fields may be marked as **protected** by your administrator. Protected fields are important or sensitive values that should remain stable once set — for example, calibration parameters, institutional identifiers, or other critical baseline data.

### How Protected Fields Work

**For existing records:**
- You **can view** protected field values
- Protected fields are displayed with an **amber/yellow background and italicized text** to indicate they cannot be edited
- You **cannot edit** protected fields on existing records
- If you try to submit changes to a protected field, the submission will be rejected with an error message

**For new records:**
- When you **create a new record**, you **can edit protected fields**
- Once you submit the record, those fields become protected and read-only for future edits
- Only your vetter or the administrator can modify protected fields after submission

**For vetters and admins:**
- Vetters and admins have **full edit access** to all fields, including protected ones, at any time
- There are no restrictions based on protection status for these roles

### Example Scenario

1. You create a new research project record with fields: Project ID, Project Name, Start Date, and Budget
2. All fields are editable while creating the new record
3. You submit the record — it is now part of the dataset
4. A vetter reviews and approves your project
5. Later, you want to update the Project Name — you can edit it freely
6. But the Budget field is marked as protected — you cannot change it
7. Your vetter approves the name change but notices the budget needs adjustment
8. The vetter can edit the Budget field directly, and you will see the change on the next refresh

### Getting Help with Protected Fields

If you need to modify a protected field on an existing record, contact your vetter or administrator. They can make the change for you.

---

## Record Locking

### What is Record Locking?

When you start editing a record, it is automatically locked to prevent conflicting changes from other users. The lock is released when you:
- Submit your changes
- Log out
- Session times out due to inactivity

### Lock Status Indicator

When a record is locked by another user:
- The entire row appears **grayed out**
- The **right column of the context panel** shows who locked the record and when

### When a Record is Locked by You

When you are actively editing a record, it is locked from others but fully editable by you. Submit your changes to release the lock.

### When a Record is Locked by Another User

- You cannot edit any fields in that record
- Wait for the other user to submit or log out
- Locks are automatically released, so you won't wait indefinitely

---

## Validation & Error Messages

### What is Validated

As you edit cells and when you submit, the app checks:
- **Type**: Is the value the correct type? (number, date, text, boolean, etc.)
- **Range**: Is the number within the allowed range?
- **Length**: Is the text within the character limit?
- **Required**: Is the field required? (including conditional `Depends on` rules)
- **Options**: Is the value one of the allowed options? (for dropdowns)

### Error Indicators

**Red cell background**: Hover over the cell to see the error message.

**Examples:**
- `"must be a number"` — wrong type
- `"must be between 0 and 100"` — number out of range
- `"required"` — empty field that must be filled
- `"required because [OtherField] is [value]"` — conditional requirement triggered
- `"maximum length is 255 characters"` — text too long

### Fixing Errors

1. Identify the red-highlighted cell
2. Read the tooltip error message
3. Correct the value
4. The cell turns white when the error is resolved
5. Submit successfully once all errors are cleared

---

## Submitting Changes

### Before You Submit

1. Check for any **red-highlighted cells** — these must be fixed before submitting
2. Review changed cells (blue tint) to confirm your edits
3. Check the **edit history** in the context panel to verify what changed

### Submitting

1. Click the **Submit** button at the top of the grid
2. Full validation runs on all changed records
3. If there are errors:
   - Affected cells are highlighted in red
   - Error messages explain what to fix
   - Correct the errors and click Submit again
4. If validation passes:
   - All changes are saved to the database
   - Edit history is updated for every changed field (including Record Status)
   - Records are unlocked
   - You return to the dashboard

### Vetted-Lock on Submit

If you are a record **owner** and attempt to submit changes to a record that has been vetted (Vetted = true), the submission will be rejected. You will see a per-record error. Ask your vetter to unmark the record before making further edits.

### After Submit

- Your changes are now visible to all users viewing the dataset
- The full edit history (with your name and timestamp) is visible in the context panel

---

## Session & Auto-Logout

### Session Timeout

Your session automatically times out after a period of inactivity to protect your data. The default timeout is **30 minutes** and can be configured by your administrator.

### Activity That Resets the Timeout

The timer resets whenever you:
- Click anywhere on the page
- Type in a cell
- Move the mouse
- Press any keyboard key
- Scroll the page

### What Happens When You Time Out

1. Your session automatically ends
2. You are logged out and redirected to the login page
3. Any locks on your records are automatically released
4. **Unsaved changes are lost** — submit regularly to avoid losing work

### Staying Logged In

- **Submit frequently**: Save your changes every few minutes
- **Stay active**: Keep interacting with the page while editing
- **Log out manually**: Use the Logout button if you need to step away

---

## Tips & Best Practices

### General Tips

1. **Submit regularly** — Click Submit every few minutes to save your work
2. **Check the context panel** — The field description and sample data guide you on what to enter
3. **Read error messages** — They explain exactly what is wrong and how to fix it
4. **Respect locks** — If another user has a record locked, wait for them to submit or time out
5. **Check edit history** — Before submitting, review what you changed in the right column of the context panel

### Working with Dates

- **Format**: Enter dates as DD/MM/YYYY (e.g., 15/03/2024)
- **Flexible input**: Single digits work (e.g., 1/3/2024 becomes 01/03/2024 automatically)

### Working with URLs

URLs are automatically detected and made clickable throughout the app:
- Supported formats: `http://`, `https://`, `ftp://`, and `www.` URLs
- Click blue underlined links to open them in a new tab
- URLs are also clickable in the edit history panel

### Working with Boolean (Checkbox) Fields

- Click the checkbox to toggle between checked (true) and unchecked (false)
- A grayed-out checkbox means you do not have permission to edit it

### Working with Multi-Value Fields

For fields that accept multiple values:
1. Click the cell
2. Type values separated by commas (e.g., `G,BS,HEI`)
3. Press Tab or click outside to confirm

### Avoiding Common Mistakes

❌ **Don't:**
- Leave the page without submitting — unsaved changes are lost on timeout
- Try to edit a vetted record if you are the owner — it won't work
- Enter numbers with commas or currency symbols (use `1000`, not `1,000`)
- Edit a record locked by another user — wait for it to be released

✅ **Do:**
- Submit your work regularly
- Use the context panel to understand what each field expects
- Check error messages — they point you directly to the problem
- Ask the vetter to uncheck Vetted before making further edits to an approved record

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Move to next cell | Tab |
| Move to previous cell | Shift + Tab |
| Move between cells | Arrow Keys |
| Start editing a cell | Start typing |
| Confirm edit and move | Enter or Tab |
| Submit changes | Click Submit button |
| Logout | Click Logout button |

---

## Frequently Asked Questions

**Q: Can I delete my own records?**
No. Only the assigned vetter can delete records. This protects data integrity.

**Q: Why are all my cells grayed out?**
The assigned vetter has marked your record as vetted (Vetted = true). You cannot edit any fields until the vetter unchecks that box. Contact your vetter if you need to make changes.

**Q: Can I edit Record Status when my record is vetted?**
No. The owner cannot edit Record Status when the record is vetted. The vetter and admin can always edit it.

**Q: What if my session times out while I'm editing?**
You'll be logged out and unsaved changes will be lost. Submit your changes frequently to avoid this.

**Q: Can I edit a record that another user locked?**
No. Locked records are read-only for other users. The lock is released automatically when the user submits, logs out, or times out.

**Q: How do I know who locked a record?**
Click on any cell in the locked row — the right column of the context panel shows who locked it and when.

**Q: Can I undo a change after submitting?**
No direct undo. However, you can re-edit the record and submit a corrected version. The full edit history is always preserved, so every change is traceable.

**Q: Are my changes saved automatically?**
No. You must click the **Submit** button to save. Clicking away, navigating back, or timing out will lose unsaved changes.

**Q: What does the edit history in the context panel show?**
It shows every previous value for the currently focused field — who changed it, when, and what it changed from and to. Record Status changes are also included in the history.

**Q: Can I work offline?**
No. ConduVet requires an active internet connection and a valid session.

---

## Summary

ConduVet is designed to make collaborative data entry and vetting efficient and transparent:

- **Edit your records** easily with guided validation and inline help
- **See all changes** in the detailed edit history — including Record Status changes
- **Avoid conflicts** with automatic record locking
- **Understand restrictions** clearly — grayed-out cells tell you what you can and cannot edit
- **Stay organised** with a clear vetting workflow and Boolean Vetted checkbox

Remember to:
- ✓ Submit regularly
- ✓ Review error messages
- ✓ Respect locks and vetted records
- ✓ Use the context panel for help and history

Happy vetting! If you have questions, reach out to your administrator.

---

## License & Copyright

(c) 2026 Sinan Salman, Ph.D.

ConduVet is released under the GPLv3 license, which is available at [GNU](https://www.gnu.org/licenses/gpl-3.0.html).

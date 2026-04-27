# Conduvet User Manual

Welcome to Conduvet! This manual will guide you through all the features of the application and help you work effectively with your datasets.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Dashboard](#login--dashboard)
3. [Data Entry Interface](#data-entry-interface)
4. [Editing Records](#editing-records)
5. [Record Locking](#record-locking)
6. [Validation & Error Messages](#validation--error-messages)
7. [Vetting Workflow](#vetting-workflow)
8. [Submitting Changes](#submitting-changes)
9. [Session & Auto-Logout](#session--auto-logout)
10. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### System Requirements

- **Browser**: Modern web browser (Chrome, Firefox, Safari, Edge)
- **Connection**: Stable internet connection
- **Account**: Valid username and password provided by your administrator

### First Time Login

1. Navigate to the Conduvet login page
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

1. **Top Header Bar** - Shows dataset name, back button, and action buttons
2. **Data Grid** - The main table showing records
3. **Context Panel** - Lower third showing field help and edit history

### Header Bar

- **Dataset Name**: Shows the name of the dataset you're working with (e.g., "Research Projects")
- **Back Button**: Returns to the dashboard
- **Add Record Button**: Creates a new empty record (users only)
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
- **Date Picker**: Click to open calendar picker (accepts flexible date format)
- **Dropdown**: Click to open list of predefined options
- **Checkbox/Multiple**: Select one or more values
- **Hyperlinked URLs**: Click blue underlined URLs to open in a new tab

### Context Panel (Lower Third)

The context panel is split into two sections:

**Left Column - Field Help:**
- **Field Name & Type**: The name and data type of the focused cell
- **Description**: Help text explaining what this field is for
- **Sample Data**: An example of valid input

**Right Column - Edit History:**
- **Field Changes**: Shows all previous values entered for this field
- **Change Details**: 
  - Who made the change (user name)
  - When it was changed (date and time)
  - What changed (Old Value → New Value)
- **Lock Status**: Shows if the record is currently locked (who locked it and when)

---

## Editing Records

### Creating a New Record

1. Click the **+ Add Record** button
2. A new empty row will be added to the grid
3. The new record will be:
   - Assigned to you as the owner
   - Assigned to the vetter with the fewest records (for vetting)
   - Set to "New" status
   - Ready for editing

### Editing Existing Records

1. Click on any cell to focus it
2. Start typing to edit the value
3. Press **Tab** or **Enter** to move to the next cell
4. The cell will be marked as changed (background color changes)

**Important**: You can only edit records where:
- **Owner is you** (you created the record), OR
- **Owner is "ALL"** (shared records), AND
- **The record is not locked** by another user

### Understanding Cell Colors

- **White background**: Normal, unedited cell
- **Light blue background**: Cell is currently being edited or has been changed
- **Light red background**: Cell contains an error (fails validation)
- **Gray background**: Cell cannot be edited (locked by another user or locked field)

---

## Record Locking

### What is Record Locking?

When you start editing a record, it becomes locked to prevent other users from making conflicting changes. The lock is automatically released when you:
- Submit your changes
- Log out
- Session times out due to inactivity

### Lock Status Indicator

- **Lock Icon (🔒)**: Appears on locked records
- **Lock Info Panel**: Shows in the right column of the context panel:
  - Who locked the record (user ID)
  - When it was locked (date and time)

### When a Record is Locked by Another User

If another user has locked a record:
- The record row appears grayed out
- You cannot edit any fields in that record
- Wait for the other user to submit or log out
- Locks are automatically released, so you won't wait forever

---

## Validation & Error Messages

### Understanding Validation

As you edit cells, the app checks:
- **Type**: Is the value the correct type? (number, date, text, etc.)
- **Range**: Is the number within the allowed range?
- **Length**: Is the text not too long?
- **Required**: Is the field required? (if "Depends on" rules apply)
- **Options**: Is the value one of the allowed options? (for dropdowns)

### Error Indicators

**Red Cell Background**: Indicates a validation error
- Hover over the cell to see the error message
- The error message explains what's wrong and how to fix it

**Examples:**
- `"Age must be between 18 and 100 (got 150)"` - Number out of range
- `"Email is required because Country is set to 'USA'"` - Conditional requirement
- `"Maximum length is 50 characters (you have 75)"` - Text too long

### Fixing Errors

1. Identify the red cell with the error
2. Read the error message
3. Correct the value according to the instructions
4. The cell will turn back to white when the error is fixed
5. You can then submit successfully

---

## Vetting Workflow

### Understanding the Vetting Process

The vetting workflow allows designated users (vetters) to review and approve records.

**Key Concepts:**
- **Record Owner**: The person who created or entered the record
- **Record Vetter**: The person assigned to review the record (assigned automatically or by admin)
- **Vetting Status**: The approval status (e.g., "Unvetted", "Vetted", "Rejected")

### If You Are a Vetter

You can:
- **Edit Vetting Status**: Change the record status to indicate review completion
- **View Record Details**: See all fields and edit history
- **Delete Records**: Remove records that are assigned to you (if needed)

**You cannot:**
- Edit fields in records you don't own (unless you're the owner or record is "ALL")
- Change the vetting status of records not assigned to you

### If You Are a Record Owner

You can:
- **Create and Edit Records**: Add new records and modify fields
- **View Vetting Status**: See if your record has been reviewed
- **Resubmit if Rejected**: Fix issues and resubmit for vetting

**You cannot:**
- Edit the vetting status field (only the assigned vetter can do this)
- Delete your own records (only the assigned vetter can delete)

---

## Submitting Changes

### Before You Submit

1. **Review Your Changes**: Scroll through the edited cells
2. **Check for Errors**: Look for any red-highlighted cells
3. **Check Edit History**: Click on fields to see what changed
4. **Verify Status**: Ensure record status reflects your intent

### Submitting

1. Click the **Submit** button at the top of the grid
2. The app will validate all your changes
3. If there are errors:
   - Error cells will be highlighted in red
   - Error messages will explain what's wrong
   - Fix the errors and try again
4. If validation passes:
   - Changes are saved to the database
   - Edit history is updated
   - Records are unlocked
   - You return to the dashboard

### After Submit

- Your changes are now visible to all users viewing the dataset
- Other users can see what you changed (in edit history)
- If you were a vetter, other users can see your vetting status update

---

## Session & Auto-Logout

### Session Timeout

Your session automatically times out after a period of inactivity to protect your data.

**Default timeout**: 30 minutes of no activity
- This can be customized by your administrator

### Activity That Resets the Timeout

The timer resets whenever you:
- Click anywhere on the page
- Type in a cell
- Move the mouse
- Press any keyboard key
- Use the navigation buttons

### What Happens When You Time Out

1. Your session automatically ends
2. You are logged out
3. You are redirected to the login page
4. Any locks on your records are automatically released
5. **Unsaved changes are lost** - this is why you should submit regularly

### Staying Logged In

To avoid losing work:
- **Submit frequently**: Save your changes every 5-10 minutes
- **Stay active**: Keep interacting with the page while editing
- **Avoid leaving open**: Don't walk away from the page without logging out

### Manual Logout

To log out before the timeout:
1. Click the **Logout** button in the top-right corner
2. Confirm the logout if prompted
3. All your locks will be released

---

## Tips & Best Practices

### General Tips

1. **Save Regularly**: Click Submit frequently to save your work
2. **Check Edit History**: Always verify what changed before submitting
3. **Read Error Messages**: They tell you exactly what's wrong and how to fix it
4. **Use Sample Data**: Check the context panel for examples of valid entries
5. **Respect Locks**: If another user has a record locked, wait for them to submit

### Working with Dates

- **Format**: Enter dates as DD/MM/YYYY (e.g., 15/03/2024)
- **Flexible Input**: Single digits work (e.g., 1/3/2024 will become 01/03/2024)
- **Date Picker**: Click the cell to use the calendar picker for easier entry

### Working with URLs

URLs are automatically detected and made clickable:
- Click blue underlined URLs to open them in a new tab
- URLs work in both the grid cells and the edit history panel
- Supported formats: http://, https://, ftp://, and www. URLs

### Working with Multiple-Select Fields

For fields that accept multiple values:
1. Click the cell
2. Enter values separated by commas (e.g., "value1, value2, value3")
3. Click outside or press Tab to confirm

### Avoiding Common Mistakes

❌ **Don't:**
- Leave the page without submitting - your changes will be lost on timeout
- Edit a locked record (you can't - wait for the lock to be released)
- Enter numbers with commas or currency symbols (e.g., use 1000, not "1,000")
- Use future dates for historical data

✅ **Do:**
- Submit your work regularly (every 5-10 minutes)
- Use the date picker for date entry when possible
- Check the error messages - they guide you to the fix
- Wait a few moments for locks to auto-release if someone times out

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Move to next cell | Tab |
| Move to previous cell | Shift + Tab |
| Move up/down | Arrow Keys (↑ ↓) |
| Move left/right | Arrow Keys (← →) |
| Edit focused cell | Start typing |
| Submit changes | Click Submit button |
| Logout | Click Logout button |

---

## Getting Help

### Error Messages

If you see an error message:
1. Read the message carefully - it explains what's wrong
2. Follow the guidance provided
3. Correct the value and try again

**Common errors:**
- `"required"` - You must fill in this field
- `"must be a number"` - This field only accepts numbers
- `"between X and Y"` - The number is out of range
- `"valid date"` - The date format is incorrect
- `"already exists"` - This value is not allowed

### Contacting Support

If you encounter a problem:
1. Note the error message and what you were doing
2. Note any record IDs involved
3. Contact your administrator with:
   - What you were trying to do
   - What error you received
   - When it happened

---

## Frequently Asked Questions

**Q: Can I delete my own records?**  
A: No, only the assigned vetter can delete records. This protects data integrity.

**Q: What if my session times out while I'm editing?**  
A: You'll be logged out. Unsaved changes will be lost. To avoid this, submit your changes regularly.

**Q: Can I edit a record that another user locked?**  
A: No, locked records are read-only. Wait for the lock to be released (automatically after timeout or when the user submits).

**Q: How do I know who locked a record?**  
A: Look at the lock status in the right panel of the context panel. It shows the user ID who locked it and when.

**Q: Can I undo a change after submitting?**  
A: No, but you can see what changed in the edit history. Only the assigned vetter or administrator can modify submitted records.

**Q: What if I make a mistake?**  
A: Don't panic! You can re-edit the record and submit the corrected version. The edit history will show all changes, so there's a complete audit trail.

**Q: Are my changes saved automatically?**  
A: No, you must click the Submit button to save. Clicking away or timing out will lose unsaved changes.

**Q: Can I work offline?**  
A: No, Conduvet requires an internet connection and an active session to work.

---

## Summary

Conduvet is designed to make collaborative data entry and vetting efficient and transparent:

- **Edit your records** easily with guided validation
- **See all changes** in the detailed edit history
- **Avoid conflicts** with automatic record locking
- **Meet deadlines** with configurable session timeouts
- **Stay organized** with clear vetting workflow

Remember to:
- ✓ Submit regularly
- ✓ Review error messages
- ✓ Respect locks
- ✓ Use the context panel for help

Happy vetting! If you have questions, reach out to your administrator.

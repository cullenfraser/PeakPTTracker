# Trainers & Calendar System - Specification

## 📋 Overview

Complete trainer management and calendar system for tracking client sessions, attendance, and progress.

## 🗄️ Database Schema

### 1. **Trainers Table**
Stores trainer profiles and information.

```sql
trainers (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),  -- Links to auth user
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  specialization TEXT,                      -- e.g., "Strength Training", "HIIT"
  bio TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  calendar_color TEXT DEFAULT '#3FAE52'     -- For calendar display
)
```

### 2. **Training Sessions Table**
Tracks individual training sessions with attendance.

```sql
training_sessions (
  id UUID PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) NOT NULL,
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  
  -- Session details
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  session_number INTEGER NOT NULL,          -- e.g., Session 5 of 20
  
  -- Status tracking
  status TEXT DEFAULT 'scheduled',          -- scheduled, completed, cancelled, late_cancellation, no_show
  cancellation_reason TEXT,
  
  -- Attendance (for multiple participants)
  participants_attended JSONB DEFAULT '[]', -- Array of participant names who attended
  attendance_notes TEXT,
  
  -- Metadata
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  notes TEXT
)
```

### 3. **Client-Trainer Assignments Table**
Links clients (contracts) to trainers.

```sql
client_trainer_assignments (
  id UUID PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) NOT NULL,
  trainer_id UUID REFERENCES trainers(id) NOT NULL,
  is_primary BOOLEAN DEFAULT TRUE,          -- Primary trainer for this client
  assigned_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(contract_id, trainer_id)
)
```

## 📄 Pages to Build

### 1. **Trainers Page** (`/trainers`)

**Purpose**: View all clients and their details in a comprehensive table.

**Features**:
- ✅ **Client List Table** with columns:
  - Client Name
  - Email & Phone
  - Training Frequency
  - Package Length
  - Total Sessions
  - Sessions Completed
  - Sessions Remaining
  - Start Date / End Date
  - Status (Active, Completed, Cancelled)
  - Assigned Trainer
  - Actions (View Contract, View Calendar)

- ✅ **Filters**:
  - By Trainer
  - By Status
  - By Date Range
  - Search by name/email

- ✅ **Client Details Modal**:
  - Full client information
  - Emergency contact
  - Health information
  - Training history
  - Session attendance record

- ✅ **Export Functionality**:
  - Export to CSV/Excel
  - Print client list

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Trainers & Clients                                  │
│ [Filter by Trainer ▼] [Status ▼] [Search...]       │
├─────────────────────────────────────────────────────┤
│ Name     │ Contact  │ Frequency │ Sessions │ Status │
│──────────┼──────────┼───────────┼──────────┼────────│
│ John Doe │ john@... │ 2x/week   │ 8/20     │ Active │
│ Jane S.  │ jane@... │ 3x/week   │ 15/39    │ Active │
└─────────────────────────────────────────────────────┘
```

### 2. **Calendar Page** (`/calendar`)

**Purpose**: Manage training sessions with drag-and-drop scheduling.

**Features**:

#### **View Options**:
- ✅ **Monthly View**: Full month calendar
- ✅ **Weekly View**: 7-day detailed view
- ✅ **Daily View**: Single day with time slots

#### **Session Management**:
- ✅ **Add Session Button**: Opens modal to schedule new session
  - Select client (from active contracts)
  - Select trainer
  - Choose date & time
  - Duration (default 1 hour)
  - Notes

- ✅ **Drag & Drop**: Move sessions to different times/dates

- ✅ **Session Card** displays:
  - Client name
  - Time (e.g., "10:00 AM - 11:00 AM")
  - Trainer name
  - Session number (e.g., "Session 5/20")
  - Status indicator (color-coded)

#### **Attendance Tracking**:
- ✅ **Click Session** → Opens attendance modal:
  - Mark as Completed
  - Mark as Cancelled
  - Mark as Late Cancellation (< 12 hours notice)
  - Mark as No Show
  
- ✅ **Multiple Participants**:
  - Checkbox for each participant
  - Mark who attended
  - Notes field for attendance details

- ✅ **Status Colors**:
  - 🟢 Scheduled (Green)
  - 🔵 Completed (Blue)
  - 🟡 Late Cancellation (Yellow)
  - 🔴 Cancelled (Red)
  - ⚫ No Show (Gray)

**Layout - Weekly View**:
```
┌──────────────────────────────────────────────────────┐
│ Calendar - Week of Oct 7-13, 2025                    │
│ [Monthly] [Weekly] [Daily]  [+ Add Session]          │
│ [Trainer: All ▼]                                     │
├──────────────────────────────────────────────────────┤
│      Mon   │   Tue   │   Wed   │   Thu   │   Fri   │
│  Oct 7     │  Oct 8  │  Oct 9  │  Oct 10 │  Oct 11 │
├────────────┼─────────┼─────────┼─────────┼─────────┤
│ 8:00 AM    │         │         │         │         │
│ ┌────────┐ │         │ ┌─────┐ │         │         │
│ │John D. │ │         │ │Jane │ │         │         │
│ │9-10 AM │ │         │ │10-11│ │         │         │
│ │Sess 5/20│ │         │ └─────┘ │         │         │
│ └────────┘ │         │         │         │         │
│            │         │         │         │         │
│ 2:00 PM    │         │         │         │         │
└────────────┴─────────┴─────────┴─────────┴─────────┘
```

## 🎯 Key Workflows

### Workflow 1: Schedule a Session

1. Trainer clicks "+ Add Session"
2. Modal opens:
   - Select client from dropdown (active contracts only)
   - Date picker
   - Time picker (start & end)
   - Auto-fills trainer (current user)
   - Optional notes
3. Click "Schedule"
4. Session appears on calendar
5. Client receives notification (future feature)

### Workflow 2: Mark Attendance (Single Participant)

1. Trainer clicks on scheduled session
2. Attendance modal opens
3. Options:
   - ✅ **Mark as Completed** → Session counted
   - ❌ **Cancel** → Reason required
   - ⚠️ **Late Cancellation** → Forfeit session
   - 🚫 **No Show** → Forfeit session
4. Add notes (optional)
5. Click "Save"
6. Session status updates
7. Sessions completed/remaining updates

### Workflow 3: Mark Attendance (Multiple Participants)

1. Trainer clicks on scheduled session
2. Attendance modal opens
3. Shows list of all participants (from contract)
4. Checkboxes for each:
   - ☑️ John Doe - Attended
   - ☐ Jane Smith - Did not attend
5. Status options:
   - If ANY attended → Mark as Completed
   - If NONE attended → No Show or Cancelled
6. Notes field for details
7. Click "Save"
8. Only attended participants get session counted

### Workflow 4: Reschedule a Session

1. Trainer drags session card to new date/time
2. Confirmation modal: "Reschedule session?"
3. Click "Confirm"
4. Session moves to new slot
5. Client notified (future feature)

### Workflow 5: View Client Progress

1. From Trainers page, click client name
2. Modal opens showing:
   - Client details
   - Contract information
   - Session history table:
     - Date, Time, Status, Attendance, Notes
   - Progress chart:
     - Sessions completed vs remaining
     - Attendance rate
     - Cancellation rate

## 📊 Session Status Definitions

| Status | Description | Counts Toward Total? | Forfeit? |
|--------|-------------|----------------------|----------|
| **Scheduled** | Future session, not yet occurred | No | No |
| **Completed** | Session happened, client attended | Yes | No |
| **Cancelled** | Cancelled with >12 hours notice | No | No |
| **Late Cancellation** | Cancelled with <12 hours notice | Yes | Yes |
| **No Show** | Client didn't show up | Yes | Yes |

## 🎨 UI Components Needed

### 1. **SessionCard Component**
```tsx
<SessionCard
  clientName="John Doe"
  startTime="10:00 AM"
  endTime="11:00 AM"
  sessionNumber={5}
  totalSessions={20}
  status="scheduled"
  trainerColor="#3FAE52"
  onClick={handleSessionClick}
/>
```

### 2. **AttendanceModal Component**
```tsx
<AttendanceModal
  session={session}
  participants={['John Doe', 'Jane Smith']}
  onComplete={handleComplete}
  onCancel={handleCancel}
  onLateCancellation={handleLateCancellation}
  onNoShow={handleNoShow}
/>
```

### 3. **AddSessionModal Component**
```tsx
<AddSessionModal
  clients={activeClients}
  trainers={trainers}
  onSchedule={handleSchedule}
/>
```

### 4. **ClientDetailsModal Component**
```tsx
<ClientDetailsModal
  client={clientData}
  contract={contractData}
  sessions={sessionHistory}
  onClose={handleClose}
/>
```

## 📦 Required NPM Packages

```json
{
  "react-big-calendar": "^1.8.5",        // Calendar component
  "@types/react-big-calendar": "^1.8.5",
  "react-dnd": "^16.0.1",                // Drag and drop
  "react-dnd-html5-backend": "^16.0.1",
  "date-fns": "^2.30.0"                  // Date utilities
}
```

## 🔐 Security & Permissions

### RLS Policies:
- ✅ Trainers can only see their own sessions
- ✅ Trainers can only modify their own sessions
- ✅ Clients can view their own sessions (read-only)
- ✅ Admin users can see all sessions

### Data Access:
- Trainers see: Their assigned clients only
- Clients see: Their own training history only
- Admin sees: All trainers and clients

## 📈 Analytics & Reports (Future)

- Session completion rate by trainer
- Client attendance trends
- Cancellation patterns
- Revenue tracking per trainer
- Most popular training times

## ✅ Implementation Checklist

### Phase 1: Database & Backend
- [x] Create trainers table
- [x] Create training_sessions table
- [x] Create client_trainer_assignments table
- [x] Set up RLS policies
- [x] Create indexes

### Phase 2: Trainers Page
- [ ] Build client list table component
- [ ] Add filters and search
- [ ] Create client details modal
- [ ] Implement export functionality
- [ ] Add pagination

### Phase 3: Calendar Page
- [ ] Install calendar packages
- [ ] Build monthly view
- [ ] Build weekly view
- [ ] Build daily view
- [ ] Implement drag-and-drop
- [ ] Create add session modal
- [ ] Create attendance modal
- [ ] Add session status updates

### Phase 4: Integration
- [ ] Link trainers page to calendar
- [ ] Add navigation between views
- [ ] Implement real-time updates
- [ ] Add notifications (future)

## 🚀 Next Steps

1. **Run the updated SQL script** to create new tables
2. **Install calendar packages**: `npm install react-big-calendar @types/react-big-calendar react-dnd react-dnd-html5-backend date-fns`
3. **Create trainer profiles** in database
4. **Build Trainers page** with client list
5. **Build Calendar page** with scheduling
6. **Test complete workflow** end-to-end

This system will provide comprehensive session tracking and management for Peak Fitness Dieppe trainers!

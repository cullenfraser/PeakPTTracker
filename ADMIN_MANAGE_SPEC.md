# Admin Manage Page - Complete Specification

## 🎯 Purpose

Comprehensive admin dashboard providing bird's-eye view of all trainers, clients, sessions, and payroll management.

---

## 🗄️ Database Schema (Added)

### **Trainers Table** (Enhanced with Payroll)
```sql
trainers (
  -- Basic info
  first_name, last_name, email, phone
  specialization, bio, is_active
  
  -- Payroll information
  pay_rate_per_session DECIMAL(10, 2)      -- e.g., $40 per session
  pay_rate_type TEXT                       -- per_session, hourly, salary
  hourly_rate DECIMAL(10, 2)               -- e.g., $35/hour
  monthly_salary DECIMAL(10, 2)            -- e.g., $4000/month
  commission_rate DECIMAL(5, 2)            -- e.g., 10% of package price
  
  -- Banking
  bank_account_last4 TEXT                  -- Last 4 digits for reference
  payment_method TEXT                      -- manual, direct_deposit, check
  
  -- Employment
  employment_type TEXT                     -- contractor, part_time, full_time
  hire_date DATE
  termination_date DATE
  
  -- Performance tracking
  total_sessions_completed INTEGER
  total_revenue_generated DECIMAL(10, 2)
  average_client_rating DECIMAL(3, 2)
)
```

### **Payroll Periods Table**
```sql
payroll_periods (
  period_start DATE
  period_end DATE
  period_type TEXT                         -- weekly, bi_weekly, monthly
  status TEXT                              -- open, processing, paid, closed
  processed_date DATE
  paid_date DATE
  total_sessions INTEGER
  total_amount DECIMAL(10, 2)
  notes TEXT
  processed_by UUID
)
```

### **Trainer Payroll Table**
```sql
trainer_payroll (
  payroll_period_id UUID
  trainer_id UUID
  
  -- Session counts
  sessions_completed INTEGER
  sessions_cancelled INTEGER
  sessions_no_show INTEGER
  total_hours DECIMAL(10, 2)
  
  -- Calculations
  base_pay DECIMAL(10, 2)                  -- Based on pay rate
  commission_amount DECIMAL(10, 2)         -- If applicable
  bonus_amount DECIMAL(10, 2)              -- Manual bonuses
  deductions DECIMAL(10, 2)                -- Manual deductions
  total_pay DECIMAL(10, 2)                 -- Final amount
  
  -- Payment tracking
  payment_status TEXT                      -- pending, approved, paid, on_hold
  payment_date DATE
  payment_method TEXT
  payment_reference TEXT                   -- Check #, transfer ID, etc.
  
  -- Approval
  approved_by UUID
  approved_date DATE
  notes TEXT
)
```

### **Admin Users Table**
```sql
admin_users (
  user_id UUID                             -- Links to auth.users
  role TEXT                                -- super_admin, admin, manager
  permissions JSONB                        -- Custom permissions
  is_active BOOLEAN
)
```

---

## 📊 Admin Manage Page Layout

### **Main Dashboard** (`/admin/manage`)

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Dashboard                                [Export] [Print] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│ │ Total       │ │ Active      │ │ This Week   │ │ Revenue   │ │
│ │ Trainers    │ │ Clients     │ │ Sessions    │ │ This Month│ │
│ │    5        │ │    42       │ │    156      │ │  $18,450  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ [Overview] [Trainers] [Payroll] [Analytics] [Settings]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ TRAINER OVERVIEW                                                │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Name      │ Clients │ Sessions │ This Week │ This Month  │  │
│ │           │         │ Completed│ Pay       │ Pay         │  │
│ ├───────────┼─────────┼──────────┼───────────┼─────────────┤  │
│ │ John Doe  │   12    │   45/50  │  $1,200   │  $4,800     │  │
│ │ Jane Smith│   8     │   30/35  │  $900     │  $3,600     │  │
│ │ Mike Jones│   15    │   60/65  │  $1,500   │  $6,000     │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Page Sections

### 1. **Overview Tab** (Default)

#### **Key Metrics Cards**
- ✅ Total Trainers (Active/Inactive)
- ✅ Total Active Clients
- ✅ Sessions This Week/Month
- ✅ Revenue This Week/Month
- ✅ Pending Payroll Amount
- ✅ Average Session Completion Rate

#### **Trainer Summary Table**
| Trainer | Status | Clients | Sessions Completed | This Week Pay | This Month Pay | Actions |
|---------|--------|---------|-------------------|---------------|----------------|---------|
| John Doe | Active | 12 | 45/50 | $1,200 | $4,800 | View Details |
| Jane Smith | Active | 8 | 30/35 | $900 | $3,600 | View Details |

**Columns**:
- Trainer name (clickable → opens detail modal)
- Employment status
- Number of active clients
- Sessions completed/total
- Pay for current week
- Pay for current month
- Action buttons (View Details, Edit, Payroll)

#### **Recent Activity Feed**
- New client signed up
- Session completed
- Payroll processed
- Trainer added/removed

---

### 2. **Trainers Tab**

#### **Trainer List with Filters**
- Filter by: Active/Inactive, Employment Type, Specialization
- Search by name/email
- Sort by: Name, Clients, Revenue, Sessions

#### **Trainer Detail Modal** (Click on trainer)

```
┌─────────────────────────────────────────────────────┐
│ John Doe - Trainer Details                    [×]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│ PERSONAL INFO                                        │
│ Email: john@example.com                              │
│ Phone: (506) 123-4567                                │
│ Specialization: Strength Training, HIIT             │
│ Hire Date: Jan 15, 2024                              │
│ Employment: Full-Time                                │
│                                                      │
│ PAYROLL INFO                                         │
│ Pay Rate: $40 per session                            │
│ Commission: 10% of package price                     │
│ Payment Method: Direct Deposit (****1234)           │
│                                                      │
│ PERFORMANCE                                          │
│ Total Sessions: 245                                  │
│ Completion Rate: 96%                                 │
│ Total Revenue Generated: $58,450                     │
│ Average Rating: 4.8/5.0                              │
│                                                      │
│ ACTIVE CLIENTS (12)                                  │
│ ┌──────────────┬──────────┬────────────┬─────────┐ │
│ │ Client       │ Package  │ Sessions   │ Status  │ │
│ ├──────────────┼──────────┼────────────┼─────────┤ │
│ │ Alice Brown  │ 2x/week  │ 8/20       │ Active  │ │
│ │ Bob Wilson   │ 3x/week  │ 15/39      │ Active  │ │
│ └──────────────┴──────────┴────────────┴─────────┘ │
│                                                      │
│ SESSION HISTORY (Last 30 Days)                      │
│ ┌──────────┬──────────┬────────┬─────────────────┐ │
│ │ Date     │ Client   │ Status │ Duration        │ │
│ ├──────────┼──────────┼────────┼─────────────────┤ │
│ │ Oct 3    │ Alice B. │ ✓      │ 1 hour          │ │
│ │ Oct 3    │ Bob W.   │ ✓      │ 1 hour          │ │
│ │ Oct 2    │ Alice B. │ ✓      │ 1 hour          │ │
│ └──────────┴──────────┴────────┴─────────────────┘ │
│                                                      │
│ [Edit Trainer] [View Calendar] [Process Payroll]    │
└─────────────────────────────────────────────────────┘
```

---

### 3. **Payroll Tab**

#### **Payroll Periods**
```
┌─────────────────────────────────────────────────────┐
│ PAYROLL MANAGEMENT                                  │
│                                                      │
│ Current Period: Oct 1-7, 2025 (Weekly)             │
│ Status: Open                                         │
│ [Create New Period] [Process Current Period]        │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Period        │ Type    │ Status │ Total Amount │ │
│ ├───────────────┼─────────┼────────┼──────────────┤ │
│ │ Oct 1-7, 2025 │ Weekly  │ Open   │ $8,450       │ │
│ │ Sep 24-30     │ Weekly  │ Paid   │ $7,890       │ │
│ │ Sep 17-23     │ Weekly  │ Paid   │ $8,120       │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### **Trainer Payroll Detail** (Click period)

```
┌─────────────────────────────────────────────────────┐
│ Payroll Period: Oct 1-7, 2025                      │
│ Status: Open                                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│ TRAINER BREAKDOWN                                    │
│ ┌────────────┬──────────┬──────┬─────────┬────────┐ │
│ │ Trainer    │ Sessions │ Hours│ Base Pay│ Total  │ │
│ ├────────────┼──────────┼──────┼─────────┼────────┤ │
│ │ John Doe   │    15    │ 15.0 │ $600    │ $650   │ │
│ │  Base      │          │      │         │ $600   │ │
│ │  Commission│          │      │         │  $50   │ │
│ │  Bonus     │          │      │         │   $0   │ │
│ │  Status: Pending                      [Approve] │ │
│ ├────────────┼──────────┼──────┼─────────┼────────┤ │
│ │ Jane Smith │    12    │ 12.0 │ $480    │ $480   │ │
│ │  Status: Approved                     [Mark Paid]│ │
│ └────────────┴──────────┴──────┴─────────┴────────┘ │
│                                                      │
│ PERIOD TOTALS                                        │
│ Total Sessions: 45                                   │
│ Total Hours: 45.0                                    │
│ Total Amount: $3,250                                 │
│                                                      │
│ [Export to CSV] [Process All] [Close Period]        │
└─────────────────────────────────────────────────────┘
```

#### **Individual Trainer Payroll Edit**
```
┌─────────────────────────────────────────────────────┐
│ Edit Payroll: John Doe - Oct 1-7, 2025             │
├─────────────────────────────────────────────────────┤
│                                                      │
│ SESSIONS                                             │
│ Completed: 15 sessions × $40 = $600                 │
│ Cancelled: 1 session (not paid)                     │
│ No Show: 0 sessions                                  │
│                                                      │
│ CALCULATIONS                                         │
│ Base Pay:        $600.00                             │
│ Commission:       $50.00 (10% of $500 revenue)      │
│ Bonus:            $0.00                              │
│ Deductions:       $0.00                              │
│ ─────────────────────────                            │
│ TOTAL PAY:       $650.00                             │
│                                                      │
│ PAYMENT DETAILS                                      │
│ Method: [Direct Deposit ▼]                          │
│ Reference: [Auto-generated]                          │
│ Notes: [Optional notes...]                           │
│                                                      │
│ [Cancel] [Save] [Approve & Process]                 │
└─────────────────────────────────────────────────────┘
```

---

### 4. **Analytics Tab**

#### **Revenue Analytics**
- **Revenue by Trainer** (Bar chart)
- **Revenue Trends** (Line chart - last 6 months)
- **Package Type Distribution** (Pie chart)

#### **Performance Metrics**
- **Session Completion Rate by Trainer**
- **Client Retention Rate**
- **Average Sessions per Client**
- **Cancellation Rate**

#### **Payroll Analytics**
- **Total Payroll by Month** (Bar chart)
- **Average Pay per Trainer**
- **Cost per Session**
- **Payroll as % of Revenue**

---

### 5. **Settings Tab**

#### **Payroll Settings**
- Default pay period type (Weekly/Bi-weekly/Monthly)
- Auto-calculate commission
- Bonus rules
- Deduction rules

#### **Trainer Management**
- Add new trainer
- Bulk import trainers
- Export trainer list

#### **Admin Users**
- Manage admin access
- Role permissions
- Activity log

---

## 🔢 Payroll Calculation Logic

### **Per Session Pay**
```typescript
basePay = sessions_completed × pay_rate_per_session
commission = total_package_revenue × (commission_rate / 100)
totalPay = basePay + commission + bonus - deductions
```

### **Hourly Pay**
```typescript
basePay = total_hours × hourly_rate
totalPay = basePay + bonus - deductions
```

### **Salary**
```typescript
basePay = monthly_salary / periods_per_month
totalPay = basePay + bonus - deductions
```

---

## 🎨 Key Features

### ✅ **Real-Time Data**
- Live session counts
- Current period payroll totals
- Active client counts

### ✅ **Drill-Down Capability**
- Click trainer → See all details
- Click client → See contract & history
- Click session → See attendance

### ✅ **Payroll Workflow**
1. **Open Period** → System tracks sessions
2. **Review** → Admin reviews calculations
3. **Approve** → Admin approves individual payrolls
4. **Process** → Mark as paid with reference
5. **Close Period** → Lock the period

### ✅ **Export & Reporting**
- Export payroll to CSV/Excel
- Print payroll reports
- Generate trainer performance reports
- Revenue reports

### ✅ **Security**
- Admin-only access (RLS enforced)
- Role-based permissions
- Audit trail for payroll changes
- Secure payment information

---

## 📊 Data Aggregation Queries

### **Trainer Summary**
```sql
SELECT 
  t.id,
  t.first_name || ' ' || t.last_name as name,
  COUNT(DISTINCT cta.contract_id) as active_clients,
  COUNT(ts.id) FILTER (WHERE ts.status = 'completed') as sessions_completed,
  SUM(CASE WHEN ts.status = 'completed' THEN t.pay_rate_per_session ELSE 0 END) as total_earnings
FROM trainers t
LEFT JOIN client_trainer_assignments cta ON t.id = cta.trainer_id
LEFT JOIN training_sessions ts ON t.id = ts.trainer_id
WHERE t.is_active = true
GROUP BY t.id;
```

### **Current Week Payroll**
```sql
SELECT 
  t.id,
  t.first_name || ' ' || t.last_name as name,
  COUNT(*) FILTER (WHERE ts.status = 'completed') as sessions,
  COUNT(*) FILTER (WHERE ts.status = 'completed') * t.pay_rate_per_session as pay
FROM trainers t
LEFT JOIN training_sessions ts ON t.id = ts.trainer_id
WHERE ts.session_date >= date_trunc('week', CURRENT_DATE)
  AND ts.session_date < date_trunc('week', CURRENT_DATE) + interval '1 week'
GROUP BY t.id;
```

---

## ✅ Implementation Checklist

### Phase 1: Database (Complete)
- [x] Add payroll fields to trainers table
- [x] Create payroll_periods table
- [x] Create trainer_payroll table
- [x] Create admin_users table
- [x] Set up RLS policies
- [x] Create indexes

### Phase 2: Admin Page
- [ ] Build overview dashboard
- [ ] Create trainer summary table
- [ ] Build trainer detail modal
- [ ] Implement payroll period management
- [ ] Create payroll calculation logic
- [ ] Build payroll approval workflow
- [ ] Add export functionality

### Phase 3: Analytics
- [ ] Revenue charts
- [ ] Performance metrics
- [ ] Payroll analytics
- [ ] Custom date ranges

### Phase 4: Settings
- [ ] Payroll configuration
- [ ] Admin user management
- [ ] Role permissions
- [ ] Audit logs

---

## 🚀 Ready to Execute

**The database schema is complete and includes:**
- ✅ 9 tables (including payroll tables)
- ✅ All payroll fields on trainers
- ✅ Payroll period tracking
- ✅ Individual trainer payroll records
- ✅ Admin user management
- ✅ Complete RLS policies
- ✅ Performance indexes

**Run `SUPABASE_SETUP.sql` to create everything!** 🎉

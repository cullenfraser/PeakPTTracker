# Setup Instructions - Peak Fitness Dieppe

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install the new signature canvas package and all other dependencies.

### 2. Set Up Supabase Database

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `SUPABASE_SETUP.sql`
4. Paste and **Run** the SQL

This creates:
- Updated `quotes` table with client details and Square fields
- Updated `contracts` table with signature storage
- `hours` table (unchanged)
- All necessary indexes and RLS policies

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these from: Supabase Dashboard → Settings → API

### 4. Create a Test User

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User"
3. Enter email and password
4. Confirm the user

### 5. Start the Development Server

```bash
npm run dev -- --port 5180
```

The app will be available at: **http://localhost:5180**

## 📋 Testing the Complete Flow

### Test Scenario: Create a Training Package Contract

1. **Login**
   - Navigate to http://localhost:5180/login
   - Enter your test user credentials
   - Click "Sign In"

2. **Calculator Page**
   - Select start date
   - Choose number of participants (1-3)
   - Select frequency (e.g., "2x per week")
   - Choose package length (e.g., "2 Months")
   - Select payment method (e.g., "Credit Card")
   - Choose payment schedule (e.g., "Monthly")
   - Optional: Add down payment
   - Optional: Enable split payment (if multiple participants)
   - Click "Calculate with RPC"
   - Review the price breakdown

3. **Client Details Modal**
   - Click "Create Contract" button
   - Modal opens with comprehensive form
   - Fill in:
     - Personal Information (required)
     - Address (required)
     - Emergency Contact (required)
     - Health Information (optional)
     - Additional Notes (optional)
   - Click "Create Contract"

4. **Contract Page**
   - Review the official Peak Fitness Dieppe contract
   - Verify all checkboxes are correctly marked
   - Check the cost breakdown section
   - Sign in the signature canvas
   - Optional: Parent/Guardian signature (if under 18)
   - Click "Save Signature"
   - Contract status changes to "Active"
   - Click "Print Contract" to print

## 🔧 Troubleshooting

### Issue: "Cannot find module 'react-signature-canvas'"

**Solution**: Run `npm install` to install the new dependency.

### Issue: Database errors when creating quotes/contracts

**Solution**: 
1. Verify you ran the complete `SUPABASE_SETUP.sql`
2. Check that all tables were created successfully
3. Verify RLS policies are enabled

### Issue: Signature not saving

**Solution**:
1. Check browser console for errors
2. Verify the `signature_data` column exists in contracts table
3. Ensure you're signed in (check auth state)

### Issue: Modal not opening

**Solution**:
1. Check browser console for errors
2. Verify `ClientDetailsModal.tsx` was created
3. Check that the button click handler is working

## 📊 Database Verification

Run these queries in Supabase SQL Editor to verify setup:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('quotes', 'contracts', 'hours');

-- Check quotes table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quotes' 
ORDER BY ordinal_position;

-- Check contracts table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contracts' 
ORDER BY ordinal_position;

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('quotes', 'contracts', 'hours');
```

## 🔐 Security Notes

### Row Level Security (RLS)
- ✅ Enabled on all tables
- ✅ Users can only see their own quotes and contracts
- ✅ Hours table is read-only for all authenticated users

### Environment Variables
- ⚠️ Never commit `.env` file to version control
- ⚠️ Use `.env.example` as a template
- ⚠️ Keep Supabase keys secure

## 📱 Square Integration (Future)

When ready to integrate with Square:

1. **Install Square SDK**:
   ```bash
   npm install square
   ```

2. **Add Square credentials to `.env`**:
   ```env
   VITE_SQUARE_ACCESS_TOKEN=your_square_access_token
   VITE_SQUARE_LOCATION_ID=your_square_location_id
   ```

3. **Create Square service** (`src/lib/square.ts`)

4. **Update ClientDetailsModal submit handler** to create Square customer

5. **Store `square_customer_id`** in database

See `IMPLEMENTATION_SUMMARY.md` for detailed Square integration code examples.

## 📖 Additional Documentation

- **CALCULATOR_DETAILS.md** - Pricing logic and calculation examples
- **IMPLEMENTATION_SUMMARY.md** - Complete feature list and workflow
- **README.md** - General project information

## ✅ Checklist

Before going to production:

- [ ] Supabase database setup complete
- [ ] Environment variables configured
- [ ] Test user created
- [ ] Calculator flow tested
- [ ] Client details modal tested
- [ ] Contract creation tested
- [ ] Signature functionality tested
- [ ] Print layout verified
- [ ] Square integration implemented (if needed)
- [ ] Production Supabase project configured
- [ ] SSL certificate configured (for production domain)

## 🆘 Support

For issues or questions:
1. Check browser console for errors
2. Check Supabase logs (Dashboard → Logs)
3. Review the implementation files
4. Verify all setup steps were completed

## 🎉 Success!

If you can:
1. ✅ Login successfully
2. ✅ Create a quote in the calculator
3. ✅ Open the client details modal
4. ✅ Submit client information
5. ✅ View the contract with correct checkboxes
6. ✅ Sign the contract digitally
7. ✅ Print the contract

**You're all set!** The system is working correctly.

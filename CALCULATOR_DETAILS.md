# Peak Fitness Dieppe - Training Package Calculator

## Business Model

This calculator is designed for **personal training sessions** with flexible pricing based on frequency, participants, and package length.

## Pricing Structure

### Session Rates (Per Session, Per Participant)
- **1x/Week, Bi-Weekly, Once a Month**: $85.00/session
- **2x/Week**: $80.00/session
- **3x/Week, 4x/Week, 5x/Week**: $75.00/session

### Frequency Options
1. **Once a Month (x1/month)** - $85/session
2. **Every 2 Weeks (Bi-weekly)** - $85/session
3. **Once a Week (x1/week)** - $85/session
4. **Twice a Week (x2/week)** - $80/session
5. **Three a Week (x3/week)** - $75/session
6. **Four a Week (x4/week)** - $75/session
7. **Five a Week (x5/week)** - $75/session

### Package Length
- **Month to Month** (1 month)
- **2 Months**
- **3 Months** (maximum)

### Participants
- **1-3 participants** per session
- Price **multiplies** by number of participants
  - Example: 2 participants at $80/session = $160/session total
- Option to **split payment equally** between participants

## Calculation Logic

### Total Sessions
```
Total Sessions = Frequency (sessions/week) × Weeks in Package
Weeks in Package = Package Length (months) × 4.33 weeks/month
```

**Examples:**
- 2x/week for 2 months = 2 × (2 × 4.33) = ~17 sessions
- 3x/week for 3 months = 3 × (3 × 4.33) = ~39 sessions

### Pricing Calculation
```
1. Base Cost = Price Per Session × Participants × Total Sessions
2. Subtotal = Base Cost
3. Tax (HST 15%) = Subtotal × 0.15
4. Total Before Fee = Subtotal + Tax
5. Processing Fee (if credit card) = Total Before Fee × 0.035
6. Grand Total = Total Before Fee + Processing Fee
7. Amount After Down Payment = Grand Total - Down Payment
```

## Payment Options

### Payment Methods
1. **Cash** - No processing fee
2. **EMT (E-Transfer)** - No processing fee
3. **Credit Card** - **+3.5% processing fee**

### Payment Schedules
1. **Pay in Full** - Single payment
2. **Equal Monthly Payments** - Divided by package length
3. **Equal Bi-Weekly Payments** - Divided by ~2.17 periods per month

### Down Payment
- **Optional** down payment to reduce payment amounts
- Reduces the amount financed

### Split Payment
- Available when **2 or 3 participants**
- Divides each payment equally between participants
- Each person pays their share on the same schedule

## Tax
- **HST: 15%** (New Brunswick, Canada)
- Applied to subtotal before processing fees

## Example Calculations

### Example 1: Solo Training
- **Participants**: 1
- **Frequency**: 2x/week ($80/session)
- **Package**: 2 months
- **Payment**: Full payment, Cash

**Calculation:**
- Total Sessions: 2 × 8.66 weeks = 17 sessions
- Subtotal: $80 × 1 × 17 = $1,360.00
- HST (15%): $204.00
- **Total: $1,564.00**

### Example 2: Partner Training with Split Payment
- **Participants**: 2
- **Frequency**: 3x/week ($75/session)
- **Package**: 3 months
- **Payment**: Monthly, Credit Card, Split between participants

**Calculation:**
- Total Sessions: 3 × 12.99 weeks = 39 sessions
- Subtotal: $75 × 2 × 39 = $5,850.00
- HST (15%): $877.50
- Subtotal with tax: $6,727.50
- Processing Fee (3.5%): $235.46
- **Grand Total: $6,962.96**
- Monthly Payment: $6,962.96 ÷ 3 = $2,320.99/month
- **Per Person: $1,160.50/month**

### Example 3: With Down Payment
- **Participants**: 1
- **Frequency**: 1x/week ($85/session)
- **Package**: 3 months
- **Down Payment**: $500
- **Payment**: Bi-weekly, EMT

**Calculation:**
- Total Sessions: 1 × 12.99 weeks = 13 sessions
- Subtotal: $85 × 1 × 13 = $1,105.00
- HST (15%): $165.75
- Total: $1,270.75
- After Down Payment: $1,270.75 - $500 = $770.75
- Bi-weekly Payments: $770.75 ÷ 6.5 periods = $118.58/bi-weekly

## Features

### Calculator Page
- ✅ Date selection for package start
- ✅ 1-3 participants with price multiplication
- ✅ 7 frequency options with appropriate pricing
- ✅ 1-3 month package lengths
- ✅ 3 payment methods (with credit card fee)
- ✅ 3 payment schedules
- ✅ Optional down payment
- ✅ Split payment option for multiple participants
- ✅ Real-time price breakdown
- ✅ RPC verification via Supabase
- ✅ Save quotes
- ✅ Create contracts

### Contract Print Page
- ✅ Professional print layout
- ✅ Training package details
- ✅ Participant information
- ✅ Payment schedule breakdown
- ✅ Terms and conditions
- ✅ Signature section

## Database Schema

### Quotes Table
Stores training package quotes with:
- Customer information
- Start date
- Participants (1-3)
- Frequency
- Package length (1-3 months)
- Total sessions
- Pricing breakdown
- Payment details
- Down payment
- Split payment flag

### Contracts Table
Stores finalized training contracts with:
- Quote reference
- Contract number
- Training package details
- Payment schedule
- Status tracking
- Signature date

## Notes
- All prices are in **CAD (Canadian Dollars)**
- Tax rate is **15% HST** (New Brunswick)
- Credit card processing fee is **3.5%**
- Maximum package length is **3 months**
- Maximum participants per session is **3**
- Sessions calculated using **4.33 weeks per month** average

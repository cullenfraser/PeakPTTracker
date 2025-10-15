import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Calculator, Users, DollarSign } from 'lucide-react'

const MAX_PARTICIPANTS = 4

type CalculatorFormData = {
  startDate: string
  participants: number
  frequency: string
  packageLength: number
  paymentMethod: string
  paymentSchedule: string
  downPayment: number
  discountPercent: number
  splitPayment: boolean
}

const FREQUENCY_OPTIONS = [
  { value: 'once_month', label: 'Once a Month (x1/month)', sessionsPerWeek: 0.25, pricePerSession: 85.00 },
  { value: 'bi_weekly', label: 'Every 2 Weeks (Bi-weekly)', sessionsPerWeek: 0.5, pricePerSession: 85.00 },
  { value: 'once_week', label: 'Once a Week (x1/week)', sessionsPerWeek: 1, pricePerSession: 85.00 },
  { value: 'twice_week', label: 'Twice a Week (x2/week)', sessionsPerWeek: 2, pricePerSession: 80.00 },
  { value: 'three_week', label: 'Three a Week (x3/week)', sessionsPerWeek: 3, pricePerSession: 75.00 },
  { value: 'four_week', label: 'Four a Week (x4/week)', sessionsPerWeek: 4, pricePerSession: 75.00 },
  { value: 'five_week', label: 'Five a Week (x5/week)', sessionsPerWeek: 5, pricePerSession: 75.00 },
]

const PACKAGE_LENGTH_OPTIONS = [
  { value: 1, label: 'Month to Month' },
  { value: 2, label: '2 Months' },
  { value: 3, label: '3 Months' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', processingFee: 0 },
  { value: 'emt', label: 'EMT (E-Transfer)', processingFee: 0 },
  { value: 'credit_card', label: 'Credit Card (+3.5% fee)', processingFee: 3.5 },
]

const PAYMENT_SCHEDULES = [
  { value: 'full', label: 'Pay in Full' },
  { value: 'monthly', label: 'Equal Monthly Payments' },
  { value: 'bi_weekly', label: 'Equal Bi-Weekly Payments' },
]

const STORAGE_KEY = 'calculator_form_data'

const getDefaultFormData = (): CalculatorFormData => ({
  startDate: new Date().toISOString().split('T')[0],
  participants: 1,
  frequency: 'once_week',
  packageLength: 1,
  paymentMethod: 'cash',
  paymentSchedule: 'full',
  downPayment: 0,
  discountPercent: 0,
  splitPayment: false,
})

const clampParticipants = (value: number) => {
  if (Number.isNaN(value) || value < 1) return 1
  if (value > MAX_PARTICIPANTS) return MAX_PARTICIPANTS
  return value
}

export default function CalculatorPage() {
  const { toast } = useToast()
  const navigate = useNavigate()

  // Load form data from localStorage on mount
  const [formData, setFormData] = useState<CalculatorFormData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const fallback = getDefaultFormData()
        return {
          ...fallback,
          ...parsed,
        }
      } catch (e) {
        return getDefaultFormData()
      }
    }
    return getDefaultFormData()
  })

  const [calculatedTotal, setCalculatedTotal] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<any>(null)

  const taxPercent = 15 // HST in New Brunswick

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
  }, [formData])

  useEffect(() => {
    setCalculatedTotal(null)
    setBreakdown(null)
  }, [formData])

  const calculatePricing = () => {
    const selectedFrequency = FREQUENCY_OPTIONS.find((f) => f.value === formData.frequency)!
    const selectedPaymentMethod = PAYMENT_METHODS.find((p) => p.value === formData.paymentMethod)!

    // Calculate total sessions
    const weeksInPackage = formData.packageLength * 4.33 // Average weeks per month
    const totalSessions = Math.round(selectedFrequency.sessionsPerWeek * weeksInPackage)

    // Base price per session for 1 participant
    const basePricePerSession = selectedFrequency.pricePerSession

    // Add $15 per session for each additional participant
    const additionalParticipantFee = Math.max(0, formData.participants - 1) * 15
    const pricePerSessionBeforeDiscount = basePricePerSession + additionalParticipantFee

    const discountPercent = Math.min(Math.max(formData.discountPercent || 0, 0), 100)
    const discountPerSession = pricePerSessionBeforeDiscount * (discountPercent / 100)
    const pricePerSession = pricePerSessionBeforeDiscount - discountPerSession

    // Subtotals
    const subtotalBeforeDiscount = pricePerSessionBeforeDiscount * totalSessions
    const discountAmount = discountPerSession * totalSessions
    const subtotal = subtotalBeforeDiscount - discountAmount

    // Tax
    const taxAmount = subtotal * (taxPercent / 100)
    
    // Total before processing fee
    const totalBeforeFee = subtotal + taxAmount
    
    // Processing fee (only for credit card)
    const processingFee = totalBeforeFee * (selectedPaymentMethod.processingFee / 100)
    
    // Grand total
    const grandTotal = totalBeforeFee + processingFee
    
    // Amount after down payment
    const amountAfterDownPayment = grandTotal - formData.downPayment
    
    // Calculate payment amounts based on schedule
    let paymentAmount = amountAfterDownPayment
    let numberOfPayments = 1

    if (formData.paymentSchedule === 'monthly') {
      numberOfPayments = formData.packageLength
      paymentAmount = amountAfterDownPayment / numberOfPayments
    } else if (formData.paymentSchedule === 'bi_weekly') {
      numberOfPayments = Math.max(1, Math.round(formData.packageLength * 2.17))
      paymentAmount = amountAfterDownPayment / numberOfPayments
    }
    
    // If split payment, divide by participants
    const perPersonPayment = formData.splitPayment ? paymentAmount / formData.participants : paymentAmount

    return {
      totalSessions,
      basePricePerSession,
      pricePerSessionBeforeDiscount,
      discountPerSession,
      pricePerSession,
      additionalParticipantFee,
      subtotalBeforeDiscount,
      discountPercent,
      discountAmount,
      subtotal,
      taxAmount,
      processingFee,
      grandTotal,
      downPayment: formData.downPayment,
      amountAfterDownPayment,
      paymentAmount,
      perPersonPayment,
      numberOfPayments,
    }
  }

  const handleCalculate = () => {
    const calc = calculatePricing()
    setBreakdown(calc)
    setCalculatedTotal(calc.grandTotal)
    toast({
      title: 'Calculated',
      description: `Total: ${formatCurrency(calc.grandTotal)}`,
    })
  }

  const handleContinue = () => {
    if (!calculatedTotal || !breakdown) {
      toast({
        title: 'Calculation required',
        description: 'Please calculate the quote before continuing.',
        variant: 'destructive',
      })
      return
    }

    navigate('/contract/clients', {
      state: {
        formData,
        breakdown,
        total: calculatedTotal,
      },
    })
  }

  // Auto-calculate pricing whenever form data changes
  const calc = useMemo(() => {
    return calculatePricing()
  }, [
    formData.participants,
    formData.frequency,
    formData.packageLength,
    formData.paymentMethod,
    formData.paymentSchedule,
    formData.downPayment,
    formData.discountPercent,
    formData.splitPayment
  ])

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <Calculator className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Training Package Calculator</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Package Details</CardTitle>
              <CardDescription>Configure training package</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participants">
                  <Users className="inline h-4 w-4 mr-1" />
                  Participants (1-4)
                </Label>
                <Input
                  id="participants"
                  type="number"
                  min="1"
                  max={MAX_PARTICIPANTS}
                  value={formData.participants}
                  onChange={(e) => setFormData({ ...formData, participants: clampParticipants(parseInt(e.target.value)) })}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.participants > 1 ? `+${formatCurrency(15.00)} per session for multiple participants` : 'Base pricing for 1 participant'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequency">Training Frequency</Label>
                <Select
                  id="frequency"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                >
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {formatCurrency(option.pricePerSession)}/session
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="packageLength">Package Length</Label>
                <Select
                  id="packageLength"
                  value={formData.packageLength.toString()}
                  onChange={(e) => setFormData({ ...formData, packageLength: parseInt(e.target.value) })}
                >
                  {PACKAGE_LENGTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium">Total Sessions: {calc.totalSessions}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {formData.packageLength} month(s) at selected frequency
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Options</CardTitle>
              <CardDescription>Configure payment details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select
                  id="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </Select>
                {formData.paymentMethod === 'credit_card' && (
                  <p className="text-xs text-muted-foreground">
                    +{formatCurrency(calc.processingFee)} processing fee
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentSchedule">Payment Schedule</Label>
                <Select
                  id="paymentSchedule"
                  value={formData.paymentSchedule}
                  onChange={(e) => setFormData({ ...formData, paymentSchedule: e.target.value })}
                >
                  {PAYMENT_SCHEDULES.map((schedule) => (
                    <option key={schedule.value} value={schedule.value}>
                      {schedule.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="downPayment">
                  <DollarSign className="inline h-4 w-4 mr-1" />
                  Down Payment (Optional)
                </Label>
                <Input
                  id="downPayment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.downPayment}
                  onChange={(e) => setFormData({ ...formData, downPayment: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountPercent">Apply Discount (%)</Label>
                <Input
                  id="discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.discountPercent}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value)
                    setFormData({
                      ...formData,
                      discountPercent: Number.isNaN(value) ? 0 : value,
                    })
                  }}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Discount is applied to each session price (e.g., 2.5 for 2.5%).</p>
              </div>
              {formData.participants > 1 && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="splitPayment"
                    checked={formData.splitPayment}
                    onChange={(e) => setFormData({ ...formData, splitPayment: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="splitPayment" className="cursor-pointer">
                    Split payment equally between {formData.participants} participants
                  </Label>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Price Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Price Breakdown</CardTitle>
            <CardDescription>Detailed cost calculation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Sessions:</span>
                  <span>{calc.totalSessions} sessions</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Base price per session:</span>
                  <span>{formatCurrency(calc.basePricePerSession)}</span>
                </div>
                {formData.participants > 1 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Additional participant fee ({formData.participants - 1} × {formatCurrency(15)}):</span>
                    <span>+{formatCurrency(calc.additionalParticipantFee)}</span>
                  </div>
                )}
                {calc.discountPercent > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Discount per session ({calc.discountPercent}%):</span>
                    <span>-{formatCurrency(calc.discountPerSession)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium">
                  <span>Price per session ({formData.participants} participant{formData.participants > 1 ? 's' : ''}):</span>
                  <span>{formatCurrency(calc.pricePerSession)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium pt-2 border-t">
                  <span>Subtotal before discount:</span>
                  <span>{formatCurrency(calc.subtotalBeforeDiscount)}</span>
                </div>
                {calc.discountPercent > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Discount ({calc.discountPercent}%):</span>
                    <span>-{formatCurrency(calc.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(calc.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>HST ({taxPercent}%):</span>
                  <span>{formatCurrency(calc.taxAmount)}</span>
                </div>
                {calc.processingFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Processing Fee (3.5%):</span>
                    <span>{formatCurrency(calc.processingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t text-primary">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(calc.grandTotal)}</span>
                </div>
              </div>

              <div className="space-y-3">
                {formData.downPayment > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Down Payment:</span>
                      <span className="text-primary">-{formatCurrency(calc.downPayment)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Amount After Down Payment:</span>
                      <span>{formatCurrency(calc.amountAfterDownPayment)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span>Payment Schedule:</span>
                  <span className="capitalize">{formData.paymentSchedule.replace('_', ' ')}</span>
                </div>
                {formData.paymentSchedule !== 'full' && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Number of Payments:</span>
                      <span>{calc.numberOfPayments}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Payment Amount:</span>
                      <span>{formatCurrency(calc.paymentAmount)}</span>
                    </div>
                  </>
                )}
                {formData.splitPayment && formData.participants > 1 && (
                  <div className="flex justify-between text-lg font-bold pt-2 border-t text-primary">
                    <span>Per Person Payment:</span>
                    <span>{formatCurrency(calc.perPersonPayment)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={handleCalculate} size="lg">
                <Calculator className="h-4 w-4 mr-2" />
                Calculate
              </Button>
              {calculatedTotal && (
                <Button onClick={handleContinue} size="lg" variant="secondary">
                  Continue
                </Button>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

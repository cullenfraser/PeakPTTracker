import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { createSquareCustomer, createSquareInvoice, SquareClientError } from '@/lib/squareClient'
import { DollarSign, Loader2 } from 'lucide-react'

interface SquareInvoiceModalProps {
  open: boolean
  onClose: () => void
  contractData: {
    id: string
    customer_name: string
    customer_email: string | null
    customer_phone: string | null
    first_name?: string | null
    last_name?: string | null
    address_line1?: string | null
    address_line2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    country?: string | null
    company_name?: string | null
    date_of_birth?: string | null
    total_amount: number
    payment_amount: number
    payment_schedule: string
    payment_method: string
    down_payment: number
    total_sessions: number
    frequency: string
    start_date: string
    end_date: string
    square_customer_id?: string | null
    square_invoice_id?: string | null
    square_payment_link?: string | null
  }
}

export default function SquareInvoiceModal({ open, onClose, contractData }: SquareInvoiceModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: contractData.first_name || contractData.customer_name.split(' ')[0] || '',
    lastName: contractData.last_name || contractData.customer_name.split(' ').slice(1).join(' ') || '',
    email: contractData.customer_email || '',
    phone: contractData.customer_phone || '',
    addressLine1: contractData.address_line1 || '',
    addressLine2: contractData.address_line2 || '',
    city: contractData.city || '',
    province: contractData.province || 'NB',
    postalCode: contractData.postal_code || '',
    country: contractData.country || 'CA',
    companyName: contractData.company_name || '',
  })

  const handleCreateInvoice = async () => {
    if (!formData.email) {
      toast({
        title: 'Error',
        description: 'Email is required to send invoice',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      let squareCustomerId = contractData.square_customer_id ?? null

      if (!squareCustomerId) {
        const customer = await createSquareCustomer({
          givenName: formData.firstName,
          familyName: formData.lastName || undefined,
          emailAddress: formData.email,
          phoneNumber: formData.phone || undefined,
          companyName: formData.companyName || undefined,
          address: {
            addressLine1: formData.addressLine1 || undefined,
            addressLine2: formData.addressLine2 || undefined,
            locality: formData.city || undefined,
            administrativeDistrictLevel1: formData.province || undefined,
            postalCode: formData.postalCode || undefined,
            country: formData.country || undefined,
          },
        })
        squareCustomerId = customer.id
      }

      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          square_customer_id: squareCustomerId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          customer_email: formData.email,
          customer_phone: formData.phone,
          address_line1: formData.addressLine1,
          address_line2: formData.addressLine2,
          city: formData.city,
          province: formData.province,
          postal_code: formData.postalCode,
          country: formData.country,
          company_name: formData.companyName,
        })
        .eq('id', contractData.id)

      if (updateError) throw updateError

      const lineItems = [
        {
          name: `Training Package - ${contractData.total_sessions} sessions`,
          quantity: 1,
          amount: contractData.total_amount,
          currency: 'CAD',
          note: `Frequency: ${contractData.frequency.replace('_', ' ')}`,
        },
      ]

      const paymentRequests = []
      if (contractData.down_payment && contractData.down_payment > 0) {
        paymentRequests.push({
          requestType: 'DEPOSIT' as const,
          dueDate: contractData.start_date,
          fixedAmount: contractData.down_payment,
        })
      }

      paymentRequests.push({
        requestType: 'BALANCE' as const,
        dueDate: contractData.payment_schedule === 'full' ? contractData.start_date : contractData.end_date,
      })

      const invoiceResult = await createSquareInvoice({
        customerId: squareCustomerId,
        lineItems,
        paymentRequests,
        title: `Training Contract ${contractData.id.slice(0, 8)}`,
        description: `Personal training package (${contractData.total_sessions} sessions)` ,
        deliveryMethod: 'EMAIL',
        sendInvoice: true,
      })

      const invoice = invoiceResult.invoice
      const invoiceId = invoice?.id

      if (!invoiceId) {
        throw new Error('Square invoice did not return an ID')
      }

      const paymentLink = (invoice as unknown as { publicUrl?: string }).publicUrl ?? null

      const { error: invoiceUpdateError } = await supabase
        .from('contracts')
        .update({
          square_invoice_id: invoiceId,
          square_payment_link: paymentLink,
        })
        .eq('id', contractData.id)

      if (invoiceUpdateError) throw invoiceUpdateError

      toast({
        title: 'Success',
        description: `Square customer synced and invoice sent to ${formData.email}`,
      })

      onClose()
    } catch (error: any) {
      const message = error instanceof SquareClientError ? error.message : error?.message || 'Failed to create Square invoice'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Create Square Invoice
          </DialogTitle>
          <DialogDescription>
            Review and confirm customer information before creating Square invoice
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Personal Information */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Personal Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="addressLine1">Address Line 1</Label>
                <Input
                  id="addressLine1"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="addressLine2">Address Line 2</Label>
                <Input
                  id="addressLine2"
                  value={formData.addressLine2}
                  onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="province">Province</Label>
                <Input
                  id="province"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="postalCode">Postal Code</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold text-sm">Invoice Summary</h3>
            <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Package:</span>
                <span className="font-medium">{contractData.total_sessions} Training Sessions</span>
              </div>
              <div className="flex justify-between">
                <span>Frequency:</span>
                <span className="font-medium">{contractData.frequency.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Schedule:</span>
                <span className="font-medium">{contractData.payment_schedule.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span className="font-medium">{contractData.payment_method.replace('_', ' ')}</span>
              </div>
              {contractData.down_payment > 0 && (
                <div className="flex justify-between">
                  <span>Down Payment:</span>
                  <span className="font-medium">${contractData.down_payment.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total Amount:</span>
                <span>${contractData.total_amount.toFixed(2)}</span>
              </div>
              {contractData.payment_schedule !== 'full' && (
                <div className="flex justify-between text-primary">
                  <span>Payment Amount:</span>
                  <span className="font-medium">${contractData.payment_amount.toFixed(2)} {contractData.payment_schedule === 'monthly' ? 'monthly' : 'bi-weekly'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={onClose} variant="outline" disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreateInvoice} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Create Invoice & Send
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

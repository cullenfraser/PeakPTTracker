import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { Plus, Loader2 } from 'lucide-react'

interface TrainerOption {
  id: string
  first_name: string
  last_name: string
  calendar_color?: string
}

interface AddSessionModalProps {
  open: boolean
  onClose: () => void
  onSessionAdded: () => void
  selectedDate?: Date
  selectedTrainerId?: string
  isAdmin: boolean
  trainers?: TrainerOption[]
}

export default function AddSessionModal({ 
  open, 
  onClose, 
  onSessionAdded, 
  selectedDate,
  selectedTrainerId,
  isAdmin,
  trainers = [],
}: AddSessionModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    trainerId: selectedTrainerId || '',
    clientIds: [] as string[],
    sessionDate: selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    sessionType: '1_on_1',
    classType: '',
    team: '',
    notes: '',
  })

  useEffect(() => {
    if (!open) return

    // When modal opens, ensure trainer selection defaults appropriately
    setFormData((prev) => ({
      ...prev,
      trainerId: selectedTrainerId || prev.trainerId,
      sessionDate: selectedDate ? selectedDate.toISOString().split('T')[0] : prev.sessionDate,
    }))
  }, [open, selectedTrainerId, selectedDate])

  useEffect(() => {
    if (!open) return
    if (!formData.trainerId) {
      setClients([])
      return
    }
    if (formData.sessionType === '1_on_1' || formData.sessionType === 'small_group') {
      fetchClientsForTrainer(formData.trainerId)
    } else {
      setClients([])
    }
  }, [open, formData.trainerId, formData.sessionType])

  const fetchClientsForTrainer = async (trainerId: string) => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, customer_name, customer_email')
        .eq('trainer_id', trainerId)
        .eq('status', 'active')
        .order('customer_name')

      if (error) throw error
      setClients(data || [])
    } catch (error: any) {
      console.error('Error fetching clients:', error)
      toast({
        title: 'Error',
        description: 'Failed to load clients for the selected trainer',
        variant: 'destructive',
      })
    }
  }

  const handleSubmit = async () => {
    if (!formData.trainerId) {
      toast({
        title: 'Error',
        description: 'Please select a trainer',
        variant: 'destructive',
      })
      return
    }

    if ((formData.sessionType === '1_on_1' || formData.sessionType === 'small_group') && formData.clientIds.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one client for 1 on 1 or Small Group sessions',
        variant: 'destructive',
      })
      return
    }

    if (formData.sessionType === 'peak_class' && !formData.classType) {
      toast({
        title: 'Error',
        description: 'Please select a Class Type for Peak Class sessions',
        variant: 'destructive',
      })
      return
    }

    if (formData.sessionType === 'pfa_team' && !formData.team) {
      toast({
        title: 'Error',
        description: 'Please enter a Team name for PFA Team sessions',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      const sessionDateTime = `${formData.sessionDate}T${formData.startTime}:00`

      const trainingPayload: Database['public']['Tables']['training_sessions']['Insert'] = {
        trainer_id: formData.trainerId,
        session_date: sessionDateTime,
        start_time: formData.startTime,
        end_time: formData.endTime,
        session_type: formData.sessionType,
        status: 'scheduled',
        notes: formData.notes || null,
        class_type: formData.sessionType === 'peak_class' ? (formData.classType || null) : null,
        team: formData.sessionType === 'pfa_team' ? (formData.team || null) : null,
        participant_ids: (formData.sessionType === '1_on_1' || formData.sessionType === 'small_group') ? formData.clientIds : null,
      }

      const { error } = await supabase
        .from('training_sessions')
        .insert([trainingPayload])

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Training session added successfully',
      })

      onSessionAdded()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add session',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleClient = (clientId: string) => {
    setFormData(prev => {
      const isSelected = prev.clientIds.includes(clientId)
      
      if (isSelected) {
        // Remove client
        return {
          ...prev,
          clientIds: prev.clientIds.filter(id => id !== clientId)
        }
      } else {
        // Add client, but enforce max 4
        if (prev.clientIds.length >= 4) {
          toast({
            title: 'Maximum Participants Reached',
            description: 'You can select up to 4 participants per session.',
            variant: 'destructive',
          })
          return prev
        }
        return {
          ...prev,
          clientIds: [...prev.clientIds, clientId]
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Training Session
          </DialogTitle>
          <DialogDescription>
            Schedule a new training session
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trainer">Trainer *</Label>
            <Select
              id="trainer"
              value={formData.trainerId}
              onChange={(e) => {
                const value = e.target.value
                setFormData({
                  ...formData,
                  trainerId: value,
                  clientIds: [],
                })
                if (value) {
                  fetchClientsForTrainer(value)
                } else {
                  setClients([])
                }
              }}
              disabled={!isAdmin && !!selectedTrainerId}
            >
              <option value="">Select Trainer</option>
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.first_name} {trainer.last_name}
                </option>
              ))}
            </Select>
            {!formData.trainerId && (
              <p className="text-xs text-muted-foreground">Select a trainer to load associated clients.</p>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Input
                id="sessionDate"
                type="date"
                value={formData.sessionDate}
                onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time *</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              />
            </div>
          </div>

          {/* Session Type */}
          <div className="space-y-2">
            <Label htmlFor="sessionType">Session Type *</Label>
            <Select
              id="sessionType"
              value={formData.sessionType}
              onChange={(e) => setFormData({ ...formData, sessionType: e.target.value, classType: '', team: '' })}
            >
              <option value="1_on_1">1 on 1</option>
              <option value="small_group">Small Group</option>
              <option value="peak_class">Peak Class</option>
              <option value="pfa_class">PFA Class</option>
              <option value="pfa_team">PFA Team</option>
              <option value="meeting">Meeting</option>
              <option value="tasks">Tasks</option>
              <option value="onboarding">Onboarding</option>
              <option value="general">General</option>
            </Select>
          </div>

          {/* Class Type - Only for Peak Class */}
          {formData.sessionType === 'peak_class' && (
            <div className="space-y-2">
              <Label htmlFor="classType">Class Type *</Label>
              <Select
                id="classType"
                value={formData.classType}
                onChange={(e) => setFormData({ ...formData, classType: e.target.value })}
              >
                <option value="">Select Class Type</option>
                <option value="bootcamp">Bootcamp</option>
                <option value="barbell_strength">Barbell Strength</option>
                <option value="boga">Boga</option>
                <option value="peakrox">PeakRox</option>
                <option value="muscle_building">Muscle Building</option>
                <option value="glutes_abs">Glutes & Abs</option>
                <option value="strength_sweat">Strength & Sweat</option>
              </Select>
            </div>
          )}

          {/* Team - Only for PFA Team */}
          {formData.sessionType === 'pfa_team' && (
            <div className="space-y-2">
              <Label htmlFor="team">Team *</Label>
              <Input
                id="team"
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                placeholder="Enter team name"
              />
            </div>
          )}

          {/* Client Selection - Only for 1 on 1 and Small Group */}
          {(formData.sessionType === '1_on_1' || formData.sessionType === 'small_group') && (
            <div className="space-y-2">
              <Label>Clients * (Select 1-4 participants) - {formData.clientIds.length}/4 selected</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active clients found</p>
              ) : (
                clients.map((client) => (
                  <div key={client.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`client-${client.id}`}
                      checked={formData.clientIds.includes(client.id)}
                      onChange={() => toggleClient(client.id)}
                      className="rounded"
                    />
                    <Label htmlFor={`client-${client.id}`} className="cursor-pointer flex-1">
                      {client.customer_name}
                      {client.customer_email && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({client.customer_email})
                        </span>
                      )}
                    </Label>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.clientIds.length} client(s) selected
            </p>
          </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this session..."
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={onClose} variant="outline" disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Session
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

interface AttendanceModalProps {
  open: boolean
  onClose: () => void
  session: any
  onUpdate: () => void
}

export default function AttendanceModal({ open, onClose, session, onUpdate }: AttendanceModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [sessionStatus, setSessionStatus] = useState('scheduled')

  useEffect(() => {
    if (session && open) {
      // Initialize attendance for all participants
      const initialAttendance: Record<string, string> = {}
      session.participant_ids?.forEach((id: string) => {
        initialAttendance[id] = 'present'
      })
      setAttendance(initialAttendance)
      setNotes(session.notes || '')
      setSessionStatus(session.status || 'scheduled')
    }
  }, [session, open])

  const handleSubmit = async () => {
    try {
      setLoading(true)

      const { error } = await supabase
        .from('training_sessions')
        .update({
          status: sessionStatus,
          attendance_data: attendance,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Attendance updated successfully',
      })

      onUpdate()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update attendance',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getParticipantName = (participantId: string) => {
    // This would ideally fetch from a participants table
    // For now, return the ID or a placeholder
    return `Participant ${participantId.slice(0, 8)}`
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Session Attendance
          </DialogTitle>
          <DialogDescription>
            Mark attendance and update session status
          </DialogDescription>
        </DialogHeader>

        {session && (
          <div className="space-y-4">
            {/* Session Info */}
            <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
              <div><strong>Date:</strong> {new Date(session.session_date).toLocaleDateString()}</div>
              <div><strong>Time:</strong> {session.start_time} - {session.end_time}</div>
              <div><strong>Type:</strong> {session.session_type?.replace('_', ' ')}</div>
            </div>

            {/* Session Status */}
            <div className="space-y-2">
              <Label>Session Status</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sessionStatus === 'completed' ? 'default' : 'outline'}
                  onClick={() => setSessionStatus('completed')}
                  className="w-full"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completed
                </Button>
                <Button
                  variant={sessionStatus === 'cancelled' ? 'destructive' : 'outline'}
                  onClick={() => setSessionStatus('cancelled')}
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelled
                </Button>
                <Button
                  variant={sessionStatus === 'late_cancellation' ? 'default' : 'outline'}
                  onClick={() => setSessionStatus('late_cancellation')}
                  className="w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Late Cancel
                </Button>
                <Button
                  variant={sessionStatus === 'no_show' ? 'default' : 'outline'}
                  onClick={() => setSessionStatus('no_show')}
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  No Show
                </Button>
              </div>
            </div>

            {/* Participant Attendance */}
            <div className="space-y-2">
              <Label>Participant Attendance</Label>
              <div className="space-y-3">
                {session.participant_ids?.map((participantId: string) => (
                  <div key={participantId} className="border rounded-lg p-3">
                    <div className="font-medium mb-2">{getParticipantName(participantId)}</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'present' ? 'default' : 'outline'}
                        onClick={() => setAttendance({ ...attendance, [participantId]: 'present' })}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'absent' ? 'destructive' : 'outline'}
                        onClick={() => setAttendance({ ...attendance, [participantId]: 'absent' })}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Absent
                      </Button>
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'late' ? 'default' : 'outline'}
                        onClick={() => setAttendance({ ...attendance, [participantId]: 'late' })}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Late
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="sessionNotes">Session Notes</Label>
              <Textarea
                id="sessionNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this session..."
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
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Attendance
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

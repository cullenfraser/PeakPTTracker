import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function RequireTrainer({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [trainerOk, setTrainerOk] = useState<boolean | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setTrainerOk(false)
        return
      }
      // Allow admins
      const { data: adminRow, error: adminErr } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!adminErr && adminRow?.id) {
        setTrainerOk(true)
        return
      }
      // Or trainers
      const { data: trainerRow, error: trainerErr } = await supabase
        .from('trainers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (trainerErr) {
        setTrainerOk(false)
        return
      }
      setTrainerOk(!!trainerRow?.id)
    }
    if (!loading) void run()
  }, [user?.id, loading])

  if (loading || trainerOk === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-top-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  if (!trainerOk) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

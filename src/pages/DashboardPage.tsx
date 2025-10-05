import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import AdminDashboardPage from './AdminDashboardPage'
import TrainerDashboard from './TrainerDashboard'

export default function DashboardPage() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUserRole()
  }, [user])

  const checkUserRole = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      // Check if admin - don't use .single() to avoid error on no rows
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)

      // If we got data and no error, user is admin
      if (adminData && adminData.length > 0 && !error) {
        console.log('User is admin:', adminData)
        setIsAdmin(true)
      } else {
        console.log('User is not admin')
        setIsAdmin(false)
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  // Trainers see the dashboard, admins should not access this route
  return <TrainerDashboard />
}

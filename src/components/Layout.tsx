import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { Calculator, Clock, LogOut, Users, Calendar, Shield, LayoutDashboard, Menu, X, Bell, Activity } from 'lucide-react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  type NotificationRow = Database['public']['Tables']['invoice_notifications']['Row']
  const [notifications, setNotifications] = useState<NotificationRow[]>([])

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
      setMobileNavOpen(false)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const toggleMobileNav = () => setMobileNavOpen(prev => !prev)
  const closeMobileNav = () => setMobileNavOpen(false)

  // Admin/Trainer context
  useEffect(() => {
    const fetchContext = async () => {
      if (!user?.id) {
        setIsAdmin(false)
        setCurrentTrainerId(null)
        return
      }
      try {
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', user.id)

        if (adminError) throw adminError

        if (adminData && adminData.length > 0) {
          setIsAdmin(true)
          setCurrentTrainerId(null)
          return
        }

        const { data: trainerRow, error: trainerError } = await supabase
          .from('trainers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (trainerError) throw trainerError
        setIsAdmin(false)
        setCurrentTrainerId(trainerRow?.id ?? null)
      } catch (error) {
        console.error('Failed to resolve user context', error)
        setIsAdmin(false)
        setCurrentTrainerId(null)
      }
    }

    void fetchContext()
  }, [user?.id])

  const unreadCount = notifications.length

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([])
      return
    }

    try {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('invoice_notifications')
          .select('id, created_at, status, message, contract_id, invoice_instance_id, read_at, metadata')
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error
        setNotifications(data ?? [])
        return
      }

      if (currentTrainerId) {
        const { data: contractRows, error: contractError } = await supabase
          .from('contracts')
          .select('id')
          .eq('trainer_id', currentTrainerId)

        if (contractError) throw contractError
        const contractIds = (contractRows ?? []).map(row => row.id)
        if (contractIds.length === 0) {
          setNotifications([])
          return
        }

        const { data, error } = await supabase
          .from('invoice_notifications')
          .select('id, created_at, status, message, contract_id, invoice_instance_id, read_at, metadata')
          .is('read_at', null)
          .in('contract_id', contractIds)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error
        setNotifications(data ?? [])
        return
      }

      setNotifications([])
    } catch (error) {
      console.error('Failed to load notifications', error)
    }
  }, [user?.id, isAdmin, currentTrainerId])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    const channel = supabase
      .channel('invoice_notifications_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_notifications' }, () => {
        void loadNotifications()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadNotifications])

  const markAllRead = async () => {
    if (notifications.length === 0) return
    const ids = notifications.map(n => n.id)
    try {
      const { error } = await supabase
        .from('invoice_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
      setNotifications([])
    } catch (error) {
      console.error('Failed to mark notifications read', error)
    }
  }

  const markRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invoice_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (error) {
      console.error('Failed to mark notification read', error)
    }
  }

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/calculator', label: 'Calculator', icon: Calculator },
    { path: '/clients', label: 'Clients', icon: Users },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
    ...((isAdmin || currentTrainerId) ? [{ path: '/elevate', label: 'Elevate', icon: Activity }] as const : []),
    { path: '/admin', label: 'Admin', icon: Shield },
    { path: '/hours', label: 'Hours', icon: Clock },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleMobileNav}
                className="md:hidden inline-flex items-center justify-center rounded-md border border-input p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition"
                aria-label="Toggle navigation"
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <h1 className="text-xl md:text-2xl font-bold text-primary whitespace-nowrap">Peak Fitness Dieppe</h1>
              <nav className="hidden md:flex space-x-2 lg:space-x-4">
                {navItems.map(item => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={closeMobileNav}
                      className={`flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="relative">
                <Button variant="outline" size="icon" onClick={() => setNotifOpen(v => !v)} aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-400 text-black text-xs font-semibold">
                    {unreadCount}
                  </span>
                )}
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-card border rounded-md shadow-lg z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-sm font-semibold">Notifications</span>
                      <Button variant="ghost" size="sm" onClick={markAllRead} disabled={notifications.length === 0}>Mark all read</Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No unread notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className="px-3 py-2 border-b flex items-start gap-2">
                            <div className="mt-1"><Bell className="h-3 w-3" /></div>
                            <div className="flex-1">
                              <div className="text-sm">{n.message}</div>
                              <div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button onClick={handleSignOut} variant="outline" size="sm" className="inline-flex">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
            <div className="sm:hidden flex items-center gap-2">
              <div className="relative">
                <Button variant="outline" size="icon" onClick={() => setNotifOpen(v => !v)} aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-400 text-black text-xs font-semibold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <Button onClick={handleSignOut} variant="outline" size="icon">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div
          className={`md:hidden fixed inset-x-0 top-[72px] z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b transition-transform ${
            mobileNavOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <nav className="container mx-auto px-4 py-4 space-y-2">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileNav}
                className={`flex items-center justify-between rounded-lg border px-3 py-3 text-base transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </div>
                {location.pathname === item.path && <span className="text-xs uppercase tracking-wide">Current</span>}
              </Link>
            ))}
            <Button onClick={handleSignOut} variant="secondary" className="w-full" size="lg">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-24 md:py-8 md:pb-8">{children}</main>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex justify-around items-stretch">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileNav}
                className={`flex flex-col items-center justify-center gap-1 py-2 w-full text-xs font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? '' : 'opacity-80'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Calculator, Clock, LogOut, Users, Calendar, Shield, LayoutDashboard, Menu, X } from 'lucide-react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/calculator', label: 'Calculator', icon: Calculator },
    { path: '/clients', label: 'Clients', icon: Users },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
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
            <Button onClick={handleSignOut} variant="outline" size="sm" className="hidden sm:inline-flex">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
            <Button onClick={handleSignOut} variant="outline" size="icon" className="sm:hidden">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div
          className={`md:hidden fixed inset-x-0 top-[72px] z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b transition-transform ${
            mobileNavOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <nav className="container mx-auto px-4 py-4 space-y-2">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMobileNav}
                  className={`flex items-center justify-between rounded-lg border px-3 py-3 text-base transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <span className="text-xs uppercase tracking-wide">Current</span>}
                </Link>
              )
            })}
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

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Users, Search, Filter, Download } from 'lucide-react'

interface Client {
  id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  status: string
  total_sessions: number
  completed_sessions: number
  start_date: string
  end_date: string | null
  trainer_name?: string
}

export default function ClientsPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdminStatus()
  }, [user])

  useEffect(() => {
    filterClients()
  }, [searchTerm, statusFilter, clients])

  const checkAdminStatus = async () => {
    if (!user) return

    try {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (adminData && adminData.length > 0) {
        setIsAdmin(true)
        fetchAllClients()
      } else {
        setIsAdmin(false)
        fetchTrainerClients()
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllClients = async () => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id,
          customer_name,
          customer_email,
          customer_phone,
          status,
          total_sessions,
          start_date,
          end_date,
          trainers(first_name, last_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedClients = data?.map((contract: any) => ({
        id: contract.id,
        customer_name: contract.customer_name,
        customer_email: contract.customer_email,
        customer_phone: contract.customer_phone,
        status: contract.status,
        total_sessions: contract.total_sessions || 0,
        completed_sessions: 0, // TODO: Calculate from training_sessions
        start_date: contract.start_date,
        end_date: contract.end_date,
        trainer_name: contract.trainers 
          ? `${contract.trainers.first_name} ${contract.trainers.last_name}`
          : 'Unassigned',
      })) || []

      setClients(formattedClients)
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchTrainerClients = async () => {
    if (!user) return

    try {
      // Get trainer ID
      const { data: trainerData } = await supabase
        .from('trainers')
        .select('id')
        .eq('user_id', user.id)

      if (!trainerData || trainerData.length === 0) return

      const trainerId = trainerData[0].id

      // Get contracts for this trainer
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedClients = data?.map((contract: any) => ({
        id: contract.id,
        customer_name: contract.customer_name,
        customer_email: contract.customer_email,
        customer_phone: contract.customer_phone,
        status: contract.status,
        total_sessions: contract.total_sessions || 0,
        completed_sessions: 0, // TODO: Calculate from training_sessions
        start_date: contract.start_date,
        end_date: contract.end_date,
      })) || []

      setClients(formattedClients)
    } catch (error) {
      console.error('Error fetching trainer clients:', error)
    }
  }

  const filterClients = () => {
    let filtered = [...clients]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(client =>
        client.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.customer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.customer_phone?.includes(searchTerm)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => client.status === statusFilter)
    }

    setFilteredClients(filtered)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Status', 'Total Sessions', 'Completed', 'Start Date', 'End Date']
    if (isAdmin) headers.push('Trainer')

    const csvContent = [
      headers.join(','),
      ...filteredClients.map(client => [
        client.customer_name,
        client.customer_email || '',
        client.customer_phone || '',
        client.status,
        client.total_sessions,
        client.completed_sessions,
        client.start_date,
        client.end_date || '',
        ...(isAdmin ? [client.trainer_name || ''] : [])
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <p>Loading clients...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">
              {isAdmin ? 'All Clients' : 'My Clients'}
            </h1>
          </div>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Clients</CardTitle>
            <CardDescription>Search and filter your client list</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {filteredClients.length} of {clients.length} clients
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>Client List</CardTitle>
            <CardDescription>
              {isAdmin ? 'All clients across all trainers' : 'Your past and present clients'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredClients.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No clients found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Name</th>
                      <th className="text-left p-3 font-semibold">Contact</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Sessions</th>
                      <th className="text-left p-3 font-semibold">Dates</th>
                      {isAdmin && <th className="text-left p-3 font-semibold">Trainer</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div className="font-medium">{client.customer_name}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">{client.customer_email}</div>
                          <div className="text-sm text-muted-foreground">{client.customer_phone}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(client.status)}`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">
                            {client.completed_sessions} / {client.total_sessions}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">
                            {new Date(client.start_date).toLocaleDateString()}
                          </div>
                          {client.end_date && (
                            <div className="text-sm text-muted-foreground">
                              to {new Date(client.end_date).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="p-3">
                            <div className="text-sm">{client.trainer_name}</div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

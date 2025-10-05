import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { Clock, Calendar } from 'lucide-react'
import type { Database } from '@/types/database'

type Hours = Database['public']['Tables']['hours']['Row']

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export default function HoursPage() {
  const { toast } = useToast()
  const [hours, setHours] = useState<Hours[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHours()
  }, [])

  const fetchHours = async () => {
    try {
      // RLS will ensure users can only read hours data
      const { data, error } = await supabase
        .from('hours')
        .select('*')
        .order('date', { ascending: true })

      if (error) throw error

      setHours(data || [])
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load hours',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (time: string) => {
    try {
      const [hours, minutes] = time.split(':')
      const hour = parseInt(hours)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const displayHour = hour % 12 || 12
      return `${displayHour}:${minutes} ${ampm}`
    } catch {
      return time
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const groupHoursByWeek = () => {
    const grouped: { [key: string]: Hours[] } = {}
    
    hours.forEach((hour) => {
      const date = new Date(hour.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = []
      }
      grouped[weekKey].push(hour)
    })

    return grouped
  }

  const getCurrentWeekHours = () => {
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    return hours.filter((hour) => {
      const date = new Date(hour.date)
      return date >= weekStart && date < weekEnd
    })
  }

  const getRegularHours = () => {
    // Group by day of week to show regular hours
    const regularHours: { [key: string]: Hours[] } = {}
    
    DAYS_OF_WEEK.forEach((day) => {
      regularHours[day] = []
    })

    hours.forEach((hour) => {
      if (regularHours[hour.day_of_week]) {
        regularHours[hour.day_of_week].push(hour)
      }
    })

    return regularHours
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading hours...</p>
          </div>
        </div>
      </Layout>
    )
  }

  const currentWeekHours = getCurrentWeekHours()
  const regularHours = getRegularHours()

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <Clock className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Gym Hours</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Current Week Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span>This Week</span>
              </CardTitle>
              <CardDescription>Current week operating hours</CardDescription>
            </CardHeader>
            <CardContent>
              {currentWeekHours.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hours scheduled for this week
                </p>
              ) : (
                <div className="space-y-3">
                  {currentWeekHours.map((hour) => (
                    <div
                      key={hour.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                    >
                      <div>
                        <p className="font-medium">{hour.day_of_week}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(hour.date)}</p>
                      </div>
                      <div className="text-right">
                        {hour.is_closed ? (
                          <p className="text-destructive font-medium">Closed</p>
                        ) : (
                          <>
                            <p className="font-medium">
                              {formatTime(hour.opening_time)} - {formatTime(hour.closing_time)}
                            </p>
                            {hour.notes && (
                              <p className="text-xs text-muted-foreground">{hour.notes}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Regular Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>Regular Hours</span>
              </CardTitle>
              <CardDescription>Standard weekly operating hours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DAYS_OF_WEEK.map((day) => {
                  const dayHours = regularHours[day]
                  const mostRecentHour = dayHours[dayHours.length - 1]

                  return (
                    <div
                      key={day}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                    >
                      <p className="font-medium">{day}</p>
                      <div className="text-right">
                        {mostRecentHour ? (
                          mostRecentHour.is_closed ? (
                            <p className="text-destructive font-medium">Closed</p>
                          ) : (
                            <p className="font-medium">
                              {formatTime(mostRecentHour.opening_time)} -{' '}
                              {formatTime(mostRecentHour.closing_time)}
                            </p>
                          )
                        ) : (
                          <p className="text-muted-foreground">Not set</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* All Hours History */}
        {hours.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Hours History</CardTitle>
              <CardDescription>Complete history of operating hours (read-only)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Day</th>
                      <th className="text-left py-3 px-4">Opening</th>
                      <th className="text-left py-3 px-4">Closing</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((hour) => (
                      <tr key={hour.id} className="border-b hover:bg-accent/50">
                        <td className="py-3 px-4">{formatDate(hour.date)}</td>
                        <td className="py-3 px-4">{hour.day_of_week}</td>
                        <td className="py-3 px-4">
                          {hour.is_closed ? '-' : formatTime(hour.opening_time)}
                        </td>
                        <td className="py-3 px-4">
                          {hour.is_closed ? '-' : formatTime(hour.closing_time)}
                        </td>
                        <td className="py-3 px-4">
                          {hour.is_closed ? (
                            <span className="text-destructive font-medium">Closed</span>
                          ) : (
                            <span className="text-primary font-medium">Open</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {hour.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {hours.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">No hours data available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Hours information will appear here once added to the system
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}

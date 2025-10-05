import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield } from 'lucide-react'

export default function AdminPage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
            <CardDescription>
              Admin management and payroll dashboard is under development
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This page will provide:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-muted-foreground">
              <li>Bird's-eye view of all trainers and clients</li>
              <li>Trainer performance metrics</li>
              <li>Payroll management (weekly, bi-weekly, monthly)</li>
              <li>Session tracking and completion rates</li>
              <li>Revenue analytics</li>
              <li>Trainer pay calculations (per session, hourly, salary)</li>
              <li>Commission and bonus tracking</li>
              <li>Payment approval workflow</li>
              <li>Export payroll reports</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

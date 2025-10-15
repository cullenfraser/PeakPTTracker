import type { Database } from '@/types/database'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ParticipantContractRow = Database['public']['Tables']['participant_contracts']['Row']

type EmailResponse = {
  ok?: boolean
  emailsSent?: { participantId: string; email: string }[]
  error?: string
}

type EmailParticipantContractsOptions = {
  contract: ContractRow
  participants: ParticipantContractRow[]
}

export async function emailParticipantContracts({
  contract,
  participants,
}: EmailParticipantContractsOptions): Promise<EmailResponse> {
  if (!contract || !participants?.length) {
    return { ok: false, error: 'Missing contract or participants' }
  }

  try {
    const response = await fetch('/.netlify/functions/emailParticipantContracts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contract,
        participantContracts: participants,
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      return { ok: false, error: message || `Email function returned ${response.status}` }
    }

    const data = (await response.json()) as EmailResponse
    return data
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to email participant contracts' }
  }
}

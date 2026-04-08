import { useEffect, useState } from 'react'
import { AuthDialog } from './AuthDialog'

// Detects ?invite=<token> in the URL and opens the registration dialog with
// that invite. After a successful consume, strips the parameter from the URL
// so a refresh doesn't try to use the same (now-spent) token.
export function InviteHandler() {
  const [invite, setInvite] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')
    if (token) setInvite(token)
  }, [])

  if (!invite) return null

  const clearFromUrl = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url.toString())
  }

  return (
    <AuthDialog
      inviteToken={invite}
      onClose={() => { setInvite(null); clearFromUrl() }}
      onSuccess={() => { setInvite(null); clearFromUrl() }}
    />
  )
}

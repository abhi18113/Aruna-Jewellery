
import App from './App'
import Admin from './Admin'
import VisitorGate from './VisitorGate'

export default function Root() {
  const isAdminPage = window.location.pathname.startsWith('/admin')

  // The owner dashboard keeps its existing login flow.
  if (isAdminPage) {
    return <Admin />
  }

  // Every public catalogue route requires visitor details.
  return (
    <VisitorGate>
      <App />
    </VisitorGate>
  )
}

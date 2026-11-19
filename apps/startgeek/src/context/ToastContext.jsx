import { useCallback, useMemo, useState } from 'react'
import Toast from '../components/Toast'
import { normalizeToast } from '../lib/feedback'
import { ToastContext } from './toastContextValue'

// One toast for the whole console, so the command box and a ticked task
// speak through the same live region and never stack two pills.

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const notify = useCallback((input) => setToast(normalizeToast(input)), [])
  const dismiss = useCallback(() => setToast(null), [])
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast toast={toast} onClose={dismiss} />
    </ToastContext.Provider>
  )
}

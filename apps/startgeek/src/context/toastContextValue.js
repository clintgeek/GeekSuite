import { createContext } from 'react'

// One toast for the whole console (ToastContext.jsx).
export const ToastContext = createContext({ notify: () => {}, dismiss: () => {} })

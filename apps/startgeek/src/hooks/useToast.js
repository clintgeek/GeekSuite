import { useContext } from 'react'
import { ToastContext } from '../context/toastContextValue'

export const useToast = () => useContext(ToastContext)

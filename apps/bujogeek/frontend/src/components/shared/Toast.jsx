import { createContext, useContext, useState, useCallback } from 'react';
import { Box, Typography, Button, IconButton } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { colors } from '../../theme/colors';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const iconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colorMap = {
  success: colors.aging.fresh,
  error: colors.aging.overdue,
  info: colors.primary[500],
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ message, type = 'info', undoAction, duration = 3000 }) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, undoAction }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info') => {
    return addToast({ message, type });
  }, [addToast]);

  toast.success = (message, opts) => addToast({ message, type: 'success', ...opts });
  toast.error = (message, opts) => addToast({ message, type: 'error', ...opts });
  toast.info = (message, opts) => addToast({ message, type: 'info', ...opts });

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container */}
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 24 },
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = iconMap[t.type] || Info;
            const accentColor = colorMap[t.type] || colors.primary[500];

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{ pointerEvents: 'auto' }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    backgroundColor: colors.ink[900],
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    boxShadow: `0 8px 24px ${colors.ink[900]}60`,
                    minWidth: 240,
                    maxWidth: 400,
                  }}
                >
                  <Icon size={18} color={accentColor} style={{ flexShrink: 0 }} />
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      flex: 1,
                    }}
                  >
                    {t.message}
                  </Typography>
                  {t.undoAction && (
                    <Button
                      size="small"
                      onClick={() => {
                        t.undoAction();
                        removeToast(t.id);
                      }}
                      sx={{
                        color: accentColor,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        minWidth: 'auto',
                        px: 1,
                        py: 0.25,
                        '&:hover': {
                          backgroundColor: `${accentColor}20`,
                          transform: 'none',
                        },
                      }}
                    >
                      Undo
                    </Button>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => removeToast(t.id)}
                    sx={{
                      color: colors.ink[400],
                      p: 0.25,
                      '&:hover': { color: '#FFFFFF' },
                    }}
                  >
                    <X size={14} />
                  </IconButton>
                </Box>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Box>
    </ToastContext.Provider>
  );
};

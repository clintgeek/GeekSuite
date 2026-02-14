import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Snackbar, Alert } from "@mui/material";

const NotificationsContext = createContext({
  notify: () => {},
  showSuccess: () => {},
  showError: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export default function NotificationsProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({
    message: "",
    severity: "info",
    duration: 3000,
  });

  const notify = useCallback((opts) => {
    const { message, severity = "info", duration = 3000 } = opts || {};
    setState({ message, severity, duration });
    setOpen(true);
  }, []);
  const showSuccess = useCallback(
    (msg) => notify({ message: msg, severity: "success" }),
    [notify],
  );
  const showError = useCallback(
    (msg) => notify({ message: msg, severity: "error" }),
    [notify],
  );

  const ctx = useMemo(
    () => ({ notify, showSuccess, showError }),
    [notify, showSuccess, showError],
  );

  return (
    <NotificationsContext.Provider value={ctx}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={state.duration}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={state.severity}
          variant="filled"
          onClose={() => setOpen(false)}
          sx={{ width: "100%" }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </NotificationsContext.Provider>
  );
}

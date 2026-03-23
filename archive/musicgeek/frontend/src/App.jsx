import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { UserProgressProvider } from './context/UserProgressContext';
import { InstrumentProvider } from './context/InstrumentContext';
import { ThemeProvider } from './context/ThemeContext';
import { router } from './router';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UserProgressProvider>
          <InstrumentProvider>
            <RouterProvider router={router} />
          </InstrumentProvider>
        </UserProgressProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

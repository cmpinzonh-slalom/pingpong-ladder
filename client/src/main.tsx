import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

const theme = createTheme({
  palette: {
    primary: { main: '#0c62fb' },
    secondary: { main: '#ff6b2c' },
    background: { default: '#f5f7fb' },
  },
  shape: { borderRadius: 10 },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

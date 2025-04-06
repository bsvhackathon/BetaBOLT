// src/theme/index.ts
'use client';
import { createTheme } from '@mui/material/styles';

// Create a theme instance
const theme = createTheme({
  // Your theme customization here
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    // Add other customizations as needed
  },
});

export default theme;
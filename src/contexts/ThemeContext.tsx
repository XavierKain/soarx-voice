import React, {createContext, useContext, useState, useCallback, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getColors, ThemeColors, ThemeMode} from '../theme';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = '@soarx_theme';

export function ThemeProvider({children}: {children: ReactNode}) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  // Load saved preference
  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') {
        setMode(saved);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = {
    mode,
    colors: getColors(mode),
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

import React, {createContext, useContext, useState, useEffect, useCallback, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clé de stockage persistant du nom pilote
const STORAGE_KEY = '@soarx_pilot_name';

interface UserContextValue {
  pilotName: string;
  setPilotName: (name: string) => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({children}: {children: ReactNode}) {
  const [pilotName, setPilotNameState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Chargement du nom pilote depuis le stockage local au démarrage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved) {
          setPilotNameState(saved);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Mise à jour du nom pilote en mémoire et en stockage persistant
  const setPilotName = useCallback((name: string) => {
    setPilotNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  return (
    <UserContext.Provider value={{pilotName, setPilotName, isLoading}}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

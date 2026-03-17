import React, {useState} from 'react';
import {StatusBar, View, LogBox} from 'react-native';

LogBox.ignoreAllLogs();
import {UserProvider} from './src/contexts/UserContext';
import {AgoraProvider} from './src/contexts/AgoraContext';
import {ThemeProvider, useTheme} from './src/contexts/ThemeContext';
import {HomeScreen} from './src/screens/HomeScreen';
import {VoiceScreen} from './src/screens/VoiceScreen';
import {BLESetupScreen} from './src/screens/BLESetupScreen';

type Screen = 'home' | 'voice' | 'bleSetup';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('home');
  const {colors} = useTheme();

  return (
    <View style={{flex: 1, backgroundColor: colors.bg}}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      {screen === 'home' && (
        <HomeScreen
          onJoined={() => setScreen('voice')}
          onBLESetup={() => setScreen('bleSetup')}
        />
      )}
      {screen === 'voice' && (
        <VoiceScreen onLeft={() => setScreen('home')} />
      )}
      {screen === 'bleSetup' && (
        <BLESetupScreen onDone={() => setScreen('home')} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <AgoraProvider>
          <AppContent />
        </AgoraProvider>
      </UserProvider>
    </ThemeProvider>
  );
}

import React, {useState} from 'react';
import {StatusBar, StyleSheet, View, LogBox} from 'react-native';

LogBox.ignoreAllLogs();
import {UserProvider} from './src/contexts/UserContext';
import {AgoraProvider} from './src/contexts/AgoraContext';
import {HomeScreen} from './src/screens/HomeScreen';
import {VoiceScreen} from './src/screens/VoiceScreen';
import {BLESetupScreen} from './src/screens/BLESetupScreen';
import {colors} from './src/theme';

type Screen = 'home' | 'voice' | 'bleSetup';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('home');
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.backgroundTop} />
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
    <UserProvider>
      <AgoraProvider>
        <AppContent />
      </AgoraProvider>
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundTop },
});

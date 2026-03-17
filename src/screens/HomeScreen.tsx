import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, PermissionsAndroid} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useUser} from '../contexts/UserContext';
import {generateChannelName, isValidChannelName} from '../utils/channelGenerator';
import {useAgoraContext} from '../contexts/AgoraContext';
import {colors, fonts, spacing} from '../theme';

const FAVORITES_KEY = '@soarx_favorite_channels';
const DEFAULT_CHANNEL = 'TARIFA-01';

interface HomeScreenProps {
  onJoined: () => void;
  onBLESetup: () => void;
}

export function HomeScreen({onJoined, onBLESetup}: HomeScreenProps) {
  const {pilotName, setPilotName} = useUser();
  const {joinChannel} = useAgoraContext();
  const [channel, setChannel] = useState(DEFAULT_CHANNEL);
  const [isJoining, setIsJoining] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const canJoin = pilotName.trim().length > 0 && isValidChannelName(channel);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then(saved => {
      if (saved) {
        setFavorites(JSON.parse(saved));
      }
    });
  }, []);

  const saveFavorites = useCallback((newFavs: string[]) => {
    setFavorites(newFavs);
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavs));
  }, []);

  const toggleFavorite = useCallback(() => {
    const name = channel.trim().toUpperCase();
    if (!name) return;
    if (favorites.includes(name)) {
      saveFavorites(favorites.filter(f => f !== name));
    } else {
      saveFavorites([name, ...favorites]);
    }
  }, [channel, favorites, saveFavorites]);

  const isFavorite = favorites.includes(channel.trim().toUpperCase());

  const handleGenerateChannel = () => { setChannel(generateChannelName()); };

  const requestMicPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        { title: 'Microphone Permission', message: 'SoarX Voice needs microphone access for in-flight communication.', buttonPositive: 'Allow' },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const handleJoin = async () => {
    if (!canJoin || isJoining) return;
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert('Permission Required', 'SoarX Voice needs microphone access to work. Please enable it in Settings.');
      return;
    }
    setIsJoining(true);
    try {
      await joinChannel({channelName: channel, pilotName});
      onJoined();
    } catch (error) {
      Alert.alert('Connection Error', 'Unable to join channel. Please check your connection.');
      setIsJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>SOAR<Text style={styles.titleX}>X</Text></Text>
        <Text style={styles.subtitle}>VOICE</Text>
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>PILOT NAME</Text>
        <TextInput style={styles.input} value={pilotName} onChangeText={setPilotName} placeholder="Your name" placeholderTextColor={colors.textTertiary} autoCapitalize="words" returnKeyType="next" />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>CHANNEL</Text>
        <View style={styles.channelRow}>
          <TextInput style={[styles.input, styles.channelInput]} value={channel} onChangeText={text => setChannel(text.toUpperCase())} placeholder="TARIFA-01" placeholderTextColor={colors.textTertiary} autoCapitalize="characters" maxLength={30} returnKeyType="done" />
          <TouchableOpacity style={styles.favButton} onPress={toggleFavorite}>
            <Text style={styles.favIcon}>{isFavorite ? '★' : '☆'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.generateButton} onPress={handleGenerateChannel}>
            <Text style={styles.generateIcon}>🎲</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Share this code with your group</Text>
      </View>

      {favorites.length > 0 && (
        <View style={styles.favoritesBlock}>
          <Text style={styles.favoritesLabel}>FAVORITES</Text>
          <FlatList
            data={favorites}
            horizontal
            keyExtractor={item => item}
            showsHorizontalScrollIndicator={false}
            renderItem={({item}) => (
              <TouchableOpacity
                style={[styles.favChip, item === channel && styles.favChipActive]}
                onPress={() => setChannel(item)}
                activeOpacity={0.7}>
                <Text style={[styles.favChipText, item === channel && styles.favChipTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.spacer} />
      <TouchableOpacity style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]} onPress={handleJoin} disabled={!canJoin || isJoining} activeOpacity={0.8}>
        <Text style={styles.joinText}>{isJoining ? 'Connecting...' : 'Join Flight'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bleButton} onPress={onBLESetup} activeOpacity={0.7}>
        <Text style={styles.bleButtonText}>Mute Button Setup</Text>
      </TouchableOpacity>
      <Text style={styles.version}>v0.1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl + 20, paddingBottom: spacing.xxl },
  titleBlock: { alignItems: 'center', marginBottom: 48 },
  title: { fontSize: fonts.logo, fontWeight: '800', letterSpacing: 2, color: colors.navy },
  titleX: { color: colors.cyan },
  subtitle: { fontSize: 16, color: colors.cyan, marginTop: 4, letterSpacing: 4, fontWeight: '600' },
  fieldBlock: { marginBottom: spacing.lg },
  label: { fontSize: fonts.label, color: colors.textSecondary, letterSpacing: 1, fontWeight: '600', marginBottom: spacing.sm },
  input: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.cyanBorder, borderRadius: 12, padding: spacing.lg, fontSize: fonts.input, color: colors.navy, fontWeight: '500' },
  channelRow: { flexDirection: 'row', gap: 10 },
  channelInput: { flex: 1 },
  favButton: { backgroundColor: colors.cyanLight, borderWidth: 2, borderColor: 'rgba(0, 188, 212, 0.25)', borderRadius: 12, padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minWidth: 56 },
  favIcon: { fontSize: 20, color: colors.cyan },
  generateButton: { backgroundColor: colors.cyanLight, borderWidth: 2, borderColor: 'rgba(0, 188, 212, 0.25)', borderRadius: 12, padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minWidth: 56 },
  generateIcon: { fontSize: 20 },
  hint: { fontSize: fonts.small, color: colors.textTertiary, marginTop: spacing.sm },
  favoritesBlock: { marginBottom: spacing.md },
  favoritesLabel: { fontSize: fonts.label, color: colors.textSecondary, letterSpacing: 1, fontWeight: '600', marginBottom: spacing.xs },
  favChip: { backgroundColor: 'rgba(0, 188, 212, 0.08)', borderWidth: 1, borderColor: 'rgba(0, 188, 212, 0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  favChipActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  favChipText: { fontSize: 13, fontWeight: '600', color: colors.cyan },
  favChipTextActive: { color: colors.white },
  spacer: { flex: 1 },
  joinButton: { backgroundColor: colors.cyan, borderRadius: 16, padding: spacing.xl, alignItems: 'center', shadowColor: colors.cyan, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  joinButtonDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  joinText: { fontSize: fonts.button, fontWeight: '700', color: colors.white, letterSpacing: 0.5 },
  bleButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignSelf: 'center', marginTop: spacing.md },
  bleButtonText: { color: colors.cyan, fontSize: 14, textDecorationLine: 'underline' },
  version: { textAlign: 'center', marginTop: spacing.lg, fontSize: 11, color: 'rgba(26, 39, 68, 0.2)' },
});

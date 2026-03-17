import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, PermissionsAndroid, StatusBar} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useUser} from '../contexts/UserContext';
import {generateChannelName, isValidChannelName} from '../utils/channelGenerator';
import {useAgoraContext} from '../contexts/AgoraContext';
import {fonts, spacing, radius} from '../theme';
import {useTheme} from '../contexts/ThemeContext';

const FAVORITES_KEY = '@soarx_favorite_channels';
const DEFAULT_CHANNEL = 'TARIFA-01';

interface HomeScreenProps {
  onJoined: () => void;
  onBLESetup: () => void;
}

export function HomeScreen({onJoined, onBLESetup}: HomeScreenProps) {
  const {pilotName, setPilotName} = useUser();
  const {joinChannel} = useAgoraContext();
  const {colors, mode, toggleTheme} = useTheme();
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
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />

      <TouchableOpacity
        style={[styles.themeToggle, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}
        onPress={toggleTheme}
        activeOpacity={0.7}>
        <Text style={styles.themeToggleIcon}>{mode === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}</Text>
      </TouchableOpacity>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, {color: colors.text}]}>
          SOAR
          <Text style={[styles.titleX, {color: colors.primary, textShadowColor: colors.primaryGlow}]}>X</Text>
        </Text>
        <Text style={[styles.subtitle, {color: colors.primary}]}>VOICE</Text>
      </View>

      <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
        <View style={styles.fieldBlock}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>PILOT NAME</Text>
          <TextInput
            style={[styles.input, {backgroundColor: colors.bgInput, borderColor: colors.cardBorder, color: colors.text}]}
            value={pilotName}
            onChangeText={setPilotName}
            placeholder="Your name"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>CHANNEL</Text>
          <View style={styles.channelRow}>
            <TextInput
              style={[styles.input, styles.channelInput, {backgroundColor: colors.bgInput, borderColor: colors.cardBorder, color: colors.text}]}
              value={channel}
              onChangeText={text => setChannel(text.toUpperCase())}
              placeholder="TARIFA-01"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
              maxLength={30}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.iconButton} onPress={toggleFavorite} activeOpacity={0.7}>
              <Text style={[styles.iconButtonText, isFavorite && styles.iconButtonTextActive]}>
                {isFavorite ? '\u2605' : '\u2606'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleGenerateChannel} activeOpacity={0.7}>
              <Text style={styles.iconButtonText}>{'\uD83C\uDFB2'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Share this code with your group</Text>
        </View>
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

      <TouchableOpacity
        style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]}
        onPress={handleJoin}
        disabled={!canJoin || isJoining}
        activeOpacity={0.8}>
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl + 20,
    paddingBottom: spacing.xxl,
  },

  // --- Theme toggle ---
  themeToggle: {
    position: 'absolute',
    top: spacing.xxxl + 10,
    right: spacing.xxl,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  themeToggleIcon: {
    fontSize: 18,
  },

  // --- Title / Logo ---
  titleBlock: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.text,
  },
  titleX: {
    color: colors.primary,
    textShadowColor: colors.primaryGlow,
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 18,
  },
  subtitle: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 8,
    fontWeight: '600',
  },

  // --- Card wrapper ---
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  // --- Fields ---
  fieldBlock: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fonts.label,
    color: colors.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: fonts.input,
    color: colors.text,
    fontWeight: '500',
  },
  channelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  channelInput: {
    flex: 1,
  },
  iconButton: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },
  iconButtonText: {
    fontSize: 20,
    color: colors.primary,
  },
  iconButtonTextActive: {
    color: colors.primary,
    textShadowColor: colors.primaryGlow,
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 8,
  },
  hint: {
    fontSize: fonts.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // --- Favorites ---
  favoritesBlock: {
    marginBottom: spacing.md,
  },
  favoritesLabel: {
    fontSize: fonts.label,
    color: colors.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  favChip: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  favChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  favChipText: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  favChipTextActive: {
    color: colors.white,
  },

  // --- Bottom area ---
  spacer: {
    flex: 1,
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  joinButtonDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
    elevation: 0,
  },
  joinText: {
    fontSize: fonts.button,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },
  bleButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  bleButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  version: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: fonts.xs,
    color: colors.textDim,
  },
});

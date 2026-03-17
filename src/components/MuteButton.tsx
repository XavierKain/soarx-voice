import React from 'react';
import {TouchableOpacity, Text, View, StyleSheet} from 'react-native';
import {colors} from '../theme';

interface MuteButtonProps {
  isMuted: boolean;
  onPress: () => void;
}

export function MuteButton({isMuted, onPress}: MuteButtonProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isMuted ? styles.muted : styles.active]}
        onPress={onPress}
        activeOpacity={0.8}>
        <Text style={styles.icon}>{isMuted ? '🔇' : '🎙️'}</Text>
        <Text style={styles.label}>{isMuted ? 'MUTED' : 'LIVE'}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        {isMuted ? 'Tap to unmute' : 'Tap to mute'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: 'rgba(0, 188, 212, 0.3)',
  },
  muted: {
    backgroundColor: colors.red,
    shadowColor: colors.red,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  icon: {
    fontSize: 32,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
  },
});

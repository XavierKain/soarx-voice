import React, {useEffect, useRef} from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';

const colors = {
  primary: '#0EA5E9',
  primaryGlow: 'rgba(14, 165, 233, 0.40)',
  red: '#EF4444',
  redGlow: 'rgba(239, 68, 68, 0.40)',
  white: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  bgCard: '#1E293B',
  cyan: '#0EA5E9',
};

const radius = {full: 9999};

const BUTTON_SIZE = 140;

interface MuteButtonProps {
  isMuted: boolean;
  onPress: () => void;
}

export function MuteButton({isMuted, onPress}: MuteButtonProps) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!isMuted) {
      const animation = Animated.loop(
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.55,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => {
        animation.stop();
        pulseScale.setValue(1);
        pulseOpacity.setValue(0.6);
      };
    } else {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0);
    }
  }, [isMuted, pulseScale, pulseOpacity]);

  const stateColor = isMuted ? colors.red : colors.primary;
  const stateGlow = isMuted ? colors.redGlow : colors.primaryGlow;

  return (
    <View style={styles.container}>
      <View style={styles.buttonWrapper}>
        {/* Pulse ring - only visible when live */}
        {!isMuted && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                borderColor: stateColor,
                transform: [{scale: pulseScale}],
                opacity: pulseOpacity,
              },
            ]}
          />
        )}

        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: stateColor,
              shadowColor: stateColor,
            },
          ]}
          onPress={onPress}
          activeOpacity={0.75}>
          <View
            style={[
              styles.innerHighlight,
              {
                borderColor: isMuted
                  ? 'rgba(255, 255, 255, 0.10)'
                  : 'rgba(255, 255, 255, 0.18)',
              },
            ]}>
            <Text style={styles.icon}>{isMuted ? '🔇' : '🎙️'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, {color: stateColor}]}>
        {isMuted ? 'MUTED' : 'LIVE'}
      </Text>
      <Text style={styles.hint}>
        {isMuted ? 'Tap to unmute' : 'Tap to mute'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  buttonWrapper: {
    width: BUTTON_SIZE + 40,
    height: BUTTON_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.full,
    borderWidth: 3,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  innerHighlight: {
    width: BUTTON_SIZE - 12,
    height: BUTTON_SIZE - 12,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 44,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
});

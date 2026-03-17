import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../contexts/ThemeContext';
import {fonts, radius} from '../theme';

export function ChannelBadge() {
  const {colors} = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: colors.bgCard, borderColor: 'rgba(34, 197, 94, 0.25)'},
      ]}>
      <Animated.View
        style={[styles.dot, {opacity: pulseAnim, backgroundColor: colors.green}]}
      />
      <Text style={[styles.text, {color: colors.green}]}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: fonts.label,
    fontWeight: '700',
  },
});

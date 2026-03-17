import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, fonts} from '../theme';

export function ChannelBadge() {
  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  text: {
    fontSize: fonts.label,
    fontWeight: '700',
    color: colors.green,
  },
});

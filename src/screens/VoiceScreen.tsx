import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useAgoraContext} from '../contexts/AgoraContext';
import {useUser} from '../contexts/UserContext';
import {useMute} from '../hooks/useMute';
import {useBluetoothHID} from '../hooks/useBluetoothHID';
import {MuteButton} from '../components/MuteButton';
import {PilotList} from '../components/PilotList';
import {ChannelBadge} from '../components/ChannelBadge';
import {colors, fonts, spacing} from '../theme';

interface VoiceScreenProps {
  onLeft: () => void;
}

export function VoiceScreen({onLeft}: VoiceScreenProps) {
  const {channelName, remotePilots, leaveChannel, connectionState, isSpeakerOn, toggleSpeaker} = useAgoraContext();
  const {pilotName} = useUser();
  const {isMuted, toggle} = useMute();
  useBluetoothHID(toggle);

  const handleLeave = () => {
    Alert.alert('Leave Flight', 'Are you sure you want to leave this channel?', [
      {text: 'Cancel', style: 'cancel'},
      { text: 'Leave', style: 'destructive', onPress: async () => { await leaveChannel(); onLeft(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.channelLabel}>Channel</Text>
          <Text style={styles.channelName}>{channelName}</Text>
        </View>
        {connectionState === 'connected' && <ChannelBadge />}
        {connectionState === 'reconnecting' && <Text style={styles.reconnecting}>Reconnecting...</Text>}
      </View>
      <PilotList remotePilots={remotePilots} localPilotName={pilotName} isMuted={isMuted} />
      <View style={styles.controls}>
        <MuteButton isMuted={isMuted} onPress={toggle} />
        <TouchableOpacity
          style={[styles.speakerButton, isSpeakerOn && styles.speakerButtonActive]}
          onPress={toggleSpeaker}
          activeOpacity={0.7}>
          <Text style={styles.speakerIcon}>{isSpeakerOn ? '🔊' : '🔈'}</Text>
          <Text style={[styles.speakerText, isSpeakerOn && styles.speakerTextActive]}>
            {isSpeakerOn ? 'Speaker' : 'Earpiece'}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
        <Text style={styles.leaveText}>Leave Flight</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.xxxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  channelLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  channelName: { fontSize: fonts.title, fontWeight: '800', letterSpacing: 1, color: colors.navy },
  reconnecting: { fontSize: fonts.label, fontWeight: '600', color: '#ff9800' },
  controls: { alignItems: 'center' },
  speakerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: spacing.md,
  },
  speakerButtonActive: { backgroundColor: 'rgba(0,188,212,0.15)' },
  speakerIcon: { fontSize: 18, marginRight: 6 },
  speakerText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  speakerTextActive: { color: colors.cyan },
  leaveButton: { padding: spacing.md, marginBottom: spacing.xxl },
  leaveText: { textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.red },
});

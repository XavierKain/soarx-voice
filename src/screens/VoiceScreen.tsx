import React from 'react';
import {View, Text, TouchableOpacity, Pressable, StyleSheet, Alert} from 'react-native';
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
  const {channelName, remotePilots, leaveChannel, connectionState} = useAgoraContext();
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
    <Pressable style={styles.container} onPress={toggle}>
      <View style={styles.header}>
        <View>
          <Text style={styles.channelLabel}>Channel</Text>
          <Text style={styles.channelName}>{channelName}</Text>
        </View>
        {connectionState === 'connected' && <ChannelBadge />}
        {connectionState === 'reconnecting' && <Text style={styles.reconnecting}>Reconnecting...</Text>}
      </View>
      <PilotList remotePilots={remotePilots} localPilotName={pilotName} isMuted={isMuted} />
      <MuteButton isMuted={isMuted} onPress={toggle} />
      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
        <Text style={styles.leaveText}>Leave Flight</Text>
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.xxxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  channelLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  channelName: { fontSize: fonts.title, fontWeight: '800', letterSpacing: 1, color: colors.navy },
  reconnecting: { fontSize: fonts.label, fontWeight: '600', color: '#ff9800' },
  leaveButton: { padding: spacing.md, marginBottom: spacing.xxl },
  leaveText: { textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.red },
});

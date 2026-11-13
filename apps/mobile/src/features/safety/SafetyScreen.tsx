import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import type {DangerZone, EmergencyContact, EmergencyExit} from '@campusar/shared';
import {api, ApiError} from '../../api/api';
import {useActiveSite} from '../../hooks/useActiveSite';
import {useAuthStore} from '../../stores/authStore';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

export function SafetyScreen() {
  const token = useAuthStore(s => s.accessToken);
  const {latLon} = useActiveSite();
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [exits, setExits] = useState<EmergencyExit[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [sosMsg, setSosMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([api.zones(), api.exits(), api.contacts()]).then(([z, e, c]) => {
      setZones(z);
      setExits(e);
      setContacts(c);
    });
  }, []);

  function triggerSos() {
    setSending(true);
    setSosMsg(null);
    Geolocation.getCurrentPosition(
      async pos => {
        try {
          const res = await api.sos(
            {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              message: 'SOS from CampusAR mobile',
            },
            token,
          );
          setSosMsg(res.message);
        } catch (err) {
          setSosMsg(err instanceof ApiError ? err.message : 'SOS failed');
        } finally {
          setSending(false);
        }
      },
      async () => {
        try {
          const res = await api.sos(
            {latitude: latLon.lat, longitude: latLon.lon, message: 'SOS from CampusAR mobile'},
            token,
          );
          setSosMsg(res.message);
        } catch (err) {
          setSosMsg(err instanceof ApiError ? err.message : 'SOS failed');
        } finally {
          setSending(false);
        }
      },
      {enableHighAccuracy: true, timeout: 8000},
    );
  }

  return (
    <ScreenChrome title="Safety" subtitle="Hazard zones, exits, and emergency contacts">
      <Pressable style={styles.sos} onPress={triggerSos} disabled={sending}>
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.sosText}>SOS</Text>
        )}
      </Pressable>
      {sosMsg ? <Text style={styles.sosMsg}>{sosMsg}</Text> : null}
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.section}>Danger zones</Text>
        {zones.map(z => (
          <Text key={z.id} style={styles.card}>
            {z.name} · {z.type}
            {'\n'}
            {z.description}
          </Text>
        ))}
        <Text style={styles.section}>Emergency exits</Text>
        {exits.map(e => (
          <Text key={e.id} style={styles.card}>
            {e.name} · {e.buildingId ?? 'Campus'}
          </Text>
        ))}
        <Text style={styles.section}>Contacts</Text>
        {contacts.map(c => (
          <Text key={c.id} style={styles.card}>
            {c.name} · {c.phone}
          </Text>
        ))}
      </ScrollView>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  sos: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.accentDanger,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  sosText: {color: '#fff', fontWeight: '700', fontSize: 16},
  sosMsg: {margin: 16, color: colors.accentDanger},
  pad: {padding: 16, paddingBottom: 40},
  section: {fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 12, marginBottom: 8},
  card: {
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.paperRaised,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.inkMute,
    fontSize: 14,
  },
});

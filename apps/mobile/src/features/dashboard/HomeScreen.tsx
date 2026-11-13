import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useAuthStore} from '../../stores/authStore';

type Props = {
  onOpenArMeasure: () => void;
};

export function HomeScreen({onOpenArMeasure}: Props) {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome{user?.name ? `, ${user.name}` : ''}</Text>
      <Text style={styles.body}>
        Use native ARKit / ARCore world tracking for indoor measurements. Map builder and full
        navigation screens are migrated incrementally — web app remains available meanwhile.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onOpenArMeasure}>
        <Text style={styles.primaryText}>Open AR measurement</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={logout}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 24, backgroundColor: '#0f172a'},
  title: {fontSize: 24, fontWeight: '700', color: '#f8fafc', marginBottom: 12},
  body: {color: '#94a3b8', lineHeight: 22, marginBottom: 24},
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {color: '#fff', fontWeight: '600'},
  secondaryBtn: {marginTop: 20, alignItems: 'center'},
  secondaryText: {color: '#93c5fd'},
});

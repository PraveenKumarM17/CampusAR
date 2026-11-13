import React, {useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LandingScreen} from '../features/auth/LandingScreen';
import {MapScreen} from '../features/map/MapScreen';
import {NavigateScreen} from '../features/navigate/NavigateScreen';
import {ArScreen} from '../features/ar/ArScreen';
import {IndoorScreen} from '../features/indoor/IndoorScreen';
import {SafetyScreen} from '../features/safety/SafetyScreen';
import {TwinScreen} from '../features/twin/TwinScreen';
import {AdminScreen} from '../features/admin/AdminScreen';
import {ArMeasurementScreen} from '../features/ar-measurement/ArMeasurementScreen';
import {useSiteBootstrap} from '../hooks/useSiteBootstrap';
import {useAuthStore} from '../stores/authStore';
import {useSiteStore} from '../stores/siteStore';
import {colors} from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs({onOpenArMeasure}: {onOpenArMeasure: () => void}) {
  useSiteBootstrap();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const sites = useSiteStore(s => s.sites);
  const activeSiteId = useSiteStore(s => s.activeSiteId);
  const setActiveSiteId = useSiteStore(s => s.setActiveSiteId);

  return (
    <View style={{flex: 1}}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>CampusAR</Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>
      {sites.length > 1 ? (
        <View style={styles.siteRow}>
          <Text style={styles.siteHint}>Site: </Text>
          {sites.map(s => (
            <Pressable key={s.id} onPress={() => setActiveSiteId(s.id)}>
              <Text
                style={[
                  styles.siteChip,
                  s.id === activeSiteId && styles.siteChipActive,
                ]}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.inkMute,
          tabBarStyle: {backgroundColor: colors.paperRaised, borderTopColor: colors.line},
        }}>
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Navigate" component={NavigateScreen} />
        <Tab.Screen name="AR">
          {() => <ArScreen onOpenNativeMeasure={onOpenArMeasure} />}
        </Tab.Screen>
        <Tab.Screen name="Indoor" component={IndoorScreen} />
        <Tab.Screen name="Safety" component={SafetyScreen} />
        <Tab.Screen name="Twin" component={TwinScreen} />
        {user?.role === 'admin' ? (
          <Tab.Screen name="Admin" component={AdminScreen} />
        ) : null}
      </Tab.Navigator>
    </View>
  );
}

export function AppNavigator() {
  const hydrated = useAuthStore(s => s.hydrated);
  const user = useAuthStore(s => s.user);
  const [authed, setAuthed] = useState(false);
  React.useEffect(() => {
    if (user) setAuthed(true);
    else setAuthed(false);
  }, [user]);
  const [showMeasure, setShowMeasure] = useState(false);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!authed && !user) {
    return <LandingScreen onAuthed={() => setAuthed(true)} />;
  }

  if (showMeasure) {
    return <ArMeasurementScreen onBack={() => setShowMeasure(false)} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="Main">
          {() => <MainTabs onOpenArMeasure={() => setShowMeasure(true)} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper},
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.paperRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  logo: {fontSize: 20, fontWeight: '700', color: colors.ink},
  logout: {color: colors.accent, fontWeight: '600'},
  siteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.paperSoft,
  },
  siteHint: {fontSize: 12, color: colors.inkMute},
  siteChip: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.paperRaised,
    color: colors.ink,
    marginRight: 6,
  },
  siteChipActive: {backgroundColor: colors.accent, color: '#fff'},
});

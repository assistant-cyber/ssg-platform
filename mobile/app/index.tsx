/**
 * Root redirect — sends to (auth) or (app) based on auth state.
 */
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import Colors from '@/constants/Colors';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator color={Colors.white} size="large" />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(app)' : '/(auth)'} />;
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { useEffect } from 'react';
import * as uploadQueue from '@/services/uploadQueue';

export default function RootLayout() {
  useEffect(() => {
    // Initialize upload queue on app start
    uploadQueue.initQueue();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}

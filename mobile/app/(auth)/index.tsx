/**
 * Auth Screen — PIN entry with numeric keypad.
 * Clean SSG branded screen: green gradient, logo mark, PIN dots.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import Colors from '@/constants/Colors';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '→'],
];

export default function AuthScreen() {
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleKey = useCallback(
    async (key: string) => {
      if (loading) return;

      if (key === '⌫') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCode((c) => c.slice(0, -1));
        return;
      }

      if (key === '→') {
        // Submit
        if (code.length < 4) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        }
        await handleSubmit();
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = code + key;
      setCode(next);

      // Auto-submit when 4+ digits entered (adjust for longer PINs if needed)
      if (next.length >= 4) {
        handleSubmit(next);
      }
    },
    [code, loading],
  );

  const handleSubmit = useCallback(
    async (overrideCode?: string) => {
      const submitCode = overrideCode ?? code;
      if (!submitCode || loading) return;

      setLoading(true);
      try {
        await login(submitCode);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(app)');
      } catch (err) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCode('');
        Alert.alert('Invalid Code', 'That access code is not recognized. Try again.');
      } finally {
        setLoading(false);
      }
    },
    [code, loading, login],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo / Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>🏛</Text>
          </View>
          <Text style={styles.brand}>Scottish Stained Glass</Text>
          <Text style={styles.subtitle}>Field Assessment</Text>
        </View>

        {/* PIN indicator dots */}
        <View style={styles.pinArea}>
          <Text style={styles.pinLabel}>Enter your access code</Text>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < code.length && styles.dotFilled,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Numeric keypad */}
        <View style={styles.keypad}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.key,
                    key === '→' && styles.keySubmit,
                    key === '⌫' && styles.keyMuted,
                  ]}
                  onPress={() => handleKey(key)}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  {loading && key === '→' ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.keyText,
                        key === '→' && styles.keySubmitText,
                        key === '⌫' && styles.keyMutedText,
                      ]}
                    >
                      {key}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoIcon: {
    fontSize: 40,
  },
  brand: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.white,
    opacity: 0.8,
  },
  pinArea: {
    alignItems: 'center',
    gap: 20,
  },
  pinLabel: {
    fontSize: 16,
    color: Colors.white,
    opacity: 0.9,
  },
  dots: {
    flexDirection: 'row',
    gap: 16,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.white,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.white,
  },
  keypad: {
    width: '100%',
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  key: {
    width: 80,
    height: 64,
    borderRadius: 14,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 26,
    fontWeight: '500',
    color: Colors.white,
  },
  keySubmit: {
    backgroundColor: Colors.white,
  },
  keySubmitText: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '700',
  },
  keyMuted: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  keyMutedText: {
    color: Colors.white,
    opacity: 0.7,
    fontSize: 22,
  },
});

/**
 * ShorthandHint — collapsible field notes reference card.
 * Pulled from populate_condition_sheet.py documentation.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';

const TOKENS = [
  { token: '1A', desc: 'Window 1, Panel A — put this first' },
  { token: '1', desc: 'Window 1 overall (no panel letter)' },
  { token: 'w0–w5', desc: 'Warping severity (0=none, 5=severe)' },
  { token: 'l0–l5', desc: 'Lead deterioration (0=none, 5=severe)' },
  { token: 'b0–b9', desc: 'Glass breaks count (e.g. b3 = 3 breaks)' },
  { token: 'rot', desc: 'Wood rot present (omit if none)' },
  { token: 'p', desc: 'Failing paint/caulk (omit if none)' },
  { token: '61pc', desc: 'Number of glass pieces' },
  { token: '30x36', desc: 'Panel width × height in inches' },
  { token: 'ov48x96', desc: 'Overall window dimensions' },
];

const EXAMPLE = '1A w2 l1 b0 61pc 30x36';
const EXAMPLE_OVERALL = '1 ov48x96';

export function ShorthandHint() {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.7}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={Colors.primary}
        />
        <Text style={styles.headerText}>Shorthand notation reference</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.primary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>Panel example:  </Text>
            <Text style={styles.exampleCode}>{EXAMPLE}</Text>
          </View>
          <View style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>Overall example:</Text>
            <Text style={styles.exampleCode}>{EXAMPLE_OVERALL}</Text>
          </View>

          <View style={styles.divider} />

          {TOKENS.map((t) => (
            <View key={t.token} style={styles.tokenRow}>
              <Text style={styles.token}>{t.token}</Text>
              <Text style={styles.tokenDesc}>{t.desc}</Text>
            </View>
          ))}

          <View style={styles.divider} />
          <Text style={styles.rubric}>
            Severity rubric: 0–1 = Good · 2 = Fair · 3–5 = Poor
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  exampleLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  exampleCode: {
    fontSize: 13,
    fontFamily: 'monospace' as const,
    fontWeight: '700',
    color: Colors.primaryDark,
    backgroundColor: Colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  tokenRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  token: {
    width: 72,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace' as const,
    color: Colors.primaryDark,
  },
  tokenDesc: {
    flex: 1,
    fontSize: 12,
    color: Colors.textDark,
    lineHeight: 17,
  },
  rubric: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});

export default ShorthandHint;

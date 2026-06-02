/**
 * EstimatePdf — React PDF document for client-side PDF export.
 * Uses @react-pdf/renderer. Import dynamically with { ssr: false }.
 *
 * Brand: Scottish green #83A94B, dark green #5B7A35, charcoal #2C2C2C
 */
import {
  Document, Page, Text, View, StyleSheet, Font, Image,
} from '@react-pdf/renderer';
import type { EstimateState } from './types';
import { lineTotal, subtotal, taxAmount, currency } from './types';

// Register built-in fonts
// @react-pdf/renderer has Helvetica and Times-Roman built in

const SSG_GREEN  = '#83A94B';
const SSG_DARK   = '#5B7A35';
const SSG_LIGHT  = '#E8F0DC';
const CHARCOAL   = '#2C2C2C';
const GRAY_MID   = '#6B7280';
const GRAY_LIGHT = '#F3F4F6';
const WHITE      = '#FFFFFF';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: CHARCOAL,
    backgroundColor: WHITE,
    paddingTop: 0,
    paddingBottom: 48,
    paddingHorizontal: 0,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  headerBar: {
    backgroundColor: SSG_DARK,
    paddingHorizontal: 40,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoBlock: {
    width: 220,
    height: 16,
  },
  estimateLabel: {
    fontFamily: 'Times-Bold',
    fontSize: 28,
    color: SSG_GREEN,
    letterSpacing: -0.5,
  },

  // ── Green accent bar ─────────────────────────────────────────────────────
  accentBar: {
    height: 5,
    backgroundColor: SSG_GREEN,
  },

  // ── Project info block ───────────────────────────────────────────────────
  infoSection: {
    paddingHorizontal: 40,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  infoLeft: {
    flexDirection: 'column',
    gap: 3,
  },
  infoRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 3,
  },
  infoLabel: {
    fontSize: 8,
    color: GRAY_MID,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: CHARCOAL,
  },
  infoMeta: {
    fontSize: 9,
    color: GRAY_MID,
  },

  // ── Table ────────────────────────────────────────────────────────────────
  tableWrap: {
    paddingHorizontal: 40,
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: SSG_DARK,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  thDesc: { flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 0.5 },
  thRight: { width: 56, fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE, textAlign: 'right', letterSpacing: 0.5 },

  // Section row
  sectionRow: {
    flexDirection: 'row',
    backgroundColor: SSG_LIGHT,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 2,
    borderLeftWidth: 3,
    borderLeftColor: SSG_GREEN,
  },
  sectionText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: SSG_DARK,
    flex: 1,
  },

  // Item rows
  itemRowEven: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemRowOdd: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cellDesc: { flex: 1, fontSize: 9.5, color: CHARCOAL },
  cellQty:  { width: 40, textAlign: 'right', fontSize: 9.5, color: GRAY_MID },
  cellUnit: { width: 44, textAlign: 'right', fontSize: 9.5, color: GRAY_MID },
  cellPrice:{ width: 64, textAlign: 'right', fontSize: 9.5, color: CHARCOAL },
  cellTotal:{ width: 72, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: CHARCOAL },

  // ── Totals ───────────────────────────────────────────────────────────────
  totalsBlock: {
    paddingHorizontal: 40,
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalsInner: {
    width: 240,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 10, color: GRAY_MID },
  totalValue: { fontSize: 10, color: CHARCOAL, fontFamily: 'Helvetica-Bold' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    backgroundColor: SSG_DARK,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginTop: 4,
  },
  grandTotalLabel: { fontFamily: 'Times-Bold', fontSize: 13, color: WHITE },
  grandTotalValue: { fontFamily: 'Times-Bold', fontSize: 13, color: SSG_GREEN },

  // ── Notes ────────────────────────────────────────────────────────────────
  notesBlock: {
    paddingHorizontal: 40,
    marginTop: 24,
  },
  notesTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: SSG_DARK,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  notesText: {
    fontSize: 9,
    color: GRAY_MID,
    lineHeight: 1.5,
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SSG_GREEN,
    height: 8,
  },
  footerText: {
    position: 'absolute',
    bottom: 16,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerItem: {
    fontSize: 8,
    color: GRAY_MID,
  },
});

interface Props {
  projectName: string;
  churchName: string;
  address: string;
  date: string;
  estimate: EstimateState;
}

export default function EstimatePdf({
  projectName,
  churchName,
  address,
  date,
  estimate,
}: Props) {
  const sub = subtotal(estimate.lines);
  const tax = taxAmount(sub, estimate.tax_rate, estimate.tax_enabled);
  const grand = sub + tax;
  let itemCount = 0;
  const logoSrc =
    typeof window !== 'undefined'
      ? `${window.location.origin}/brand/ssg-logo-white.png`
      : '/brand/ssg-logo-white.png';

  return (
    <Document
      title={`Estimate — ${churchName || projectName}`}
      author="Scottish Stained Glass"
      subject="Stained Glass Restoration Estimate"
    >
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.headerBar}>
          <View style={s.logoBlock}>
            <Image src={logoSrc} style={s.logoBlock} />
          </View>
          <Text style={s.estimateLabel}>ESTIMATE</Text>
        </View>
        <View style={s.accentBar} />

        {/* Project info */}
        <View style={s.infoSection}>
          <View style={s.infoLeft}>
            <Text style={s.infoLabel}>Prepared for</Text>
            <Text style={s.infoValue}>{churchName || projectName}</Text>
            {address && <Text style={s.infoMeta}>{address}</Text>}
          </View>
          <View style={s.infoRight}>
            <Text style={s.infoLabel}>Date</Text>
            <Text style={s.infoValue}>{date}</Text>
            <Text style={[s.infoLabel, { marginTop: 8 }]}>Project</Text>
            <Text style={s.infoMeta}>{projectName}</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={s.tableWrap}>
          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={s.thDesc}>Description</Text>
            <Text style={s.thRight}>Qty</Text>
            <Text style={s.thRight}>Unit</Text>
            <Text style={s.thRight}>Unit Price</Text>
            <Text style={s.thRight}>Total</Text>
          </View>

          {estimate.lines.map((line) => {
            if (line.type === 'section') {
              return (
                <View key={line._key} style={s.sectionRow}>
                  <Text style={s.sectionText}>{line.description}</Text>
                </View>
              );
            }
            const rowStyle = itemCount++ % 2 === 0 ? s.itemRowEven : s.itemRowOdd;
            const total = lineTotal(line);
            return (
              <View key={line._key} style={rowStyle}>
                <Text style={s.cellDesc}>{line.description}</Text>
                <Text style={s.cellQty}>{line.quantity}</Text>
                <Text style={s.cellUnit}>{line.unit}</Text>
                <Text style={s.cellPrice}>{currency(parseFloat(line.unit_price) || 0)}</Text>
                <Text style={s.cellTotal}>{currency(total)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={s.totalsBlock}>
          <View style={s.totalsInner}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{currency(sub)}</Text>
            </View>
            {estimate.tax_enabled && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>
                  Tax ({estimate.tax_rate}%)
                </Text>
                <Text style={s.totalValue}>{currency(tax)}</Text>
              </View>
            )}
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>Total Due</Text>
              <Text style={s.grandTotalValue}>{currency(grand)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {(estimate.notes || estimate.terms) && (
          <View style={s.notesBlock}>
            {estimate.notes && (
              <>
                <Text style={s.notesTitle}>Notes</Text>
                <Text style={s.notesText}>{estimate.notes}</Text>
              </>
            )}
            {estimate.terms && (
              <>
                <Text style={[s.notesTitle, { marginTop: 12 }]}>Terms & Conditions</Text>
                <Text style={s.notesText}>{estimate.terms}</Text>
              </>
            )}
          </View>
        )}

        {/* Page footer text */}
        <View style={s.footerText} fixed>
          <Text style={s.footerItem}>Scottish Stained Glass — Confidential Estimate</Text>
          <Text style={s.footerItem}>{date}</Text>
        </View>
        <View style={s.footer} fixed />

      </Page>
    </Document>
  );
}

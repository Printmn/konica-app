import React, { memo, useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { deadlineLabel, quantityLabel, workLogRowColor } from '@/features/worklogs/workLogLogic';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { DocType, WorkLog, WorkStatus } from '@/types';
import { effectivePrice, formatCurrency } from '@/utils/price';

/**
 * One job on the work board.
 *
 * The four status buttons behave exactly as in the web build: tapping the
 * active one clears it, and "Тооцоотой" also renders as active when the stored
 * status is the legacy "Болоогүй".
 *
 * Memoised on the log identity — a 30-second sync would otherwise re-render
 * every card on the board.
 */

const STATUS_BUTTONS: { status: WorkStatus; label: string; color: string; fg: string }[] = [
  { status: 'Тооцоотой', label: 'Тооцоо', color: '#ef4444', fg: '#ffffff' },
  { status: 'Болсон аваагүй', label: 'Болсон аваагүй', color: '#f97316', fg: '#ffffff' },
  { status: 'Маргааш авна', label: 'Маргааш', color: '#facc15', fg: '#713f12' },
  { status: 'Болсон', label: 'Болсон', color: '#16a34a', fg: '#ffffff' },
];

const DOC_BUTTONS: { docType: DocType; label: string; tint: string }[] = [
  { docType: 'quotation', label: '📋 Үнийн санал', tint: '#2563eb' },
  { docType: 'invoice', label: '🧾 Нэхэмжлэх', tint: '#2563eb' },
  { docType: 'receipt', label: '💵 Зарлагын баримт', tint: '#64748b' },
];

interface WorkLogCardProps {
  log: WorkLog;
  index: number;
  total: number;
  today: string;
  canEdit: boolean;
  /** Removing a job from the record is a manager's decision, not the counter's. */
  canDelete: boolean;
  onStatusChange: (id: number, status: WorkStatus) => void;
  onEditNote: (log: WorkLog) => void;
  /** Reopens the whole job in the booking form. */
  onEdit: (log: WorkLog) => void;
  onCreateDocument: (log: WorkLog, docType: DocType) => void;
  onDelete: (id: number) => void;
  isDeleteArmed: boolean;
}

function WorkLogCardBase({
  log,
  index,
  total,
  today,
  canEdit,
  canDelete,
  onStatusChange,
  onEditNote,
  onEdit,
  onCreateDocument,
  onDelete,
  isDeleteArmed,
}: WorkLogCardProps): React.JSX.Element {
  const theme = useAppTheme();
  const accent = workLogRowColor(log);
  const count = quantityLabel(log);
  // Gated on the rendered label, not on `deadline` alone: a job can now carry
  // a handover *day* with no time, and testing the time field hid that day
  // completely — the export printed it while the board showed nothing.
  const deadline = deadlineLabel(log);

  const callPhone = useCallback(() => {
    if (log.phone) void Linking.openURL(`tel:${log.phone}`);
  }, [log.phone]);

  const price = effectivePrice(log);

  return (
    <Card accentColor={accent} padded={false}>
      <View style={styles.head}>
        <Text style={[styles.index, { color: theme.custom.mutedText }]}>{total - index}</Text>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={[styles.job, { color: theme.colors.onSurface }]} numberOfLines={2}>
          {log.job}
          {count === '' ? null : (
            <Text style={[styles.count, { color: theme.colors.primary }]}> {count}</Text>
          )}
        </Text>

        {log.date && log.date !== today ? (
          <View style={styles.carryOver}>
            <Text style={styles.carryOverText}>📅 {log.date.slice(5).replace('-', '/')}</Text>
          </View>
        ) : null}

        {canEdit ? (
          <>
            <Pressable
              onPress={() => onEdit(log)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${log.job} засах`}
            >
              <Text style={styles.editIcon}>✏️</Text>
            </Pressable>
            {canDelete ? (
              <Pressable
                onPress={() => onDelete(log.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Устгах"
                style={isDeleteArmed ? styles.deleteArmed : undefined}
              >
                <Text style={isDeleteArmed ? styles.deleteArmedText : styles.deleteIcon}>
                  {isDeleteArmed ? 'Устгах?' : '🗑'}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>

      {canEdit ? (
        <View style={styles.statusRow}>
          {STATUS_BUTTONS.map(({ status, label, color, fg }) => {
            const active =
              log.status === status ||
              (status === 'Тооцоотой' && log.status === 'Болоогүй');
            return (
              <Pressable
                key={status}
                onPress={() => onStatusChange(log.id, active ? '' : status)}
                accessibilityRole="button"
                style={[
                  styles.statusButton,
                  {
                    backgroundColor: active ? color : theme.custom.cardBackground,
                    borderColor: active ? color : theme.colors.outline,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.statusLabel,
                    { color: active ? fg : theme.colors.onSurfaceVariant },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.meta}>
        {log.receivedTime ? <Text style={styles.metaItem}>⏰ {log.receivedTime}</Text> : null}

        {deadline ? (
          <Text style={[styles.metaItem, log.isTomorrow && styles.metaTomorrow]}>
            📅 {deadline}
          </Text>
        ) : null}

        {log.phone ? (
          <Pressable onPress={callPhone} style={styles.phoneRow} accessibilityRole="button">
            <Text style={styles.metaItem}>📞 {log.phone}</Text>
            <View style={[styles.callChip, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.callChipText}>Залгах</Text>
            </View>
          </Pressable>
        ) : null}

        {log.isDelivery ? <Text style={styles.metaItem}>🚗 Хүргэлттэй</Text> : null}

        {log.price ? (
          <View style={styles.priceRow}>
            <Text style={styles.metaItem}>💰 {formatCurrency(price)}</Text>
            {log.hasVat ? (
              <View style={styles.vatChip}>
                <Text style={styles.vatChipText}>НӨАТ</Text>
              </View>
            ) : null}
            {log.payType ? (
              <View style={[styles.payChip, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Text style={[styles.payChipText, { color: theme.colors.onSurfaceVariant }]}>
                  {log.payType}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => onEditNote(log)}
        disabled={!canEdit}
        style={styles.noteRow}
        accessibilityRole="button"
        accessibilityLabel="Тайлбар засах"
      >
        <Text style={styles.metaItem}>💬</Text>
        <Text
          style={[
            styles.noteText,
            { color: log.note ? theme.colors.onSurface : theme.colors.outline },
          ]}
          numberOfLines={2}
        >
          {log.note || 'Тайлбар...'}
        </Text>
      </Pressable>

      {log.price && canEdit ? (
        <View style={styles.docRow}>
          {DOC_BUTTONS.map(({ docType, label, tint }) => (
            <Pressable
              key={docType}
              onPress={() => onCreateDocument(log, docType)}
              accessibilityRole="button"
              style={[styles.docButton, { borderColor: `${tint}55`, backgroundColor: `${tint}12` }]}
            >
              <Text style={[styles.docLabel, { color: tint }]} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  index: { fontSize: 10, fontWeight: '900', width: 18 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  job: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  count: { fontSize: 13, fontWeight: '900' },
  carryOver: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  carryOverText: { fontSize: 9, fontWeight: '700', color: '#9a3412' },
  editIcon: { fontSize: 14, opacity: 0.55 },
  deleteIcon: { fontSize: 14, opacity: 0.4 },
  deleteArmed: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  deleteArmedText: { fontSize: 9, fontWeight: '900', color: '#ffffff' },

  statusRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingBottom: 6 },
  statusButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 4,
    alignItems: 'center',
  },
  statusLabel: { fontSize: 9, fontWeight: '700' },

  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  metaItem: { fontSize: 12, fontWeight: '800', color: '#374151' },
  metaTomorrow: {
    color: '#a16207',
    backgroundColor: '#fef9c3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  callChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  callChipText: { fontSize: 10, fontWeight: '700', color: '#ffffff' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  vatChip: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vatChipText: { fontSize: 9, fontWeight: '700', color: '#1d4ed8' },
  payChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  payChipText: { fontSize: 10, fontWeight: '700' },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  noteText: { flex: 1, fontSize: 12, fontWeight: '700' },

  docRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  /**
   * Equal thirds rather than intrinsic widths.
   *
   * The row used to wrap and let each button size itself, and on Android the
   * longest label — «Нэхэмжлэх» sat next to «Зарлагын баримт» — was measured
   * short and clipped to nothing on some screen widths. Fixed thirds mean the
   * width no longer depends on the text, and the text is allowed a second line
   * rather than being cut.
   */
  docButton: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
});

export const WorkLogCard = memo(
  WorkLogCardBase,
  (prev, next) =>
    prev.log === next.log &&
    prev.index === next.index &&
    prev.total === next.total &&
    prev.canEdit === next.canEdit &&
    prev.canDelete === next.canDelete &&
    prev.isDeleteArmed === next.isDeleteArmed,
);

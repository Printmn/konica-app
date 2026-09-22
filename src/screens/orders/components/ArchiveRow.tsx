import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import {
  countSuffix,
  intakeLabel,
  performanceLabel,
  workLogRowColor,
} from '@/features/worklogs/workLogLogic';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { WorkLog } from '@/types';
import { effectivePrice, formatCurrency } from '@/utils/price';

/**
 * One line of a finished day.
 *
 * The board's card is built for work in progress: status buttons, a note, a
 * phone number to ring, a document to raise. On a day that is over none of that
 * is a decision anybody is still making, and five taps' worth of controls on
 * every row turns reading a past day into scrolling past it.
 *
 * So the archive reads the way the report does — number, what it was, when it
 * came in, how it was paid, what it came to. Same shape as the report screen
 * on purpose: they answer the same question, and two different-looking lists of
 * the same rows is a reason to doubt one of them.
 *
 * Editing is still one tap away. Corrections to a past day are rare but real —
 * a price typed wrong is worth fixing after the fact — they are just no longer
 * the thing the row is built around.
 */
interface ArchiveRowProps {
  log: WorkLog;
  /** Counted up from 1, the way the report numbers its rows. */
  ordinal: number;
  /** `2026-08-04`, so a same-day row shows only its clock time. */
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (log: WorkLog) => void;
  onDelete: (id: number) => void;
  isDeleteArmed: boolean;
}

function ArchiveRowBase({
  log,
  ordinal,
  today,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  isDeleteArmed,
}: ArchiveRowProps): React.JSX.Element {
  const theme = useAppTheme();
  const count = countSuffix(log);

  return (
    <Card accentColor={workLogRowColor(log)}>
      <Pressable
        onPress={canEdit ? () => onEdit(log) : undefined}
        accessibilityRole={canEdit ? 'button' : undefined}
        accessibilityLabel={canEdit ? `${log.job} засах` : undefined}
        style={styles.row}
      >
        <Text style={[styles.index, { color: theme.custom.mutedText }]}>{ordinal}</Text>

        <View style={styles.flex}>
          <Text style={[styles.job, { color: theme.colors.onSurface }]} numberOfLines={2}>
            {log.job}
            {count === '' ? null : (
              <Text style={{ color: theme.colors.primary }}> {count}</Text>
            )}
          </Text>
          <Text style={[styles.meta, { color: theme.custom.mutedText }]} numberOfLines={1}>
            {/* `intakeLabel` prefixes the month and day once the row is older
                than the screen's «today» — so a single archived day stays
                clean, and the pickup shelf, which spans months, dates itself. */}
            {intakeLabel(log, today)} · {log.payType || '—'} · {performanceLabel(log)}
          </Text>
        </View>

        <View style={styles.trailing}>
          <Text style={[styles.amount, { color: theme.colors.primary }]}>
            {formatCurrency(effectivePrice(log))}
          </Text>
          {log.hasVat ? <Text style={styles.vat}>НӨАТ</Text> : null}
        </View>

        {canDelete ? (
          <Text
            style={isDeleteArmed ? styles.deleteArmed : styles.deleteIcon}
            onPress={() => onDelete(log.id)}
            accessibilityRole="button"
            accessibilityLabel="Устгах"
          >
            {isDeleteArmed ? 'Устгах?' : '🗑'}
          </Text>
        ) : null}
      </Pressable>
    </Card>
  );
}

export const ArchiveRow = memo(ArchiveRowBase, (prev, next) => {
  const a = prev.log;
  const b = next.log;
  return (
    a.id === b.id &&
    a.job === b.job &&
    a.quantity === b.quantity &&
    a.price === b.price &&
    a.hasVat === b.hasVat &&
    a.payType === b.payType &&
    a.status === b.status &&
    a.paymentStatus === b.paymentStatus &&
    a.receivedTime === b.receivedTime &&
    a.date === b.date &&
    prev.ordinal === next.ordinal &&
    prev.today === next.today &&
    prev.canEdit === next.canEdit &&
    prev.canDelete === next.canDelete &&
    prev.isDeleteArmed === next.isDeleteArmed
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: { fontSize: 11, fontWeight: '900', width: 18 },
  flex: { flex: 1 },
  job: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  meta: { fontSize: 10, marginTop: 2 },
  trailing: { alignItems: 'flex-end' },
  amount: { fontSize: 13, fontWeight: '900' },
  vat: { fontSize: 9, fontWeight: '700', color: '#6d28d9' },
  deleteIcon: { fontSize: 13, opacity: 0.35, paddingLeft: 4 },
  deleteArmed: { fontSize: 10, fontWeight: '900', color: '#dc2626', paddingLeft: 4 },
});

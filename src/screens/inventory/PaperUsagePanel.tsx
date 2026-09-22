import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { EmptyState } from '@/components/feedback/StateViews';
import { useData } from '@/features/data/DataContext';
import { stockCount } from '@/features/inventory/inventoryLogic';
import { addMissingPapers, missingPaperNames } from '@/features/inventory/stockSeed';
import {
  applyUsage,
  byItem,
  createUsage,
  dailyBars,
  daysOfStock,
  inWindowRows,
  onDay,
  paperStock,
  pendingPaperLogs,
  reconcilePaperUsage,
  revertUsage,
  setStock,
  validateUsage,
  windowTotal,
} from '@/features/inventory/stockUsage';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useToast } from '@/hooks/useToast';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { InventoryItem } from '@/types';
import { todayString } from '@/utils/date';

/**
 * Цаасны зарцуулалт — the whole thing, wherever it is needed.
 *
 * Lifted out of `StockUsageScreen` so the Зарлага tab can carry it without a
 * second copy. Paper and petty cash are the same question asked twice — what
 * did the day cost — and the answer being behind two different doors is why
 * one of them stopped being opened. Two copies of a form that decrements stock
 * is also how the two quietly stop agreeing.
 *
 * Self-contained: it reads its own data and writes its own records, so a
 * screen adds it with `<PaperUsagePanel date={…} canEdit={…} />`.
 */
interface PaperUsagePanelProps {
  /** `2026-09-19` — the day the list and the chart's right-hand bar belong to. */
  date: string;
  /** Whether this role may draw stock and correct the shelf. */
  canEdit: boolean;
  /** Who a draw is filed under. */
  by: string;
}

/** The counts a print shop actually draws in one go. */
const QUICK_SHEETS = [10, 25, 50, 100] as const;

export function PaperUsagePanel({
  date,
  canEdit,
  by,
}: PaperUsagePanelProps): React.JSX.Element {
  const theme = useAppTheme();
  const { show } = useToast();
  const { armedId, confirm } = useConfirmAction();
  const { inventory, setInventory, usage, setUsage, workLogs } = useData();

  const [itemId, setItemId] = useState<number | null>(null);
  /**
   * What is typed against each paper, keyed by item.
   *
   * One shared field would carry a half-typed 250 from one paper onto the next
   * the moment somebody looked away — and the two cards are on screen at the
   * same time, so there is nothing to tell them the number moved.
   */
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  /** A counted figure typed in by hand, empty until somebody edits it. */
  const [countDraft, setCountDraft] = useState('');

  const papers = useMemo(() => paperStock(inventory), [inventory]);
  const missingPapers = useMemo(() => missingPaperNames(inventory), [inventory]);

  const addPapers = useCallback(() => {
    setInventory((previous) => addMissingPapers(previous));
    show(`${missingPapers.length} цаас нэмэгдлээ`, 'success');
  }, [setInventory, show, missingPapers.length]);

  /**
   * Orders on this day that name paper but never had it taken off.
   *
   * Deduction happens when an order is saved, so anything booked before the
   * rule existed — or by a device still running an older build — left the
   * shelf untouched. The gap is invisible otherwise: the order looks normal
   * and the stock looks normal, and only the two together are wrong.
   */
  const pending = useMemo(
    () => pendingPaperLogs(workLogs.filter((log) => log.date === date), usage, inventory),
    [workLogs, date, usage, inventory],
  );

  const reconcile = useCallback(() => {
    const result = reconcilePaperUsage(usage, inventory, pending, by);
    if (result.drawn.length === 0) return;
    setUsage(() => result.usage);
    setInventory(() => result.inventory);
    const sheets = result.drawn.reduce((sum, row) => sum + row.sheets, 0);
    show(`${result.drawn.length} захиалга · ${sheets}ш хасагдлаа`, 'success');
  }, [usage, inventory, pending, by, setUsage, setInventory, show]);

  const selected: InventoryItem | undefined = inventory.find((item) => item.id === itemId);

  const bars = useMemo(() => dailyBars(usage, { today: date }), [usage, date]);
  const week = useMemo(() => inWindowRows(usage, bars), [usage, bars]);
  const todays = useMemo(() => onDay(usage, date), [usage, date]);
  const perItem = useMemo(() => byItem(week), [week]);

  /**
   * Writes a counted figure straight onto the shelf.
   *
   * Not recorded as usage: a stocktake is not consumption, and logging it would
   * put the day somebody found forty sheets behind the printer into the "how
   * fast do we get through paper" figure.
   */
  const saveCount = useCallback(() => {
    if (selected === undefined) return;
    const digits = countDraft.replace(/[^0-9]/g, '');
    if (digits === '') {
      show('Үлдэгдлээ оруулна уу.', 'error');
      return;
    }
    const counted = Number(digits);
    setInventory((previous) => setStock(previous, selected.id, counted));
    setCountDraft('');
    show(`${selected.name} — ${counted}ш болголоо`, 'success');
  }, [selected, countDraft, setInventory, show]);

  const record = useCallback(() => {
    const draft = {
      itemId: itemId ?? 0,
      itemName: selected?.name ?? '',
      quantity,
      note,
      by,
      date,
    };
    const problem = validateUsage(draft);
    if (problem !== null) {
      show(problem, 'error');
      return;
    }

    const entry = createUsage(draft);
    setUsage((previous) => [entry, ...previous]);
    setInventory((previous) => applyUsage(previous, entry.itemId, entry.quantity));
    setQuantity('');
    setNote('');
    show(`${entry.itemName} — ${entry.quantity}ш хасагдлаа`, 'success');
  }, [itemId, selected, quantity, note, by, date, setUsage, setInventory, show]);

  /**
   * A single tap for the counts the shop actually uses.
   *
   * Recorded immediately rather than behind a confirmation: the day's list
   * below has a delete that puts the sheets straight back, so a mis-tap costs
   * one more tap rather than a wrong shelf. Asking «are you sure» before every
   * ten sheets would be asked forty times a day and stop being read.
   */
  const draw = useCallback(
    (item: InventoryItem, sheets: number) => {
      const entry = createUsage({
        itemId: item.id,
        itemName: item.name,
        quantity: String(sheets),
        note: '',
        by,
        date,
      });
      setUsage((previous) => [entry, ...previous]);
      setInventory((previous) => applyUsage(previous, item.id, sheets));
      show(`${item.name} − ${sheets}ш`, 'success');
    },
    [by, date, setUsage, setInventory, show],
  );

  /**
   * Whatever number was typed on that paper's own card.
   *
   * The quick buttons cover the common counts; this is the other half — «37»
   * happens, and having to open a second panel to type it made the fast path
   * and the honest path different paths.
   */
  const drawTyped = useCallback(
    (item: InventoryItem) => {
      const sheets = Number((typed[item.id] ?? '').replace(/[^0-9]/g, '')) || 0;
      if (sheets <= 0) {
        show('Ширхэгээ оруулна уу.', 'error');
        return;
      }
      draw(item, sheets);
      setTyped((previous) => ({ ...previous, [item.id]: '' }));
    },
    [typed, draw, show],
  );

  const remove = useCallback(
    (id: number) => {
      const entry = usage.find((row) => row.id === id);
      if (entry === undefined) return;
      setUsage((previous) => previous.filter((row) => row.id !== id));
      // Deleting the line has to give the sheets back, or the shelf drifts.
      setInventory((previous) => revertUsage(previous, entry.itemId, entry.quantity));
      show('Устгаж, үлдэгдлийг буцаалаа', 'success');
    },
    [usage, setUsage, setInventory, show],
  );

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.subtleBorder },
  ];

  return (
    <>
      <Text style={[styles.heading, { color: theme.colors.onSurface }]}>
        📄 ЦААСНЫ ЗАРЦУУЛАЛТ
      </Text>

      {canEdit && pending.length > 0 ? (
        <View style={cardStyle}>
          <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
            Энэ өдрийн {pending.length} захиалгаас цаас хасагдаагүй байна:{' '}
            {pending.map((log) => log.job).join(', ')}
          </Text>
          <Button mode="contained" icon="tray-arrow-down" compact onPress={reconcile}>
            Захиалгаас хасах
          </Button>
        </View>
      ) : null}

      {canEdit ? (
        <>
          {/* A new size added to the standing list never reaches a shop that
              already has its own rows — «Фото цаас 10x15» simply did not
              appear. Offered here, where the gap gets noticed, rather than
              sending somebody to Бараа to guess the spelling. */}
          {missingPapers.length > 0 ? (
            <View style={cardStyle}>
              <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                Дутуу цаас: {missingPapers.join(', ')}
              </Text>
              <Button mode="outlined" icon="playlist-plus" compact onPress={addPapers}>
                {missingPapers.length} цаасыг нэмэх
              </Button>
            </View>
          ) : null}

          {/* One card per paper. The old shape made every entry a
              three-step errand — pick a chip, scroll to a field, type, submit
              — for a number that is nearly always 10, 25, 50 or 100. The
              stock now sits on the same line as the buttons that change it,
              so the figure and the action are never a scroll apart. */}
          {papers.map((item) => {
            const left = stockCount(item);
            const open = item.id === itemId;
            const runs = daysOfStock(item, week);
            return (
              <View key={item.id} style={cardStyle}>
                <View style={styles.paperHead}>
                  <View style={styles.flex}>
                    <Text style={[styles.paperName, { color: theme.colors.onSurface }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.paperMeta, { color: theme.custom.mutedText }]}>
                      {runs === null
                        ? 'Зарцуулалт бүртгэгдээгүй'
                        : runs === 0
                          ? 'Үлдэгдэлгүй'
                          : `Ойролцоогоор ${runs} хоног хүрнэ`}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.paperStock,
                      { color: left <= 0 ? theme.colors.error : theme.colors.primary },
                    ]}
                  >
                    {left}
                    <Text style={styles.paperStockUnit}>ш</Text>
                  </Text>
                </View>

                {/* Typed first: the quick buttons are a shortcut for four
                    numbers, not the only way in. */}
                <View style={styles.typeRow}>
                  <TextInput
                    mode="outlined"
                    label="Ширхэг"
                    value={typed[item.id] ?? ''}
                    onChangeText={(value) =>
                      setTyped((previous) => ({ ...previous, [item.id]: value }))
                    }
                    keyboardType="number-pad"
                    style={styles.flex}
                    dense
                  />
                  <Button
                    mode="contained"
                    icon="tray-arrow-down"
                    onPress={() => drawTyped(item)}
                    disabled={(typed[item.id] ?? '').trim() === ''}
                  >
                    Хасах
                  </Button>
                </View>

                {/* Says what the shelf will read afterwards, before the tap
                    rather than after it — a mistyped 2500 is obvious here and
                    expensive to notice later. */}
                {(typed[item.id] ?? '').trim() !== '' ? (
                  <Text style={[styles.preview, { color: theme.colors.primary }]}>
                    {left}ш →{' '}
                    {left - (Number((typed[item.id] ?? '').replace(/[^0-9]/g, '')) || 0)}ш
                  </Text>
                ) : null}

                <View style={styles.quickRow}>
                  {QUICK_SHEETS.map((amount) => (
                    <Pressable
                      key={amount}
                      onPress={() => draw(item, amount)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name} ${amount} ширхэг хасах`}
                      style={({ pressed }) => [
                        styles.quick,
                        {
                          backgroundColor: theme.colors.surfaceVariant,
                          borderColor: theme.custom.subtleBorder,
                        },
                        pressed && styles.quickPressed,
                      ]}
                    >
                      <Text style={[styles.quickText, { color: theme.colors.onSurface }]}>
                        −{amount}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      setItemId(open ? null : item.id);
                      setQuantity('');
                      setNote('');
                      setCountDraft('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Бусад тоо"
                    style={[
                      styles.quick,
                      {
                        backgroundColor: open ? theme.custom.selected : theme.colors.surfaceVariant,
                        borderColor: open ? theme.custom.selected : theme.custom.subtleBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickText,
                        { color: open ? theme.custom.onSelected : theme.colors.onSurface },
                      ]}
                    >
                      {open ? '✕' : '⋯'}
                    </Text>
                  </Pressable>
                </View>

                {open ? (
                  <View style={styles.expanded}>
                    <View style={styles.split}>
                      <TextInput
                        mode="outlined"
                        label="Ширхэг"
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="number-pad"
                        style={styles.flex}
                        dense
                      />
                      <TextInput
                        mode="outlined"
                        label="Тайлбар"
                        value={note}
                        onChangeText={setNote}
                        style={styles.flex}
                        dense
                      />
                    </View>

                    {/* Says what the shelf will read afterwards, before the
                        tap rather than after it — a mistyped 2500 is obvious
                        here and expensive to notice later. */}
                    {quantity ? (
                      <Text style={[styles.preview, { color: theme.colors.primary }]}>
                        {left}ш → {left - (Number(quantity.replace(/[^0-9]/g, '')) || 0)}ш
                      </Text>
                    ) : null}

                    <Button mode="contained" icon="tray-arrow-down" onPress={record}>
                      Бүртгэх
                    </Button>

                    {/* The shelf, correctable by hand. The running total
                        drifts — paper used without the app open, a delivery —
                        so somebody counts what is there and types it, and the
                        deductions start again from that number. */}
                    <View style={styles.split}>
                      <TextInput
                        mode="outlined"
                        label="Тоолсон үлдэгдэл"
                        value={countDraft}
                        onChangeText={setCountDraft}
                        keyboardType="number-pad"
                        placeholder={String(left)}
                        style={styles.flex}
                        dense
                      />
                      <Button
                        mode="outlined"
                        icon="content-save"
                        onPress={saveCount}
                        disabled={countDraft.trim() === ''}
                      >
                        Үлдэгдэл
                      </Button>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {papers.length === 0 && missingPapers.length === 0 ? (
            <View style={cardStyle}>
              <Text style={[styles.hint, { color: theme.custom.mutedText }]}>
                Цаас олдсонгүй — Бараа цэсэнд «Бичгийн цаас А4» эсвэл «Фото цаас…»
                нэртэй бараа байгаа эсэхийг шалгана уу
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={cardStyle}>
        <View style={styles.chartHead}>
          <Text style={[styles.label, { color: theme.custom.mutedText }]}>СҮҮЛИЙН 7 ХОНОГ</Text>
          <Text style={[styles.chartTotal, { color: theme.colors.primary }]}>
            {windowTotal(bars)}ш
          </Text>
        </View>

        <View style={styles.chart}>
          {bars.map((bar) => (
            <View key={bar.date} style={styles.barSlot}>
              <Text style={[styles.barValue, { color: theme.custom.mutedText }]}>
                {bar.total > 0 ? bar.total : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(bar.height * 100, bar.total > 0 ? 6 : 0)}%`,
                      backgroundColor: bar.isToday
                        ? theme.colors.primary
                        : theme.custom.selected,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.barLabel,
                  {
                    color: bar.isToday ? theme.colors.primary : theme.custom.mutedText,
                    fontWeight: bar.isToday ? '900' : '700',
                  },
                ]}
              >
                {bar.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {perItem.length > 0 ? (
        <View style={cardStyle}>
          <Text style={[styles.label, { color: theme.custom.mutedText }]}>
            ЮУГ ХЭД · 7 ХОНОГ
          </Text>
          {perItem.map((row) => {
            const item = inventory.find((candidate) => candidate.id === row.itemId);
            const left = item ? daysOfStock(item, week) : null;
            return (
              <View key={row.itemId} style={styles.itemRow}>
                <View style={styles.flex}>
                  <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>
                    {row.name}
                  </Text>
                  <Text style={[styles.itemMeta, { color: theme.custom.mutedText }]}>
                    {row.times} удаа
                    {left === null
                      ? ''
                      : left === 0
                        ? ' · үлдэгдэлгүй'
                        : ` · ойролцоогоор ${left} хоног хүрнэ`}
                  </Text>
                </View>
                <Text style={[styles.itemQty, { color: theme.colors.onSurface }]}>
                  {row.quantity}ш
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={cardStyle}>
        {/* Follows the day being shown: the panel now appears on the Зарлага
            tab too, where the board may be sitting on an archived date. */}
        <Text style={[styles.label, { color: theme.custom.mutedText }]}>
          {date === todayString() ? 'ӨНӨӨДРИЙН БҮРТГЭЛ' : `${date} — БҮРТГЭЛ`}
        </Text>
        {todays.length === 0 ? (
          <EmptyState icon="📄" title="Өнөөдөр бүртгэл алга" />
        ) : (
          todays.map((row) => (
            <View key={row.id} style={styles.itemRow}>
              <View style={styles.flex}>
                <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>
                  {row.itemName}
                  {row.note ? ` · ${row.note}` : ''}
                </Text>
                <Text style={[styles.itemMeta, { color: theme.custom.mutedText }]}>
                  👤 {row.by || 'Тодорхойгүй'}
                </Text>
              </View>
              <Text style={[styles.itemQty, { color: theme.colors.onSurface }]}>
                {row.quantity}ш
              </Text>
              {canEdit ? (
                <Pressable
                  onPress={() => confirm(row.id, () => remove(row.id))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Бүртгэл устгах"
                >
                  <Text style={styles.deleteIcon}>{armedId === row.id ? '❌' : '🗑'}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
  heading: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  flex: { flex: 1 },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  hint: { fontSize: 11, lineHeight: 16 },
  split: { flexDirection: 'row', gap: 8 },
  preview: { fontSize: 13, fontWeight: '800' },


  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartTotal: { fontSize: 15, fontWeight: '900' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 132, gap: 6 },
  barSlot: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, fontWeight: '800' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  itemName: { fontSize: 13, fontWeight: '700' },
  itemMeta: { fontSize: 10, marginTop: 2 },
  itemQty: { fontSize: 14, fontWeight: '900' },
  paperHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paperName: { fontSize: 14, fontWeight: '800' },
  paperMeta: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  paperStock: { fontSize: 24, fontWeight: '900' },
  paperStockUnit: { fontSize: 12, fontWeight: '800' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickRow: { flexDirection: 'row', gap: 6 },
  quick: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  quickPressed: { opacity: 0.6 },
  quickText: { fontSize: 13, fontWeight: '900' },
  expanded: { gap: 10, marginTop: 2 },
  deleteIcon: { fontSize: 14, opacity: 0.5 },
});

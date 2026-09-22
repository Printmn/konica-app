import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, SegmentedButtons, TextInput } from "react-native-paper";

import { EmptyState } from "@/components/feedback/StateViews";
import { Card } from "@/components/ui/Card";
import { useData } from "@/features/data/DataContext";
import {
  EXPENSE_CATEGORIES,
  byCategory,
  createExpense,
  dayNet,
  onDay,
  timeOf,
  validateExpense,
} from "@/features/expenses/expenseLogic";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { PaperUsagePanel } from "@/screens/inventory/PaperUsagePanel";
import { useToast } from "@/hooks/useToast";
import { useAppTheme } from "@/theme/ThemeProvider";
import type { ExpenseCategory } from "@/types";
import { formatCurrency } from "@/utils/price";

/**
 * Өдрийн зарлага — what the day cost, against what it took.
 *
 * The expense record itself is shared with the staff screen and predates this;
 * what is new is putting it next to the takings. The two were deliberately kept
 * apart so a lunch could never quietly alter a figure the counter reconciles
 * against the till, and that still holds: nothing here writes to the report.
 * The subtraction happens on screen, at the bottom, where it is visibly a
 * second sum rather than a correction to the first.
 *
 * The day follows whatever the board is showing, archive included — a past day
 * is exactly when somebody asks what it actually cleared.
 */
interface ExpensesTabProps {
  /** `2026-08-04` — the day the board is on. */
  date: string;
  /** Settled takings for that day, «Тооцоотой» already excluded. */
  revenue: number;
  /** Who the entry is filed under. */
  by: string;
  /**
   * Whether this role may record — and therefore also remove — an expense.
   *
   * Deliberately not `deleteWorkLogs`, which is manager-only: that guards the
   * shop's revenue record, where a deleted row is money that vanishes from a
   * reconciled day. A petty-cash line is a note somebody typed, and the person
   * who typed «12000» as «120000» is the one standing there. Gating its removal
   * behind the manager's PIN left the counter iPad able to create a wrong
   * figure and unable to fix it.
   */
  canEdit: boolean;
}

export function ExpensesTab({
  date,
  revenue,
  by,
  canEdit,
}: ExpensesTabProps): React.JSX.Element {
  const theme = useAppTheme();
  const { show } = useToast();
  const { expenses, setExpenses } = useData();
  const { armedId, confirm } = useConfirmAction();

  /**
   * Money or paper.
   *
   * Both are what the day cost, which is why they share a tab — but they are
   * entered by different hands at different moments, and stacked in one column
   * the paper cards pushed the day's cash list off the bottom of the screen.
   */
  const [pane, setPane] = useState<"money" | "paper">("money");

  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const rows = useMemo(() => onDay(expenses, date), [expenses, date]);
  const totals = useMemo(() => byCategory(rows), [rows]);
  const net = useMemo(() => dayNet(revenue, rows), [revenue, rows]);

  const add = useCallback(() => {
    const draft = { category, amount, note, by, date };
    const problem = validateExpense(draft);
    if (problem !== null) {
      show(problem, "error");
      return;
    }
    // `date` is passed explicitly rather than defaulted to today: entering a
    // missed receipt while the board sits on an archived day should file it
    // under that day, not this one.
    setExpenses((previous) => [createExpense(draft), ...previous]);
    setAmount("");
    setNote("");
    show("Зарлага бүртгэгдлээ", "success");
  }, [category, amount, note, by, date, setExpenses, show]);

  /** Two taps: the first arms the row, the second deletes it. */
  const remove = useCallback(
    (id: number) => {
      confirm(id, (confirmed) => {
        setExpenses((previous) =>
          previous.filter((expense) => expense.id !== confirmed),
        );
        show("Устгалаа", "success");
      });
    },
    [confirm, setExpenses, show],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    >
      <SegmentedButtons
        value={pane}
        onValueChange={(value) => setPane(value)}
        density="small"
        buttons={[
          { value: "money", label: "Зарлага", icon: "cash-minus" },
          { value: "paper", label: "Цаас", icon: "file-document-multiple" },
        ]}
      />

      {pane === "paper" ? (
        /* Its own total stays out of the money below: paper was paid for when
           it was delivered, and counting it again here would charge the shop
           twice for the same ream. */
        <PaperUsagePanel date={date} canEdit={canEdit} by={by} />
      ) : (
        <>
          {canEdit ? (
            <Card style={styles.card}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>
                💸 Зарлага нэмэх
              </Text>

              <View style={styles.chips}>
                {EXPENSE_CATEGORIES.map((item) => {
                  const active = category === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setCategory(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active
                            ? theme.colors.primary
                            : theme.custom.cardBackground,
                          borderColor: active
                            ? theme.colors.primary
                            : theme.custom.subtleBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: active
                              ? theme.colors.onPrimary
                              : theme.colors.onSurface,
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                mode="outlined"
                label="Дүн (₮)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                dense
              />
              <TextInput
                mode="outlined"
                label="Тайлбар"
                value={note}
                onChangeText={setNote}
                placeholder="Юунд зарцуулсан бэ"
                dense
              />
              <Button mode="contained" icon="plus" onPress={add}>
                Бүртгэх
              </Button>
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState icon="💸" title="Энэ өдөр зарлага гараагүй" />
          ) : (
            <Card style={styles.card}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>
                {date} · {rows.length} зарлага
              </Text>

              {rows.map((expense) => (
                <View key={expense.id} style={styles.row}>
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {expense.note || categoryOf(expense.category)}
                    </Text>
                    <Text
                      style={[
                        styles.rowMeta,
                        { color: theme.custom.mutedText },
                      ]}
                    >
                      {categoryOf(expense.category)}
                      {expense.by ? ` · ${expense.by}` : ""}
                      {timeOf(expense) ? ` · ${timeOf(expense)}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[styles.rowAmount, { color: theme.colors.error }]}
                  >
                    −{formatCurrency(expense.amount)}
                  </Text>
                  {/* Two taps, and the armed state says so in words: a single
                  mis-tap on a list of numbers should not silently remove
                  one. */}
                  {canEdit ? (
                    <Pressable
                      onPress={() => remove(expense.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`${expense.note || categoryOf(expense.category)} устгах`}
                    >
                      <Text
                        style={
                          armedId === expense.id
                            ? styles.deleteArmed
                            : styles.deleteIcon
                        }
                      >
                        {armedId === expense.id ? "Устгах?" : "🗑"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              {totals.length > 1 ? (
                <View
                  style={[
                    styles.byCategory,
                    { borderTopColor: theme.custom.subtleBorder },
                  ]}
                >
                  {totals.map((entry) => (
                    <Text
                      key={entry.key}
                      style={[
                        styles.categoryChip,
                        { color: theme.custom.mutedText },
                      ]}
                    >
                      {entry.label} {formatCurrency(entry.total)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Card>
          )}

          {/* The subtraction, at the bottom, as its own sum. The takings above it
          are untouched — that figure is what the counter checks against the
          till, and a report that quietly nets off lunch is a report nobody can
          reconcile. */}
          <Card style={styles.card}>
            <View style={styles.netRow}>
              <Text
                style={[styles.netLabel, { color: theme.custom.mutedText }]}
              >
                Өдрийн орлого
              </Text>
              <Text
                style={[styles.netValue, { color: theme.colors.onSurface }]}
              >
                {formatCurrency(net.revenue)}
              </Text>
            </View>
            <View style={styles.netRow}>
              <Text
                style={[styles.netLabel, { color: theme.custom.mutedText }]}
              >
                Зарлага
                {net.share === null ? "" : ` (${Math.round(net.share * 100)}%)`}
              </Text>
              <Text style={[styles.netValue, { color: theme.colors.error }]}>
                −{formatCurrency(net.spent)}
              </Text>
            </View>
            <View
              style={[
                styles.netRow,
                styles.netTotal,
                { borderTopColor: theme.custom.subtleBorder },
              ]}
            >
              <Text
                style={[
                  styles.netTotalLabel,
                  { color: theme.colors.onSurface },
                ]}
              >
                Цэвэр үлдэгдэл
              </Text>
              <Text
                style={[
                  styles.netTotalValue,
                  // A day that spent more than it took is the one worth seeing.
                  {
                    color:
                      net.net < 0 ? theme.colors.error : theme.colors.primary,
                  },
                ]}
              >
                {formatCurrency(net.net)}
              </Text>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const categoryOf = (key: string): string =>
  EXPENSE_CATEGORIES.find((item) => item.key === key)?.label ?? "📦 Бусад";

const styles = StyleSheet.create({
  list: { paddingBottom: 96, gap: 10 },
  card: { gap: 10 },
  title: { fontSize: 13, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  rowLabel: { fontSize: 13, fontWeight: "700" },
  rowMeta: { fontSize: 10, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: "900" },
  deleteIcon: { fontSize: 15, opacity: 0.55, paddingLeft: 6 },
  deleteArmed: {
    fontSize: 10,
    fontWeight: "900",
    color: "#dc2626",
    paddingLeft: 4,
  },
  byCategory: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  categoryChip: { fontSize: 10, fontWeight: "700" },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  netLabel: { fontSize: 12, fontWeight: "700" },
  netValue: { fontSize: 14, fontWeight: "800" },
  netTotal: { borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  netTotalLabel: { fontSize: 13, fontWeight: "900" },
  netTotalValue: { fontSize: 20, fontWeight: "900" },
});

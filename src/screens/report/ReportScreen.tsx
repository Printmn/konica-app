import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, Icon, Modal, Portal } from "react-native-paper";

import { useAuth } from "@/authentication/AuthContext";
import {
  OfflineBanner,
  SyncErrorBanner,
  PermissionDenied,
} from "@/components/feedback/StateViews";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { useData } from "@/features/data/DataContext";
import {
  calculateDailyReport,
  groupByJob,
  latestDayOf,
  monthOf,
  monthTotals,
  reportDates,
  reportMonths,
  stepDay,
} from "@/features/reports/reportCalculator";
import {
  byCategory as expensesByCategory,
  categoryLabel as expenseCategoryLabel,
  dayNet,
  onDay as expensesOnDay,
  timeOf as expenseTime,
} from "@/features/expenses/expenseLogic";
import {
  performanceLabel,
  workLogRowColor,
} from "@/features/worklogs/workLogLogic";
import { useScreenBack } from "@/hooks/useScreenBack";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/hooks/useToast";
import { exportDailyWorkLogs } from "@/services/export/excelService";
import { useAppTheme } from "@/theme/ThemeProvider";
import { DAY_LABELS_MN, todayString, weekdayOf } from "@/utils/date";
import { effectivePrice, formatCurrency } from "@/utils/price";

/**
 * Daily revenue report.
 *
 * Totals come from `reportCalculator`, which counts only work logs and applies
 * VAT — see the note there about why quick orders are deliberately excluded.
 *
 * The layout mirrors the web build's report page: one export action, a green
 * revenue hero, the payment-method breakdown as tiles, then the day's log.
 */

/** Hero/action green — kept local because it is unique to this screen. */
const GREEN_GRADIENT = ["#4aa87c", "#33996a"] as const;
const GREEN_SOLID = "#2f8f63";
/** A shade darker than the day's hero, so the two are told apart at a glance. */
const MONTH_GRADIENT = ["#2b7a5b", "#1f6249"] as const;

interface SummaryTileProps {
  label: string;
  value: string;
  icon: string;
  tint: string;
  basis: `${number}%`;
}

function SummaryTile({
  label,
  value,
  icon,
  tint,
  basis,
}: SummaryTileProps): React.JSX.Element {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.tile,
        {
          flexBasis: basis,
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.subtleBorder,
        },
      ]}
    >
      <Icon source={icon} size={20} color={tint} />
      <Text
        style={[styles.tileLabel, { color: theme.colors.onSurface }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.tileValue, { color: theme.colors.onSurface }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

export function ReportScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const onBack = useScreenBack();
  const { can } = useAuth();
  const { show, showError } = useToast();
  const { gutter, isTablet } = useResponsive();
  const {
    workLogs,
    setWorkLogs,
    expenses,
    isOffline,
    pendingWrites,
    syncError,
    syncNow,
  } = useData();

  const [busy, setBusy] = useState(false);
  const { armedId, confirm } = useConfirmAction();

  const today = todayString();

  /**
   * Which day the whole screen is describing.
   *
   * `null` means today, so the report opens on today after every launch
   * rather than on whatever day was last inspected — the common case is "how
   * did today go", and a screen that remembers last Tuesday is a screen that
   * quietly answers the wrong question.
   */
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const date = pickedDate ?? today;

  const days = useMemo(
    () => reportDates(workLogs, expenses, today),
    [workLogs, expenses, today],
  );
  const months = useMemo(() => reportMonths(days), [days]);
  const older = stepDay(days, date, 1);
  const newer = stepDay(days, date, -1);

  const report = useMemo(
    () => calculateDailyReport(workLogs, date),
    [workLogs, date],
  );

  /** What the day was made of, heaviest first. */
  const breakdown = useMemo(() => groupByJob(report.logs), [report.logs]);
  const breakdownTotal = useMemo(
    () => breakdown.reduce((sum, group) => sum + group.total, 0),
    [breakdown],
  );

  /** The month the chosen day sits in, totalled the same way. */
  const month = useMemo(
    () => monthTotals(workLogs, expenses, monthOf(date)),
    [workLogs, expenses, date],
  );

  const spending = useMemo(
    () => expensesOnDay(expenses, date),
    [expenses, date],
  );
  const spendingByCategory = useMemo(
    () => expensesByCategory(spending),
    [spending],
  );
  const net = useMemo(
    () => dayNet(report.totalRevenue, spending),
    [report.totalRevenue, spending],
  );

  const deleteLog = useCallback(
    (id: number) => {
      confirm(id, (confirmedId) => {
        setWorkLogs((previous) =>
          previous.filter((log) => log.id !== confirmedId),
        );
        show("Устгалаа");
      });
    },
    [confirm, setWorkLogs, show],
  );

  const exportExcel = useCallback(async () => {
    setBusy(true);
    const result = await exportDailyWorkLogs(report.logs, date);
    setBusy(false);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    // Saving straight into a folder happens silently, so without this the
    // button looks like it did nothing at all.
    show("Excel хадгалагдлаа", "success");
  }, [report.logs, date, show, showError]);

  if (!can("viewReport")) {
    return (
      <Screen>
        <ScreenHeader title="Өдрийн тайлан" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  const canExport = can("exportData");
  /** The month's turnover is the manager's; the day's takings are the shop's. */
  const canViewMonth = can("viewMonthTotals");
  // Same rule as the work board: correcting a job is counter work, removing
  // one from the day's takings is not.
  const canDelete = can("deleteWorkLogs");
  const exportDisabled = busy || report.logs.length === 0;
  const tileBasis: `${number}%` = isTablet ? "22%" : "46%";

  return (
    <Screen>
      <ScreenHeader
        title="Өдрийн тайлан"
        subtitle={date === today ? `Өнөөдөр · ${date}` : date}
        onBack={onBack}
      />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? (
        <SyncErrorBanner onRetry={() => void syncNow()} />
      ) : null}

      <FlatList
        data={report.logs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Steps through days that have something on them rather than
                calendar days, so «previous» never lands on an empty Sunday
                the shop was shut for. */}
            <View
              style={[
                styles.dayBar,
                {
                  backgroundColor: theme.custom.cardBackground,
                  borderColor: theme.custom.subtleBorder,
                },
              ]}
            >
              <Pressable
                onPress={() => older !== null && setPickedDate(older)}
                disabled={older === null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Өмнөх өдөр"
                style={older === null ? styles.stepOff : undefined}
              >
                <Icon
                  source="chevron-left"
                  size={26}
                  color={theme.colors.onSurface}
                />
              </Pressable>

              <Pressable
                onPress={() => setDayPickerOpen(true)}
                style={styles.dayBarMiddle}
                accessibilityRole="button"
                accessibilityLabel="Өдөр сонгох"
              >
                <Text
                  style={[styles.dayBarDate, { color: theme.colors.onSurface }]}
                >
                  {date === today ? "Өнөөдөр" : date}
                </Text>
                <Text
                  style={[styles.dayBarMeta, { color: theme.custom.mutedText }]}
                >
                  {DAY_LABELS_MN[weekdayOf(date)] ?? ""} гараг
                  {date === today ? ` · ${date}` : ""} ▾
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  newer !== null &&
                  setPickedDate(newer === today ? null : newer)
                }
                disabled={newer === null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Дараах өдөр"
                style={newer === null ? styles.stepOff : undefined}
              >
                <Icon
                  source="chevron-right"
                  size={26}
                  color={theme.colors.onSurface}
                />
              </Pressable>
            </View>

            {canExport ? (
              <Pressable
                onPress={() => void exportExcel()}
                disabled={exportDisabled}
                accessibilityRole="button"
                accessibilityLabel="Тайлан харах, Excel хэвлэх"
                accessibilityState={{ disabled: exportDisabled }}
                style={({ pressed }) => [
                  styles.exportButton,
                  { backgroundColor: GREEN_SOLID },
                  exportDisabled ? styles.disabled : null,
                  pressed && !exportDisabled ? styles.pressed : null,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size={18} color="#ffffff" />
                ) : (
                  <Icon source="tray-arrow-down" size={20} color="#ffffff" />
                )}
                <Text style={styles.exportLabel}>
                  Тайлан харах / Excel хэвлэх
                </Text>
              </Pressable>
            ) : null}

            <LinearGradient
              colors={GREEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroLabel}>ОРОЙН НЭГТГЭЛ / НИЙТ ОРЛОГО</Text>
              <Text
                style={styles.heroValue}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCurrency(report.totalRevenue)}
              </Text>
              <Text style={styles.heroHint}>
                {date === today ? "Өнөөдөр" : date} хийгдсэн нийт{" "}
                {report.logs.length} гүйлгээ
              </Text>
              {/* Held out of the figure above, and said so. The hero used to
                  include work handed over on account, which read as money in
                  the till that was not there. */}
              {report.totalUnsettled > 0 ? (
                <Text style={styles.heroOwed}>
                  🧾 Тооцоотой {report.unsettledCount} ажил ·{" "}
                  {formatCurrency(report.totalUnsettled)} (энэ дүнд ороогүй)
                </Text>
              ) : null}
            </LinearGradient>

            {/* The month, in the same frame as the day. Same question one
                zoom level out, so it should not look like a different kind of
                answer — only the label and the darker green say which is
                which.

                Manager only, where the day above it is not. A day's takings
                are what the counter reconciles against the till at closing;
                the month is the shop's turnover, sits on screen for weeks, and
                the iPad is left face-up in a public room. */}
            {canViewMonth ? (
              <LinearGradient
                colors={MONTH_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.monthHero}
              >
                <Text style={styles.heroLabel}>
                  САРЫН НЭГТГЭЛ · {month.month}
                </Text>

                <View style={styles.monthRow}>
                  <View style={styles.flex}>
                    <Text style={styles.monthCaption}>ОРЛОГО</Text>
                    <Text
                      style={styles.monthValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCurrency(month.revenue)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.monthCaption}>ЗАРЛАГА</Text>
                    <Text
                      style={styles.monthSpent}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {month.spent > 0
                        ? `−${formatCurrency(month.spent)}`
                        : formatCurrency(0)}
                    </Text>
                  </View>
                </View>

                <View style={styles.monthDivider} />

                <View style={styles.monthRow}>
                  <Text style={styles.monthNetLabel}>Цэвэр үлдэгдэл</Text>
                  <Text
                    style={styles.monthNet}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrency(month.net)}
                  </Text>
                </View>

                <Text style={styles.heroHint}>
                  {month.orders} захиалга · {month.activeDays} өдөр
                </Text>
                {month.unsettled > 0 ? (
                  <Text style={styles.heroOwed}>
                    🧾 Тооцоотой {formatCurrency(month.unsettled)} (энэ дүнд
                    ороогүй)
                  </Text>
                ) : null}
              </LinearGradient>
            ) : null}

            <View style={styles.tileGrid}>
              <SummaryTile
                label="ДАНС"
                value={formatCurrency(report.totalTransfer)}
                icon="cellphone"
                tint="#1a56db"
                basis={tileBasis}
              />
              <SummaryTile
                label="БЭЛЭН"
                value={formatCurrency(report.totalCash)}
                icon="cash"
                tint="#16a34a"
                basis={tileBasis}
              />
              <SummaryTile
                label="КАРТ"
                value={formatCurrency(report.totalCard)}
                icon="credit-card-outline"
                tint="#a855f7"
                basis={tileBasis}
              />
              <SummaryTile
                label="НӨАТ"
                value={formatCurrency(report.totalVat)}
                icon="receipt"
                tint="#f59e0b"
                basis={tileBasis}
              />
              {/* Added as a pair rather than alone: a fifth tile on a phone
                  sits by itself with a hole beside it, and the net figure is
                  the thing a spending tile makes the reader work out anyway. */}
              <SummaryTile
                label="ЗАРЛАГА"
                value={
                  net.spent > 0
                    ? `−${formatCurrency(net.spent)}`
                    : formatCurrency(0)
                }
                icon="cash-minus"
                tint="#dc2626"
                basis={tileBasis}
              />
              <SummaryTile
                label="ЦЭВЭР"
                value={formatCurrency(net.net)}
                icon="wallet"
                tint={net.net < 0 ? "#dc2626" : GREEN_SOLID}
                basis={tileBasis}
              />
            </View>

            {/* What the day was made of. Six bookings of two passport photos
                is one fact about the shop, not six, and it is the one worth
                reading at closing time. */}
            {breakdown.length > 0 ? (
              <Card style={styles.panel}>
                <Text
                  style={[styles.panelTitle, { color: theme.colors.onSurface }]}
                >
                  📦 АНГИЛАЛ — {breakdown.length} төрөл
                </Text>
                {breakdown.map((group) => (
                  <View key={group.name} style={styles.panelRow}>
                    <View style={styles.flex}>
                      <Text
                        style={[
                          styles.panelLabel,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {group.name}
                      </Text>
                      <Text
                        style={[
                          styles.panelMeta,
                          { color: theme.custom.mutedText },
                        ]}
                      >
                        {group.quantity}ш
                        {group.orders > 1 ? ` · ${group.orders} захиалга` : ""}
                        {group.unsettled > 0
                          ? ` · ${formatCurrency(group.unsettled)} тооцоотой`
                          : ""}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.panelValue,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {formatCurrency(group.total)}
                    </Text>
                  </View>
                ))}
                <View
                  style={[
                    styles.panelFoot,
                    { borderTopColor: theme.custom.subtleBorder },
                  ]}
                >
                  <Text
                    style={[
                      styles.panelLabel,
                      { color: theme.custom.mutedText },
                    ]}
                  >
                    Нийт хийгдсэн ажил
                  </Text>
                  <Text
                    style={[
                      styles.panelValue,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    {formatCurrency(breakdownTotal)}
                  </Text>
                </View>
                {/* The breakdown counts every job; the hero counts only money
                    that arrived. Saying why they differ is cheaper than
                    letting somebody find the gap and distrust both. */}
                {report.totalUnsettled > 0 ? (
                  <Text
                    style={[
                      styles.panelNote,
                      { color: theme.custom.mutedText },
                    ]}
                  >
                    Хийгдсэн бүх ажил. Үүнээс{" "}
                    {formatCurrency(report.totalUnsettled)} нь тооцоотой тул
                    дээрх орлогод ороогүй.
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {/* The day's spending, and what it left. */}
            <Card style={styles.panel}>
              <Text
                style={[styles.panelTitle, { color: theme.colors.onSurface }]}
              >
                💸 ЗАРЛАГА — {spending.length}
              </Text>

              {spending.length === 0 ? (
                <Text
                  style={[styles.panelNote, { color: theme.custom.mutedText }]}
                >
                  {date === today
                    ? "Өнөөдөр зарлага гараагүй."
                    : "Энэ өдөр зарлага гараагүй."}
                </Text>
              ) : (
                <>
                  {spending.map((expense) => (
                    <View key={expense.id} style={styles.panelRow}>
                      <View style={styles.flex}>
                        <Text
                          style={[
                            styles.panelLabel,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {expense.note ||
                            expenseCategoryLabel(expense.category)}
                        </Text>
                        <Text
                          style={[
                            styles.panelMeta,
                            { color: theme.custom.mutedText },
                          ]}
                        >
                          {expenseCategoryLabel(expense.category)}
                          {expense.by ? ` · ${expense.by}` : ""}
                          {expenseTime(expense)
                            ? ` · ${expenseTime(expense)}`
                            : ""}
                        </Text>
                      </View>
                      <Text style={[styles.panelValue, { color: "#dc2626" }]}>
                        −{formatCurrency(expense.amount)}
                      </Text>
                    </View>
                  ))}
                  {spendingByCategory.length > 1 ? (
                    <Text
                      style={[
                        styles.panelNote,
                        { color: theme.custom.mutedText },
                      ]}
                    >
                      {spendingByCategory
                        .map(
                          (entry) =>
                            `${entry.label} ${formatCurrency(entry.total)}`,
                        )
                        .join("   ")}
                    </Text>
                  ) : null}
                </>
              )}

              <View
                style={[
                  styles.panelFoot,
                  { borderTopColor: theme.custom.subtleBorder },
                ]}
              >
                <Text
                  style={[styles.panelLabel, { color: theme.colors.onSurface }]}
                >
                  Цэвэр үлдэгдэл
                </Text>
                <Text
                  style={[
                    styles.panelNet,
                    { color: net.net < 0 ? "#dc2626" : GREEN_SOLID },
                  ]}
                >
                  {formatCurrency(net.net)}
                </Text>
              </View>
            </Card>

            <Card padded={false} style={styles.logHeaderCard}>
              <View
                style={[
                  styles.logHeaderRow,
                  { borderBottomColor: theme.custom.subtleBorder },
                ]}
              >
                <View style={styles.logHeaderLeft}>
                  <Icon
                    source="clipboard-text-outline"
                    size={16}
                    color={GREEN_SOLID}
                  />
                  <Text
                    style={[
                      styles.logHeaderTitle,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    ӨДРИЙН БҮРТГЭЛ — {report.logs.length} АЖИЛ
                  </Text>
                </View>
                <Text
                  style={[
                    styles.logHeaderDate,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {date}
                </Text>
              </View>

              {report.logs.length === 0 ? (
                <Text
                  style={[styles.emptyText, { color: theme.colors.onSurface }]}
                >
                  {date === today
                    ? "Өнөөдөр ажил бүртгэгдээгүй байна."
                    : "Энэ өдөр ажил бүртгэгдээгүй байна."}
                </Text>
              ) : null}
            </Card>
          </View>
        }
        renderItem={({ item, index }) => (
          <Card accentColor={workLogRowColor(item)}>
            <View style={styles.row}>
              <Text style={[styles.index, { color: theme.custom.mutedText }]}>
                {index + 1}
              </Text>
              <View style={styles.flex}>
                <Text
                  style={[styles.job, { color: theme.colors.onSurface }]}
                  numberOfLines={2}
                >
                  {item.job}
                </Text>
                <Text style={[styles.meta, { color: theme.custom.mutedText }]}>
                  {item.receivedTime ? `${item.receivedTime} · ` : ""}
                  {item.payType || "—"} · {performanceLabel(item)}
                </Text>
              </View>
              <View style={styles.trailing}>
                <Text style={[styles.amount, { color: theme.colors.primary }]}>
                  {formatCurrency(effectivePrice(item))}
                </Text>
                {item.hasVat ? <Text style={styles.vat}>НӨАТ</Text> : null}
              </View>
              {canDelete ? (
                <Text
                  style={
                    armedId === item.id ? styles.deleteArmed : styles.deleteIcon
                  }
                  onPress={() => deleteLog(item.id)}
                >
                  {armedId === item.id ? "Устгах?" : "🗑"}
                </Text>
              ) : null}
            </View>
          </Card>
        )}
      />

      <Portal>
        <Modal
          visible={dayPickerOpen}
          onDismiss={() => setDayPickerOpen(false)}
          contentContainerStyle={[
            styles.dayModal,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <Text
            style={[styles.dayModalTitle, { color: theme.colors.onSurface }]}
          >
            Тайлангийн өдөр
          </Text>

          {/* Months first. Picking one lands on its most recent day, which is
              what makes the monthly summary below follow — a month chip that
              only changed the summary and left the day list on September would
              have two different months on screen at once. */}
          {months.length > 1 ? (
            <View style={styles.monthChips}>
              {months.map((item) => {
                const active = monthOf(date) === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      const landing = latestDayOf(days, item);
                      if (landing === null) return;
                      setPickedDate(landing === today ? null : landing);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.monthChip,
                      {
                        backgroundColor: active
                          ? GREEN_SOLID
                          : theme.colors.surfaceVariant,
                        borderColor: active
                          ? GREEN_SOLID
                          : theme.custom.subtleBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthChipText,
                        { color: active ? "#ffffff" : theme.colors.onSurface },
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <FlatList
            data={days.filter((day) => day.startsWith(monthOf(date)))}
            keyExtractor={(item) => item}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const active = item === date;
              // Counted here rather than precomputed: the list is short, and a
              // day that turns out to be empty should say so before it is
              // opened.
              const jobs = workLogs.filter((log) => log.date === item).length;
              const spent = expenses.filter(
                (expense) => expense.date === item,
              ).length;
              return (
                <Pressable
                  onPress={() => {
                    setPickedDate(item === today ? null : item);
                    setDayPickerOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.dayRow,
                    {
                      backgroundColor: active
                        ? GREEN_SOLID
                        : theme.colors.surfaceVariant,
                      borderColor: active
                        ? GREEN_SOLID
                        : theme.custom.subtleBorder,
                    },
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.dayRowDate,
                        { color: active ? "#ffffff" : theme.colors.onSurface },
                      ]}
                    >
                      {item}
                      {item === today ? " · өнөөдөр" : ""}
                    </Text>
                    <Text
                      style={[
                        styles.dayRowMeta,
                        { color: active ? "#ffffff" : theme.custom.mutedText },
                      ]}
                    >
                      {DAY_LABELS_MN[weekdayOf(item)] ?? ""} гараг · {jobs} ажил
                      {spent > 0 ? ` · ${spent} зарлага` : ""}
                    </Text>
                  </View>
                  {active ? (
                    <Icon source="check" size={20} color="#ffffff" />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 12, paddingBottom: 40 },
  header: { gap: 12, paddingBottom: 12 },

  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  exportLabel: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  hero: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 4,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  heroValue: { color: "#ffffff", fontSize: 34, fontWeight: "900" },
  heroHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
  },
  monthHero: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12,
  },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  monthCaption: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  monthValue: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  monthSpent: { color: "#fecaca", fontSize: 20, fontWeight: "900" },
  monthDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginVertical: 2,
  },
  monthNetLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "800",
  },
  monthNet: { color: "#ffffff", fontSize: 22, fontWeight: "900" },
  dayBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 12,
  },
  dayBarMiddle: { flex: 1, alignItems: "center" },
  dayBarDate: { fontSize: 15, fontWeight: "900" },
  dayBarMeta: { fontSize: 10, fontWeight: "700", marginTop: 1 },
  stepOff: { opacity: 0.25 },
  dayModal: { margin: 24, borderRadius: 16, padding: 16, maxHeight: "75%" },
  dayModalTitle: { fontSize: 15, fontWeight: "900", marginBottom: 10 },
  monthChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  monthChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  monthChipText: { fontSize: 12, fontWeight: "800" },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  dayRowDate: { fontSize: 15, fontWeight: "800" },
  dayRowMeta: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  panel: { gap: 8, marginBottom: 12 },
  panelTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  panelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelLabel: { fontSize: 13, fontWeight: "700" },
  panelMeta: { fontSize: 10, marginTop: 2 },
  panelValue: { fontSize: 13, fontWeight: "900" },
  panelNet: { fontSize: 18, fontWeight: "900" },
  panelFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
  },
  panelNote: { fontSize: 10, fontWeight: "600", lineHeight: 14 },
  heroOwed: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexGrow: 1,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tileLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  tileValue: { fontSize: 16, fontWeight: "900" },

  logHeaderCard: { marginTop: 4 },
  logHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  logHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  logHeaderTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  logHeaderDate: { fontSize: 12, fontWeight: "800" },
  emptyText: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },

  separator: { height: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  index: { fontSize: 11, fontWeight: "900", width: 18 },
  flex: { flex: 1 },
  job: { fontSize: 13, fontWeight: "700", lineHeight: 17 },
  meta: { fontSize: 10, marginTop: 2 },
  trailing: { alignItems: "flex-end" },
  amount: { fontSize: 13, fontWeight: "900" },
  vat: { fontSize: 9, fontWeight: "700", color: "#6d28d9" },
  deleteIcon: { fontSize: 13, opacity: 0.35, paddingLeft: 4 },
  deleteArmed: {
    fontSize: 10,
    fontWeight: "900",
    color: "#dc2626",
    paddingLeft: 4,
  },
});

import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Checkbox,
  IconButton,
  Modal,
  Portal,
  SegmentedButtons,
  TextInput,
} from 'react-native-paper';

import { useAuth } from '@/authentication/AuthContext';
import { PermissionDenied } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import { useData } from '@/features/data/DataContext';
import { isNewerInvoiceNumber, nextInvoiceNumber } from '@/features/quotation/invoiceNumber';
import {
  READY_TIME_OPTIONS,
  addItem,
  applyPrefill,
  docTypeLabel,
  emptyQuotationForm,
  lineTotal,
  quotationTotals,
  removeItem,
  updateItem,
  validateQuotation,
} from '@/features/quotation/quotationLogic';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import type { RootStackParamList } from '@/navigation/types';
import { exportQuotationPdf, printQuotation } from '@/services/export/pdfService';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { DocType, QuotationForm, Result } from '@/types';
import { nextId } from '@/utils/id';
import { todayString } from '@/utils/date';
import { percentText, tugrugInWords } from '@/utils/mongolian';
import { formatCurrency } from '@/utils/price';

/**
 * Quotation / invoice / receipt builder.
 *
 * The web build rendered a live HTML preview and screenshotted it. Here the
 * preview is a native summary and the document itself is produced by
 * expo-print from the shared template — same layout, real vector text, and it
 * can also go straight to a printer.
 */

type QuotationRoute = RouteProp<RootStackParamList, 'Quotation'>;

/**
 * Reads a percentage box. A half-typed "12." must not collapse to 0 and wipe
 * the digit the clerk just entered, so an unreadable value is treated as zero
 * only once it really is unreadable.
 */
const toPercent = (raw: string): number => {
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
};

/**
 * How long the export buttons stay disabled if nothing ever comes back from
 * the share sheet. Long enough not to fire while a real share is in progress,
 * short enough that a dismissed sheet does not strand the screen.
 */
const BUSY_TIMEOUT_MS = 15000;

const toAmount = (raw: string): number => {
  const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function QuotationScreen(): React.JSX.Element {
  const theme = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute<QuotationRoute>();
  const { can } = useAuth();
  const { show, showError } = useToast();
  const { gutter } = useResponsive();
  const { workLogs } = useData();

  const [form, setForm] = useState<QuotationForm>(emptyQuotationForm);
  const [docType, setDocType] = useState<DocType>(route.params?.docType ?? 'quotation');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastNumber, setLastNumber] = useState('');
  const inFlight = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (watchdog.current !== null) clearTimeout(watchdog.current);
    },
    [],
  );

  // Apply an inbound prefill exactly once, when arriving from a work log.
  useEffect(() => {
    const prefill = route.params?.prefill;
    if (!prefill) return;
    setForm((previous) => applyPrefill(previous, prefill));
    if (prefill.docType) setDocType(prefill.docType);
    navigation.setParams({ prefill: undefined });
  }, [route.params?.prefill, navigation]);

  // The last number actually issued, so the next suggestion follows on.
  useEffect(() => {
    let alive = true;
    void readJson(STORAGE_KEYS.lastInvoiceNumber, '').then((stored) => {
      if (alive) setLastNumber(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Fills in the next number when the document becomes an invoice.
   *
   * The number is only a suggestion until the document is exported — leaving
   * the screen without printing anything does not burn it — and it never
   * overwrites something typed by hand.
   */
  useEffect(() => {
    if (docType !== 'invoice') return;
    setForm((previous) =>
      previous.docNumber === ''
        ? { ...previous, docNumber: nextInvoiceNumber(lastNumber, previous.date) }
        : previous,
    );
  }, [docType, lastNumber]);

  const commitInvoiceNumber = useCallback(async () => {
    if (docType !== 'invoice') return;
    const issued = form.docNumber.trim();
    if (!isNewerInvoiceNumber(issued, lastNumber)) return;
    setLastNumber(issued);
    await writeJson(STORAGE_KEYS.lastInvoiceNumber, issued);
  }, [docType, form.docNumber, lastNumber]);

  const today = todayString();
  const todayLogs = useMemo(
    () => workLogs.filter((log) => log.date === today && log.job),
    [workLogs, today],
  );

  const totals = quotationTotals(form);

  /**
   * Runs one export and always gives the buttons back.
   *
   * The share sheet does not reliably report a dismissal on either platform:
   * swipe it away and the promise can simply never settle, which left `busy`
   * stuck true and the PDF button dead until the screen was reopened. So the
   * flag is released by a watchdog as well as by the awaited result, and an
   * in-flight ref — not the state — is what blocks a double tap, because state
   * has not committed yet on the second press of a quick double tap.
   */
  const runExport = useCallback(
    async (action: () => Promise<Result<unknown>>) => {
      if (inFlight.current) return;
      const error = validateQuotation(form);
      if (error) {
        show(error, 'error');
        return;
      }

      inFlight.current = true;
      setBusy(true);
      const release = (): void => {
        inFlight.current = false;
        setBusy(false);
      };
      watchdog.current = setTimeout(release, BUSY_TIMEOUT_MS);

      try {
        const result = await action();
        if (!result.ok) showError(result.error);
        else void commitInvoiceNumber();
      } finally {
        if (watchdog.current !== null) clearTimeout(watchdog.current);
        watchdog.current = null;
        release();
      }
    },
    [form, show, showError, commitInvoiceNumber],
  );

  const exportPdf = useCallback(
    () => runExport(() => exportQuotationPdf(form, docType)),
    [runExport, form, docType],
  );

  const sendToPrinter = useCallback(
    () => runExport(() => printQuotation(form, docType)),
    [runExport, form, docType],
  );

  if (!can('viewQuotation')) {
    return (
      <Screen>
        <ScreenHeader title="Үнийн санал" onBack={() => navigation.goBack()} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={docTypeLabel(docType)}
        subtitle={form.date}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SegmentedButtons
            value={docType}
            onValueChange={(value) => setDocType(value)}
            density="small"
            buttons={[
              { value: 'quotation', label: 'Үнийн санал' },
              { value: 'invoice', label: 'Нэхэмжлэх' },
              { value: 'receipt', label: 'Зарлага' },
            ]}
          />

          <Card style={styles.card}>
            <TextInput
              mode="outlined"
              label="Захиалагч"
              value={form.customer}
              onChangeText={(value) => setForm((previous) => ({ ...previous, customer: value }))}
              dense
            />
            <TextInput
              mode="outlined"
              label="Утас"
              value={form.phone}
              onChangeText={(value) => setForm((previous) => ({ ...previous, phone: value }))}
              keyboardType="phone-pad"
              dense
            />
            <DateField
              label="Огноо"
              value={form.date}
              onChange={(value) => setForm((previous) => ({ ...previous, date: value }))}
            />


            <Text style={[styles.label, { color: theme.custom.mutedText }]}>
              Бэлэн болох хугацаа
            </Text>
            <View style={styles.chipRow}>
              {READY_TIME_OPTIONS.map((option) => (
                <Button
                  key={option}
                  mode={form.readyTime === option ? 'contained' : 'outlined'}
                  compact
                  onPress={() => setForm((previous) => ({ ...previous, readyTime: option }))}
                >
                  {option}
                </Button>
              ))}
            </View>

            <View style={styles.checkRow}>
              <Checkbox.Item
                label="НӨАТ 10% нэмэх"
                status={form.vatIncluded ? 'checked' : 'unchecked'}
                onPress={() =>
                  setForm((previous) => ({ ...previous, vatIncluded: !previous.vatIncluded }))
                }
                position="leading"
                style={styles.check}
                labelStyle={styles.checkLabel}
              />
              <Checkbox.Item
                label="Нийт дүн харуулах"
                status={form.showTotal ? 'checked' : 'unchecked'}
                onPress={() =>
                  setForm((previous) => ({ ...previous, showTotal: !previous.showTotal }))
                }
                position="leading"
                style={styles.check}
                labelStyle={styles.checkLabel}
              />
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Төлбөрийн нөхцөл
            </Text>

            {docType === 'invoice' ? (
              <>
                <TextInput
                  mode="outlined"
                  label="Нэхэмжлэхийн дугаар"
                  value={form.docNumber}
                  onChangeText={(value) =>
                    setForm((previous) => ({ ...previous, docNumber: value }))
                  }
                  right={
                    <TextInput.Icon
                      icon="autorenew"
                      onPress={() =>
                        setForm((previous) => ({
                          ...previous,
                          docNumber: nextInvoiceNumber(lastNumber, previous.date),
                        }))
                      }
                      accessibilityLabel="Дугаарыг дахин авах"
                    />
                  }
                  dense
                />
                <DateField
                  label="Төлөх огноо"
                  value={form.dueDate}
                  onChange={(value) => setForm((previous) => ({ ...previous, dueDate: value }))}
                  placeholder={form.date}
                />
              </>
            ) : null}

            <TextInput
              mode="outlined"
              label="Хөнгөлөлт (%)"
              value={form.discountPercent === 0 ? '' : String(form.discountPercent)}
              onChangeText={(value) =>
                setForm((previous) => ({ ...previous, discountPercent: toPercent(value) }))
              }
              keyboardType="decimal-pad"
              dense
            />

            {docType === 'invoice' ? (
              <>
                <Text style={[styles.label, { color: theme.custom.mutedText }]}>
                  Төлбөрийн төрөл
                </Text>
                <SegmentedButtons
                  value={form.paymentKind}
                  onValueChange={(value) =>
                    setForm((previous) => ({ ...previous, paymentKind: value }))
                  }
                  density="small"
                  buttons={[
                    { value: 'full', label: 'Бүтэн' },
                    { value: 'advance', label: 'Урьдчилгаа' },
                    { value: 'balance', label: 'Үлдэгдэл' },
                  ]}
                />

                {form.paymentKind === 'advance' ? (
                  <TextInput
                    mode="outlined"
                    label="Урьдчилгааны хувь (%)"
                    value={form.advancePercent === 0 ? '' : String(form.advancePercent)}
                    onChangeText={(value) =>
                      setForm((previous) => ({ ...previous, advancePercent: toPercent(value) }))
                    }
                    keyboardType="decimal-pad"
                    dense
                  />
                ) : null}

                {form.paymentKind === 'balance' ? (
                  <TextInput
                    mode="outlined"
                    label="Төлсөн урьдчилгаа (₮)"
                    value={form.advancePaid === 0 ? '' : String(form.advancePaid)}
                    onChangeText={(value) =>
                      setForm((previous) => ({ ...previous, advancePaid: toAmount(value) }))
                    }
                    keyboardType="number-pad"
                    dense
                  />
                ) : null}
              </>
            ) : null}

            <View style={styles.checkRow}>
              <Checkbox.Item
                label="Дүнг үсгээр"
                status={form.showAmountInWords ? 'checked' : 'unchecked'}
                onPress={() =>
                  setForm((previous) => ({
                    ...previous,
                    showAmountInWords: !previous.showAmountInWords,
                  }))
                }
                position="leading"
                style={styles.check}
                labelStyle={styles.checkLabel}
              />
              <Checkbox.Item
                label="Гарын үсгийн мөр"
                status={form.showSignature ? 'checked' : 'unchecked'}
                onPress={() =>
                  setForm((previous) => ({ ...previous, showSignature: !previous.showSignature }))
                }
                position="leading"
                style={styles.check}
                labelStyle={styles.checkLabel}
              />
            </View>
          </Card>

          <View style={styles.itemsHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Бүтээгдэхүүн ({form.items.length})
            </Text>
            <Button
              mode="text"
              compact
              icon="clipboard-arrow-down"
              onPress={() => setPickerOpen(true)}
            >
              Захиалгаас
            </Button>
          </View>

          {form.items.map((item, index) => (
            <Card key={item.id} style={styles.card}>
              <View style={styles.itemHead}>
                <Text style={[styles.itemIndex, { color: theme.custom.mutedText }]}>
                  #{index + 1}
                </Text>
                <Text style={[styles.itemTotal, { color: theme.colors.primary }]}>
                  {formatCurrency(lineTotal(item))}
                </Text>
                <IconButton
                  icon="close"
                  size={16}
                  onPress={() => setForm((previous) => removeItem(previous, item.id))}
                  disabled={form.items.length === 1}
                  accessibilityLabel="Мөр устгах"
                />
              </View>

              <TextInput
                mode="outlined"
                label="Нэр"
                value={item.name}
                onChangeText={(value) =>
                  setForm((previous) => updateItem(previous, item.id, 'name', value))
                }
                dense
              />
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Тоо"
                  value={String(item.qty)}
                  onChangeText={(value) =>
                    setForm((previous) =>
                      updateItem(previous, item.id, 'qty', Number(value) || 1),
                    )
                  }
                  keyboardType="number-pad"
                  style={styles.qty}
                  dense
                />
                <TextInput
                  mode="outlined"
                  label="Нэгж үнэ"
                  value={item.unitPrice}
                  onChangeText={(value) =>
                    setForm((previous) => updateItem(previous, item.id, 'unitPrice', value))
                  }
                  keyboardType="number-pad"
                  style={styles.flex}
                  dense
                />
              </View>
            </Card>
          ))}

          <Button
            mode="outlined"
            icon="plus"
            onPress={() => setForm((previous) => addItem(previous))}
          >
            Мөр нэмэх
          </Button>

          <Card style={{ ...styles.totals, backgroundColor: theme.colors.primaryContainer }}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
                Үндсэн дүн
              </Text>
              <Text style={[styles.totalValue, { color: theme.colors.onPrimaryContainer }]}>
                {formatCurrency(totals.base)}
              </Text>
            </View>
            {totals.discount > 0 ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
                  Хөнгөлөлт {percentText(form.discountPercent)}
                </Text>
                <Text style={[styles.totalValue, { color: '#dc2626' }]}>
                  −{formatCurrency(totals.discount)}
                </Text>
              </View>
            ) : null}
            {form.vatIncluded ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
                  НӨАТ 10%
                </Text>
                <Text style={[styles.totalValue, { color: '#16a34a' }]}>
                  +{formatCurrency(totals.vat)}
                </Text>
              </View>
            ) : null}
            {form.paymentKind === 'advance' ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
                  Урьдчилгаа {percentText(form.advancePercent)}
                </Text>
                <Text style={[styles.totalValue, { color: theme.colors.onPrimaryContainer }]}>
                  {formatCurrency(totals.advance)}
                </Text>
              </View>
            ) : null}
            {form.paymentKind === 'balance' && totals.advancePaid > 0 ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
                  Урьдчилгаа төлсөн
                </Text>
                <Text style={[styles.totalValue, { color: '#dc2626' }]}>
                  −{formatCurrency(totals.advancePaid)}
                </Text>
              </View>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={[styles.grandLabel, { color: theme.colors.onPrimaryContainer }]}>
                Нийт дүн
              </Text>
              <Text style={[styles.grandValue, { color: theme.colors.onPrimaryContainer }]}>
                {formatCurrency(totals.grand)}
              </Text>
            </View>
            {form.showAmountInWords ? (
              <Text style={[styles.words, { color: theme.colors.onPrimaryContainer }]}>
                {tugrugInWords(totals.grand)}
              </Text>
            ) : null}
          </Card>

          <View style={styles.row}>
            <Button
              mode="contained"
              icon="file-pdf-box"
              onPress={() => void exportPdf()}
              disabled={busy}
              style={styles.flex}
            >
              PDF
            </Button>
            <Button
              mode="contained-tonal"
              icon="printer"
              onPress={() => void sendToPrinter()}
              disabled={busy}
              style={styles.flex}
            >
              Хэвлэх
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Modal
          visible={pickerOpen}
          onDismiss={() => setPickerOpen(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.custom.cardBackground }]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Өнөөдрийн захиалга
          </Text>
          <ScrollView style={styles.modalList}>
            {todayLogs.map((log) => (
              <Button
                key={log.id}
                mode="outlined"
                style={styles.pickRow}
                contentStyle={styles.pickContent}
                onPress={() => {
                  setForm((previous) => ({
                    ...previous,
                    customer: previous.customer || log.customer || '',
                    items: [
                      ...previous.items.filter((item) => item.name),
                      {
                        id: nextId(),
                        name: log.job || '',
                        format: '',
                        material: '',
                        qty: Number(log.quantity) || 1,
                        unitPrice: log.price || '',
                      },
                    ],
                  }));
                  setPickerOpen(false);
                }}
              >
                {log.job} — {log.price ? formatCurrency(Number(log.price)) : '—'}
              </Button>
            ))}
            {todayLogs.length === 0 ? (
              <Text style={[styles.empty, { color: theme.custom.mutedText }]}>
                Өнөөдөр захиалга алга
              </Text>
            ) : null}
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingVertical: 12, gap: 10, paddingBottom: 48 },
  card: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  qty: { width: 90 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  checkRow: { flexDirection: 'row', flexWrap: 'wrap' },
  check: { paddingHorizontal: 0, flexGrow: 1, flexBasis: '50%' },
  checkLabel: { fontSize: 12, textAlign: 'left' },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemIndex: { fontSize: 11, fontWeight: '800' },
  itemTotal: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  totals: { gap: 6, marginTop: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 13, fontWeight: '800' },
  grandLabel: { fontSize: 14, fontWeight: '900' },
  grandValue: { fontSize: 18, fontWeight: '900' },
  words: { fontSize: 11, fontStyle: 'italic', textAlign: 'right', marginTop: 2 },
  modal: { margin: 16, borderRadius: 20, padding: 16, gap: 10, maxHeight: '75%' },
  modalList: { maxHeight: 400 },
  pickRow: { marginBottom: 6, borderRadius: 12 },
  pickContent: { justifyContent: 'flex-start' },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 12 },
});

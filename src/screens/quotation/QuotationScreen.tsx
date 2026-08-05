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
import { claimInvoiceNumber, suggestInvoiceNumber } from '@/features/quotation/invoiceRegistry';
import {
  READY_TIME_OPTIONS,
  addItem,
  applyPrefill,
  copyForReceipt,
  docTypeLabel,
  emptyDocumentDrafts,
  isBlankDocument,
  lineTotal,
  quotationTotals,
  removeItem,
  updateItem,
  validateQuotation,
  type DocumentDrafts,
} from '@/features/quotation/quotationLogic';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/hooks/useToast';
import type { RootStackParamList } from '@/navigation/types';
import { getDeviceId } from '@/services/device/deviceId';
import { exportQuotationPdf, printQuotation } from '@/services/export/pdfService';
import { buildQuotationHtml } from '@/services/export/quotationTemplate';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import { useAppTheme } from '@/theme/ThemeProvider';
import type { DocType, QuotationForm, Result } from '@/types';
import { nextId } from '@/utils/id';
import { todayString } from '@/utils/date';
import { percentText, tugrugInWords } from '@/utils/mongolian';
import { unitPriceOf } from '@/features/worklogs/workLogLogic';
import { formatCurrency } from '@/utils/price';

import { DocumentPreview } from './DocumentPreview';

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

  /**
   * One draft per document type rather than one shared form.
   *
   * A quotation and the invoice that follows it are different documents with
   * different terms, and the shop often needs both for the same job — sharing
   * one draft meant opening the invoice tab overwrote what had been quoted.
   */
  const [drafts, setDrafts] = useState<DocumentDrafts>(emptyDocumentDrafts);
  const [docType, setDocType] = useState<DocType>(route.params?.docType ?? 'quotation');
  const form = drafts[docType];

  /** Edits the draft belonging to the type currently on screen. */
  const setForm = useCallback(
    (update: QuotationForm | ((previous: QuotationForm) => QuotationForm)) => {
      setDrafts((previous) => ({
        ...previous,
        [docType]: typeof update === 'function' ? update(previous[docType]) : update,
      }));
    },
    [docType],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which half of the screen is showing: the fields, or the document itself. */
  const [pane, setPane] = useState<'form' | 'preview'>('form');
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
    // The prefill names the document it is for, so it has to land on that
    // draft — writing it to whatever tab happens to be open would fill in a
    // quotation and then switch to an empty invoice.
    const target = prefill.docType ?? docType;
    setDrafts((previous) => ({
      ...previous,
      [target]: applyPrefill(previous[target], prefill),
    }));
    if (prefill.docType) setDocType(prefill.docType);
    navigation.setParams({ prefill: undefined });
  }, [route.params?.prefill, navigation, docType]);

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
   * Starts a receipt from the invoice it belongs to.
   *
   * The two describe one sale and are filed together under the same number, so
   * retyping the customer and every line would only be a chance to get them
   * different. Copied once, while the receipt is still untouched — after that
   * it is edited on its own, because the shop sometimes hands over part of an
   * order and the paper that goes with the goods has to say what actually went.
   */
  useEffect(() => {
    if (docType !== 'receipt') return;
    setDrafts((previous) =>
      isBlankDocument(previous.receipt) && !isBlankDocument(previous.invoice)
        ? { ...previous, receipt: copyForReceipt(previous.invoice) }
        : previous,
    );
  }, [docType]);

  /**
   * Fills in the next number when the document becomes an invoice.
   *
   * Asks the shared registry first so the two devices do not both offer the
   * same number, and falls back to the local high-water mark when offline. It
   * is still only a suggestion — the number is not reserved until export — and
   * it never overwrites something typed by hand.
   */
  useEffect(() => {
    if (docType !== 'invoice') return;
    let alive = true;

    // Writes to the invoice draft by name rather than through `setForm`: this
    // only ever concerns that one document, and the reply from the registry
    // arrives long after the clerk may have switched tabs.
    const fillNumber = (pick: (previous: QuotationForm) => string): void => {
      setDrafts((previous) => {
        const invoice = previous.invoice;
        const next = pick(invoice);
        return next === invoice.docNumber
          ? previous
          : { ...previous, invoice: { ...invoice, docNumber: next } };
      });
    };

    fillNumber((invoice) =>
      invoice.docNumber === ''
        ? nextInvoiceNumber(lastNumber, invoice.date)
        : invoice.docNumber,
    );

    void suggestInvoiceNumber(todayString(), lastNumber).then((suggested) => {
      if (!alive) return;
      // Only replaces the placeholder written above, never a number the clerk
      // has since typed or a claim already made.
      fillNumber((invoice) =>
        invoice.docNumber === nextInvoiceNumber(lastNumber, invoice.date)
          ? suggested
          : invoice.docNumber,
      );
    });

    return () => {
      alive = false;
    };
  }, [docType, lastNumber]);

  /**
   * Reserves the number in the shared registry and records it locally.
   * Returns the number actually secured, which may differ from the suggestion
   * if the other device claimed it first.
   */
  const reserveInvoiceNumber = useCallback(async (): Promise<string> => {
    const desired = form.docNumber.trim();
    if (docType !== 'invoice' || desired === '') return desired;

    const secured = await claimInvoiceNumber({
      desired,
      date: form.date,
      deviceId: await getDeviceId(),
      customer: form.customer,
    });

    if (isNewerInvoiceNumber(secured, lastNumber)) {
      setLastNumber(secured);
      await writeJson(STORAGE_KEYS.lastInvoiceNumber, secured);
    }
    return secured;
  }, [docType, form.docNumber, form.date, form.customer, lastNumber]);

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
    async (action: (document: QuotationForm) => Promise<Result<unknown>>) => {
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
        // The number is reserved *before* the document is rendered, so what is
        // printed is the number actually held. Reserving afterwards would let
        // a contested number reach paper and only then be corrected on screen.
        const secured = await reserveInvoiceNumber();
        const document = secured === form.docNumber ? form : { ...form, docNumber: secured };
        if (document !== form) {
          setForm(document);
          show(`Дугаар ${secured} болж өөрчлөгдлөө`, 'info');
        }

        const result = await action(document);
        if (!result.ok) showError(result.error);
      } finally {
        if (watchdog.current !== null) clearTimeout(watchdog.current);
        watchdog.current = null;
        release();
      }
    },
    [form, show, showError, reserveInvoiceNumber, setForm],
  );

  const exportPdf = useCallback(
    () => runExport((document) => exportQuotationPdf(document, docType)),
    [runExport, docType],
  );

  const sendToPrinter = useCallback(
    () => runExport((document) => printQuotation(document, docType)),
    [runExport, docType],
  );

  // Only built while the preview is open: rebuilding the whole document on
  // every keystroke in the form would be wasted work nobody can see.
  const previewHtml = useMemo(
    () => (pane === 'preview' ? buildQuotationHtml(form, docType) : ''),
    [pane, form, docType],
  );

  const exportButtons = (
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

      <View style={[styles.selectors, { paddingHorizontal: gutter }]}>
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
        <SegmentedButtons
          value={pane}
          onValueChange={(value) => setPane(value)}
          density="small"
          buttons={[
            { value: 'form', label: 'Мэдээлэл', icon: 'form-select' },
            {
              value: 'preview',
              label: 'Урьдчилан харах',
              icon: 'file-eye-outline',
            },
          ]}
        />
      </View>

      {pane === 'preview' ? (
        <View style={[styles.previewPane, { paddingHorizontal: gutter }]}>
          <DocumentPreview html={previewHtml} />
          {exportButtons}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                    onPress={() =>
                      setForm((previous) => ({
                        ...previous,
                        readyTime: option,
                      }))
                    }
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
                    setForm((previous) => ({
                      ...previous,
                      vatIncluded: !previous.vatIncluded,
                    }))
                  }
                  position="leading"
                  style={styles.check}
                  labelStyle={styles.checkLabel}
                />
                <Checkbox.Item
                  label="Нийт дүн харуулах"
                  status={form.showTotal ? 'checked' : 'unchecked'}
                  onPress={() =>
                    setForm((previous) => ({
                      ...previous,
                      showTotal: !previous.showTotal,
                    }))
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
                  setForm((previous) => ({
                    ...previous,
                    discountPercent: toPercent(value),
                  }))
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
                      setForm((previous) => ({
                        ...previous,
                        paymentKind: value,
                      }))
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
                        setForm((previous) => ({
                          ...previous,
                          advancePercent: toPercent(value),
                        }))
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
                        setForm((previous) => ({
                          ...previous,
                          advancePaid: toAmount(value),
                        }))
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
                    setForm((previous) => ({
                      ...previous,
                      showSignature: !previous.showSignature,
                    }))
                  }
                  position="leading"
                  style={styles.check}
                  labelStyle={styles.checkLabel}
                />
                {/* The stamp sits on the signature line, so it is meaningless
                  without one — the box is disabled rather than hidden so it is
                  clear what has to be turned on first. */}
                <Checkbox.Item
                  label="Тамга, гарын үсэг"
                  status={form.showStamp && form.showSignature ? 'checked' : 'unchecked'}
                  disabled={!form.showSignature}
                  onPress={() =>
                    setForm((previous) => ({
                      ...previous,
                      showStamp: !previous.showStamp,
                    }))
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

            <Card
              style={{
                ...styles.totals,
                backgroundColor: theme.colors.primaryContainer,
              }}
            >
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

            {exportButtons}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

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
                        // The unit price, not the line total: `price` on a work
                        // log already has the quantity in it.
                        unitPrice: String(unitPriceOf(log)),
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
  selectors: { paddingTop: 8, gap: 8 },
  previewPane: { flex: 1, paddingVertical: 10, gap: 10 },
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
  words: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 2,
  },
  modal: {
    margin: 16,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    maxHeight: '75%',
  },
  modalList: { maxHeight: 400 },
  pickRow: { marginBottom: 6, borderRadius: 12 },
  pickContent: { justifyContent: 'flex-start' },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 12 },
});

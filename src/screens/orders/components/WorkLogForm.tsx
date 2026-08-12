import { Image } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Modal, Portal, TextInput } from 'react-native-paper';

import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchBar } from '@/components/ui/SearchBar';
import { TimeField } from '@/components/ui/TimeField';
import {
  applyProduct,
  applyQuantity,
  applyUnitPrice,
  buildProductList,
  filterProducts,
  imageForJob,
  productImageMap,
} from '@/features/worklogs/workLogLogic';
import {
  PAY_METHODS,
  emptyPaySplit,
  splitRemainder,
  splitTotal,
} from '@/features/worklogs/paySplit';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppTheme } from '@/theme/ThemeProvider';
import type {
  InventoryItem,
  PayMethodKey,
  PayType,
  PaymentStatus,
  ServiceItem,
  WorkLogForm as FormShape,
} from '@/types';
import { formatCurrency } from '@/utils/price';
import { VAT_RATE } from '@/constants/config';
import {
  DAY_LABELS_MN,
  MONTH_NAMES_MN,
  daysInMonth,
  shiftDate,
  todayString,
  weekdayOf,
} from '@/utils/date';


/**
 * New-job form.
 *
 * Eight numbered steps in the order the counter actually works: who it is for,
 * what it is, how many and how much, when it is due, how they pay, and last
 * the details. It was ten, and the two that went were doing nothing — a total
 * the clerk had just typed, restated in a coloured bar, and a square-metre
 * calculator that duplicates the Тооцоолол tab.
 *
 * Choices are full-width tap targets rather than dropdowns wherever there are
 * two or three of them — the shop fills this in on a shared iPad, often
 * one-handed. The customer type is the exception: it is answered once per job
 * and buying a whole row for it pushed everything else down.
 *
 * The quantity/unit-price/total coupling is still delegated to `workLogLogic`;
 * this component only renders. Total must always equal `unitPrice × quantity`,
 * and clearing the quantity must clear the total rather than snapping to zero.
 */

interface Choice {
  value: string;
  label: string;
}

const CUSTOMER_TYPES: Choice[] = [
  { value: 'Хувь хүн', label: '👤 Хувь хүн' },
  { value: 'Байгууллага', label: '🏢 Байгууллага' },
];

const PAY_TYPES: Choice[] = [
  { value: 'Бэлэн', label: '💵 Бэлэн' },
  { value: 'Данс', label: '🏦 Данс' },
  { value: 'Карт', label: '💳 Карт' },
];

/**
 * "Төлөгдсөн" is what gets stored — "Бүрэн төлсөн" is only the label, so
 * existing records and the Excel exporter keep matching on the same string.
 */
const PAYMENT_STATUSES: Choice[] = [
  { value: 'Төлөгдөөгүй', label: 'Төлөгдөөгүй' },
  { value: 'Урьдчилгаа', label: 'Урьдчилгаа' },
  { value: 'Төлөгдсөн', label: 'Бүрэн төлсөн' },
];

/**
 * «НӨАТ-гүй» leads, because that is what most jobs are — and it is the option
 * a blank form already sits on, so the highlighted button now agrees with the
 * left-to-right reading order instead of contradicting it.
 */
const VAT_CHOICES: Choice[] = [
  { value: 'no', label: 'НӨАТ-гүй' },
  { value: 'yes', label: 'НӨАТ-тэй' },
];

/** Common drop-off times in the shop's day. */
const RECEIVED_PRESETS = ['10:00', '12:00', '14:00', '16:00'] as const;

/** How far ahead the deadline shortcuts reach, in minutes. */
const DEADLINE_OFFSETS = [30, 60, 120, 180] as const;

/**
 * Deadline shortcuts counted forward from now.
 *
 * A fixed list offered 12:00 and 15:00 all afternoon — times already past, so
 * every job taken after 15:00 had to go through the hour and minute columns.
 * Counting from the current time means the first tap is always plausible.
 */
function deadlinesFromNow(from: Date = new Date()): string[] {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return DEADLINE_OFFSETS.map((minutes) => {
    const at = new Date(from.getTime() + minutes * 60_000);
    // Round to the next five so the chip reads 17:15, not 17:13.
    at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0);
    return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  });
}

/** One-tap day offsets shown above the calendar in the «Маргааш» picker. */
const TOMORROW_PRESETS = [
  { label: 'Маргааш', days: 1 },
  { label: '+2 хоног', days: 2 },
  { label: '+3 хоног', days: 3 },
  { label: '+7 хоног', days: 7 },
] as const;

const stepMonth = (month: string, dir: number): string => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1 + dir, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthTitle = (month: string): string => {
  const [year, mo] = month.split('-');
  const index = Number(mo) - 1;
  return `${year ?? ''} · ${MONTH_NAMES_MN[index] ?? ''}`;
};

interface WorkLogFormProps {
  form: FormShape;
  onChange: (next: FormShape) => void;
  onSubmit: () => void;
  onCancel: () => void;
  services: readonly ServiceItem[];
  inventory: readonly InventoryItem[];
  /** Reads «Хадгалах» when an existing job is being corrected. */
  submitLabel?: string;
}

function WorkLogFormBase({
  form,
  onChange,
  onSubmit,
  onCancel,
  services,
  inventory,
  submitLabel = 'Бүртгэх',
}: WorkLogFormProps): React.JSX.Element {
  const theme = useAppTheme();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [customerTypeOpen, setCustomerTypeOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [dealDraft, setDealDraft] = useState('');
  const [tomorrowPickerVisible, setTomorrowPickerVisible] = useState(false);
  const [tomorrowMonth, setTomorrowMonth] = useState(() => todayString().slice(0, 7));

  /** Opens the picker on the month that already holds the chosen day. */
  const openTomorrowPicker = (): void => {
    setTomorrowMonth((form.tomorrowDate || shiftDate(todayString(), 1)).slice(0, 7));
    setTomorrowPickerVisible(true);
  };

  const commitTomorrow = (date: string): void => {
    onChange({ ...form, isTomorrow: true, tomorrowDate: date });
    setTomorrowPickerVisible(false);
  };

  const clearTomorrow = (): void => {
    onChange({ ...form, isTomorrow: false, tomorrowDate: '' });
    setTomorrowPickerVisible(false);
  };

  const tomorrowCells = useMemo(() => {
    const first = `${tomorrowMonth}-01`;
    const blanks = weekdayOf(first);
    const total = daysInMonth(tomorrowMonth);
    const out: (string | null)[] = Array.from({ length: blanks }, () => null);
    for (let day = 1; day <= total; day += 1) {
      out.push(`${tomorrowMonth}-${String(day).padStart(2, '0')}`);
    }
    return out;
  }, [tomorrowMonth]);

  const products = useMemo(
    () => buildProductList(services, inventory),
    [services, inventory],
  );

  // A work log names its product rather than pointing at it, so the photo is
  // looked up by name — which also means a job typed by hand still finds one.
  const productImages = useMemo(
    () => productImageMap(services, inventory),
    [services, inventory],
  );
  const jobImage = imageForJob(productImages, form.job);
  const filtered = useMemo(
    () => filterProducts(products, debouncedSearch).slice(0, 60),
    [products, debouncedSearch],
  );

  const set = <K extends keyof FormShape>(key: K, value: FormShape[K]): void =>
    onChange({ ...form, [key]: value });

  const total = Number(form.price) || 0;
  const vatAmount = Math.round(total * VAT_RATE);
  const grandTotal = form.hasVat ? total + vatAmount : total;
  const quantity = Number(form.quantity) || 1;

  /** What a mixed payment still leaves outstanding; 0 once it reconciles. */
  const splitLeft = splitRemainder(form);
  const splitValue = (key: PayMethodKey): string => {
    const amount = form.paySplit?.[key] ?? 0;
    return amount === 0 ? '' : String(amount);
  };

  // Recomputed when the form opens rather than on every keystroke; a shortcut
  // drifting by a minute while the clerk types would be worse than useless.
  const deadlinePresets = useMemo(() => deadlinesFromNow(), []);

  const step = (delta: number): void =>
    onChange(applyQuantity(form, String(Math.max(1, quantity + delta))));

  const customerTypeLabel =
    CUSTOMER_TYPES.find((option) => option.value === form.customerType)?.label ??
    'Харилцагчийн төрөл сонгох';

  /**
   * Choosing «Байгууллага» turns VAT on.
   *
   * Companies need a VAT receipt and individuals almost never ask for one, so
   * the clerk was setting the same two fields together every time — and
   * forgetting the second one is an invoice the customer cannot claim back.
   * It stays a switch, so an unusual job can still be changed by hand.
   */
  const chooseCustomerType = (value: string): void => {
    onChange({
      ...form,
      customerType: value,
      hasVat: value === 'Байгууллага' ? true : form.hasVat,
    });
    setCustomerTypeOpen(false);
  };

  /**
   * An unpaid job is one still awaiting settlement, so it lands on the board
   * under «Тооцоо» without anyone setting it twice — and marking it paid takes
   * that flag off again. Any other status the clerk chose is left alone; only
   * the settlement flag is ours to manage.
   */
  const choosePaymentStatus = (value: PaymentStatus): void => {
    const unpaid = value === 'Төлөгдөөгүй';
    const settling = form.status === 'Тооцоотой' || form.status === 'Болоогүй';
    onChange({
      ...form,
      paymentStatus: value,
      status: unpaid ? 'Тооцоотой' : settling ? '' : form.status,
    });
  };

  /**
   * Payment method, including the mixed case.
   *
   * «Холимог» is the one option that carries data of its own, so it seeds an
   * empty split on the way in and drops it on the way out — leaving a stale
   * split behind would keep crediting the day's cash column for a job that is
   * now plainly on a card.
   */
  const choosePayType = (value: string): void => {
    const next = (form.payType === value ? '' : value) as PayType;
    onChange({
      ...form,
      payType: next,
      paySplit: next === 'Холимог' ? (form.paySplit ?? emptyPaySplit()) : undefined,
    });
  };

  /** Writes one slice of a mixed payment, in whole tögrög. */
  const setSplit = (key: PayMethodKey, digits: string): void => {
    const split = form.paySplit ?? emptyPaySplit();
    onChange({
      ...form,
      paySplit: { ...split, [key]: Number(digits.replace(/[^0-9]/g, '')) || 0 },
    });
  };

  /** Applies a negotiated unit price to the job as it stands. */
  const applyDeal = (): void => {
    const agreed = dealDraft.replace(/[^0-9]/g, '');
    if (agreed !== '') onChange(applyUnitPrice({ ...form, agreedPrice: agreed }, agreed));
    setDealOpen(false);
  };

  /** A row of equal-width choice buttons. */
  const renderChoices = (
    options: readonly Choice[],
    selected: string,
    onSelect: (value: string) => void,
    variant: 'solid' | 'dashed' = 'solid',
  ): React.JSX.Element => (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.choice,
              variant === 'dashed' ? styles.choiceDashed : null,
              {
                backgroundColor: active ? theme.colors.primary : theme.custom.cardBackground,
                borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const stepLabel = (text: string): React.JSX.Element => (
    <Text style={[styles.stepLabel, { color: theme.custom.mutedText }]}>{text}</Text>
  );

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.custom.cardBackground,
      borderColor: theme.custom.subtleBorder,
    },
  ];

  return (
    <View style={styles.root}>
      {/* 1 ─ who the job is for, and how to reach them */}
      <View style={cardStyle}>
        {stepLabel('1. Харилцагч')}
        <View>
          <Pressable
            onPress={() => setCustomerTypeOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: customerTypeOpen }}
            accessibilityLabel={`Харилцагчийн төрөл: ${customerTypeLabel}`}
            style={[
              styles.dropdown,
              {
                backgroundColor: theme.custom.cardBackground,
                borderColor: theme.custom.subtleBorder,
              },
            ]}
          >
            <Text
              style={[styles.dropdownText, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {customerTypeLabel}
            </Text>
            <Text style={[styles.dropdownChevron, { color: theme.custom.mutedText }]}>
              {customerTypeOpen ? '▴' : '▾'}
            </Text>
          </Pressable>

        </View>

        {/* Opens underneath the field it belongs to. A centred sheet for two
            options covered the form to ask a question the clerk answers
            without looking. */}
        {customerTypeOpen ? (
          <View
            style={[
              styles.optionList,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.custom.subtleBorder,
              },
            ]}
          >
            {CUSTOMER_TYPES.map((option, index) => {
              const active = form.customerType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => chooseCustomerType(active ? '' : option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.optionRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.custom.subtleBorder,
                    },
                    active && { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionRowText,
                      { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {active ? (
                    <Text style={[styles.optionTick, { color: theme.colors.onPrimary }]}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {customerTypeOpen ? (
          <Text style={[styles.sheetHint, { color: theme.custom.mutedText }]}>
            Байгууллага сонгоход НӨАТ өөрөө асна.
          </Text>
        ) : null}

        <View style={[styles.deadlineRow, styles.spaced]}>
          <TextInput
            mode="outlined"
            placeholder="Захиалагчийн нэр"
            value={form.customer}
            onChangeText={(value) => set('customer', value)}
            style={styles.flex}
            dense
          />
          <TextInput
            mode="outlined"
            placeholder="99112233"
            value={form.phone}
            onChangeText={(value) => set('phone', value)}
            keyboardType="phone-pad"
            style={styles.flex}
            dense
          />
        </View>
      </View>

      {/* 2 ─ what is being made */}
      <View style={cardStyle}>
        {stepLabel('2. Бүтээгдэхүүн')}
        <View style={styles.choiceRow}>
          <Pressable
            onPress={() => setPickerVisible(true)}
            accessibilityRole="button"
            style={[
              styles.choice,
              styles.choiceDashed,
              { borderColor: theme.colors.primary, backgroundColor: theme.custom.cardBackground },
            ]}
          >
            <Text style={[styles.choiceText, { color: theme.colors.primary }]}>
              📦 Бүтээгдэхүүн сонгох
            </Text>
          </Pressable>
          {/* Was «📐 МКВ», which duplicated the Тооцоолол tab. What the counter
              actually does here is agree a price off the list one. */}
          <Pressable
            onPress={() => {
              setDealDraft(form.unitPrice);
              setDealOpen(true);
            }}
            accessibilityRole="button"
            style={[
              styles.choice,
              styles.choiceDashed,
              { borderColor: theme.colors.primary, backgroundColor: theme.custom.cardBackground },
            ]}
          >
            <Text style={[styles.choiceText, { color: theme.colors.primary }]}>
              🤝 Тохиролцоо
            </Text>
          </Pressable>
        </View>
        <TextInput
          mode="outlined"
          placeholder="Ажлын нэр / Бүтээгдэхүүн *"
          value={form.job}
          onChangeText={(value) => set('job', value)}
          style={styles.spaced}
          dense
        />

        {/* Confirmation that the right product was picked. It sits at the foot
            of this step, centred, because it answers the question this step
            asks — not a decoration on the row above. */}
        {jobImage ? (
          <Pressable
            onPress={() => setZoomed(true)}
            accessibilityRole="button"
            accessibilityLabel={`${form.job} зураг томруулах`}
            style={styles.jobImageWrap}
          >
            <Image
              source={{ uri: jobImage }}
              style={styles.jobImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
            />
          </Pressable>
        ) : null}
      </View>

      {/* 3 & 4 ─ how many, at what price */}
      <View style={cardStyle}>
        <View style={styles.split}>
          <View style={styles.flex}>
            {stepLabel('3. Тоо ширхэг')}
            {/* The middle cell is a real input: ± is fine for 1–5, but an
                order of 250 name cards should not take 249 taps. */}
            <View style={[styles.stepper, { borderColor: theme.custom.subtleBorder }]}>
              <Pressable
                onPress={() => step(-1)}
                accessibilityRole="button"
                accessibilityLabel="Тоо ширхэг хасах"
                style={styles.stepperButton}
              >
                <Text style={[styles.stepperSign, { color: theme.colors.primary }]}>−</Text>
              </Pressable>
              <TextInput
                mode="flat"
                value={form.quantity === '' ? '' : String(form.quantity)}
                onChangeText={(value) =>
                  onChange(applyQuantity(form, value.replace(/[^0-9]/g, '')))
                }
                keyboardType="number-pad"
                selectTextOnFocus
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                textAlign="center"
                style={[styles.stepperInput, { backgroundColor: 'transparent' }]}
                contentStyle={styles.stepperInputText}
                accessibilityLabel="Тоо ширхэг"
                dense
              />
              <Pressable
                onPress={() => step(1)}
                accessibilityRole="button"
                accessibilityLabel="Тоо ширхэг нэмэх"
                style={styles.stepperButton}
              >
                <Text style={[styles.stepperSign, { color: theme.colors.primary }]}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.flex}>
            {stepLabel('Нэгж үнэ (₮)')}
            <TextInput
              mode="outlined"
              placeholder="0"
              value={form.unitPrice}
              onChangeText={(value) => onChange(applyUnitPrice(form, value))}
              keyboardType="number-pad"
              dense
            />
          </View>
        </View>
      </View>

      {/* 4 ─ VAT, right where the price it changes was just typed */}
      <View style={cardStyle}>
        {stepLabel('4. НӨАТ')}
        {renderChoices(VAT_CHOICES, form.hasVat ? 'yes' : 'no', (value) =>
          set('hasVat', value === 'yes'),
        )}

        {/* The total is always here — taking it away with VAT left a job with
            no visible amount anywhere on the form. The two VAT lines above it
            appear only when VAT is actually charged, so a plain job is one
            line rather than three. */}
        {total > 0 ? (
          <View
            style={[
              styles.breakdown,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.custom.subtleBorder,
              },
            ]}
          >
            {form.hasVat ? (
              <>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.custom.mutedText }]}>
                    Үнэ ({quantity} × {formatCurrency(Number(form.unitPrice) || 0)})
                  </Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>
                    {formatCurrency(total)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.custom.mutedText }]}>
                    НӨАТ (10%)
                  </Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.onSurface }]}>
                    +{formatCurrency(vatAmount)}
                  </Text>
                </View>
              </>
            ) : null}

            <View
              style={[
                styles.breakdownTotal,
                form.hasVat
                  ? { borderTopColor: theme.custom.subtleBorder }
                  : styles.breakdownTotalAlone,
              ]}
            >
              <Text style={[styles.breakdownTotalLabel, { color: theme.colors.onSurface }]}>
                Нийт төлөх
              </Text>
              <Text style={[styles.breakdownTotalValue, { color: theme.colors.primary }]}>
                {formatCurrency(grandTotal)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* 5 ─ when it came in and when it is due */}
      <View style={cardStyle}>
        <View style={styles.split}>
          <View style={styles.flex}>
            {stepLabel('5. Хүлээн авсан цаг')}
            <TimeField
              label=""
              value={form.receivedTime}
              onChange={(value) => set('receivedTime', value)}
              presets={RECEIVED_PRESETS}
              placeholder="14:30"
            />
          </View>
          <View style={styles.flex}>
            {stepLabel('Өгөх хугацаа')}
            <View style={styles.deadlineRow}>
              <View style={styles.flex}>
                <TimeField
                  label=""
                  value={form.deadline}
                  onChange={(value) => set('deadline', value)}
                  presets={deadlinePresets}
                  placeholder="17:00"
                />
              </View>
              <Pressable
                onPress={openTomorrowPicker}
                accessibilityRole="button"
                accessibilityState={{ selected: form.isTomorrow }}
                style={[
                  styles.tomorrow,
                  {
                    backgroundColor: form.isTomorrow
                      ? theme.custom.accent
                      : theme.custom.cardBackground,
                    borderColor: form.isTomorrow
                      ? theme.custom.accent
                      : theme.custom.subtleBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tomorrowText,
                    {
                      color: form.isTomorrow ? theme.colors.onPrimary : theme.colors.onSurface,
                    },
                  ]}
                >
                  {form.isTomorrow && form.tomorrowDate
                    ? form.tomorrowDate.slice(5).replace('-', '/')
                    : 'Маргааш'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* 6 ─ how they are paying, one method or several */}
      <View style={cardStyle}>
        {stepLabel('6. Төлбөрийн хэлбэр')}
        {renderChoices(PAY_TYPES, form.payType, choosePayType)}

        {/* Kept out of the row above rather than squeezed in as a fourth
            button: four cells on a phone clip their labels, and this one is
            the rare case. */}
        <Pressable
          onPress={() => choosePayType('Холимог')}
          accessibilityRole="button"
          accessibilityState={{ selected: form.payType === 'Холимог' }}
          style={[
            styles.choice,
            styles.spaced,
            {
              backgroundColor:
                form.payType === 'Холимог' ? theme.colors.primary : theme.custom.cardBackground,
              borderColor:
                form.payType === 'Холимог' ? theme.colors.primary : theme.custom.subtleBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.choiceText,
              {
                color:
                  form.payType === 'Холимог' ? theme.colors.onPrimary : theme.colors.onSurface,
              },
            ]}
          >
            🔀 Холимог (хуваасан)
          </Text>
        </Pressable>

        {form.payType === 'Холимог' ? (
          <View style={styles.spaced}>
            {PAY_METHODS.map(({ key, label }) => (
              <View key={key} style={[styles.splitRow, styles.spaced]}>
                <Text style={[styles.splitLabel, { color: theme.colors.onSurface }]}>
                  {label}
                </Text>
                <TextInput
                  mode="outlined"
                  placeholder="0"
                  value={splitValue(key)}
                  onChangeText={(value) => setSplit(key, value)}
                  keyboardType="number-pad"
                  style={styles.flex}
                  accessibilityLabel={`${label} дүн`}
                  dense
                />
              </View>
            ))}

            {/* The clerk is reconciling a till, so the number that matters is
                what is still outstanding — not what has been entered. */}
            <Text
              style={[
                styles.sheetHint,
                styles.spaced,
                { color: splitLeft === 0 ? theme.colors.primary : theme.colors.error },
              ]}
            >
              {splitLeft === 0
                ? `Тэнцсэн: ${formatCurrency(splitTotal(form.paySplit))}`
                : splitLeft > 0
                  ? `Дутуу: ${formatCurrency(splitLeft)}`
                  : `Илүү: ${formatCurrency(-splitLeft)}`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 7 ─ paid or not */}
      <View style={cardStyle}>
        {stepLabel('7. Төлбөрийн төлөв')}
        {renderChoices(PAYMENT_STATUSES, form.paymentStatus, (value) =>
          choosePaymentStatus(value as PaymentStatus),
        )}
      </View>

      {/* 8 ─ delivery and the details that decide a reprint */}
      <View style={cardStyle}>
        {stepLabel('8. Хүргэлт & тайлбар')}
        <View>
          <Pressable
            onPress={() => set('isDelivery', !form.isDelivery)}
            accessibilityRole="button"
            accessibilityState={{ selected: form.isDelivery }}
            style={[
              styles.tomorrow,
              styles.flex,
              {
                alignItems: 'center',
                backgroundColor: form.isDelivery
                  ? theme.colors.primary
                  : theme.custom.cardBackground,
                borderColor: form.isDelivery ? theme.colors.primary : theme.custom.subtleBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.tomorrowText,
                { color: form.isDelivery ? theme.colors.onPrimary : theme.colors.onSurface },
              ]}
            >
              🚚 Хүргэлт
            </Text>
          </Pressable>
        </View>
        {/* Notes carry the details that decide a reprint — "хар цаасан дээр",
            "лого зүүн дээд буланд". Two cramped lines meant they were written
            short or not at all. */}
        <TextInput
          mode="outlined"
          label="Тайлбар"
          placeholder="Жишээ: хар цаасан дээр, лого зүүн дээд буланд"
          value={form.note}
          onChangeText={(value) => set('note', value)}
          style={[styles.spaced, styles.note]}
          contentStyle={styles.noteContent}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.actions}>
        <Button mode="outlined" onPress={onCancel} style={styles.flex}>
          Болих
        </Button>
        <Button mode="contained" onPress={onSubmit} style={styles.flex}>
          {submitLabel}
        </Button>
      </View>

      <Portal>
        <Modal
          visible={dealOpen}
          onDismiss={() => setDealOpen(false)}
          contentContainerStyle={[
            styles.sheet,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Тохиролцсон нэгж үнэ
          </Text>
          <Text style={[styles.sheetHint, { color: theme.custom.mutedText }]}>
            {form.job || 'Сонгосон бүтээгдэхүүн'} · жагсаалтын үнэ{' '}
            {formatCurrency(Number(form.unitPrice) || 0)}
          </Text>
          <TextInput
            mode="outlined"
            label="Тохиролцсон үнэ (₮)"
            value={dealDraft}
            onChangeText={(value) => setDealDraft(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoFocus
            dense
          />
          <View style={styles.actions}>
            <Button mode="text" onPress={() => setDealOpen(false)} style={styles.flex}>
              Болих
            </Button>
            <Button mode="contained" onPress={applyDeal} style={styles.flex}>
              Хэрэглэх
            </Button>
          </View>
        </Modal>
      </Portal>

      <ImageLightbox
        uri={zoomed ? jobImage : null}
        title={form.job}
        subtitle={form.unitPrice ? formatCurrency(Number(form.unitPrice) || 0) : ''}
        onDismiss={() => setZoomed(false)}
      />


      <Portal>
        <Modal
          visible={pickerVisible}
          onDismiss={() => setPickerVisible(false)}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Бүтээгдэхүүн сонгох
          </Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Нэр эсвэл ангилал..." />
          <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
            {filtered.map((product) => (
              <Pressable
                key={product.id}
                onPress={() => {
                  onChange(applyProduct(form, product));
                  setPickerVisible(false);
                  setSearch('');
                }}
                accessibilityRole="button"
                style={[styles.productRow, { borderColor: theme.custom.subtleBorder }]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.productName, { color: theme.colors.onSurface }]}>
                    {product.name}
                  </Text>
                  <Text style={[styles.productCat, { color: theme.custom.mutedText }]}>
                    {product.category}
                  </Text>
                </View>
                <Text style={[styles.productPrice, { color: theme.colors.primary }]}>
                  {formatCurrency(product.price)}
                </Text>
              </Pressable>
            ))}
            {filtered.length === 0 ? (
              <Text style={[styles.empty, { color: theme.custom.mutedText }]}>
                Илэрц олдсонгүй
              </Text>
            ) : null}
          </ScrollView>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={tomorrowPickerVisible}
          onDismiss={() => setTomorrowPickerVisible(false)}
          contentContainerStyle={[
            styles.tomorrowModal,
            { backgroundColor: theme.custom.cardBackground },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Хэзээ өгөхийг сонгоно уу
          </Text>

          <View style={styles.quickRow}>
            {TOMORROW_PRESETS.map((preset) => {
              const target = shiftDate(todayString(), preset.days);
              const active = form.tomorrowDate === target;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => commitTomorrow(target)}
                  accessibilityRole="button"
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant,
                      borderColor: active ? theme.colors.primary : theme.custom.subtleBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? theme.colors.onPrimary : theme.colors.onSurface },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setTomorrowMonth((prev) => stepMonth(prev, -1))}
              accessibilityRole="button"
              accessibilityLabel="Өмнөх сар"
              hitSlop={10}
              style={styles.monthNav}
            >
              <Text style={[styles.monthNavText, { color: theme.colors.primary }]}>‹</Text>
            </Pressable>
            <Text style={[styles.tomorrowMonthTitle, { color: theme.colors.onSurface }]}>
              {monthTitle(tomorrowMonth)}
            </Text>
            <Pressable
              onPress={() => setTomorrowMonth((prev) => stepMonth(prev, 1))}
              accessibilityRole="button"
              accessibilityLabel="Дараах сар"
              hitSlop={10}
              style={styles.monthNav}
            >
              <Text style={[styles.monthNavText, { color: theme.colors.primary }]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {DAY_LABELS_MN.map((day) => (
              <Text key={day} style={[styles.weekLabel, { color: theme.custom.mutedText }]}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {tomorrowCells.map((cell, index) => {
              if (cell === null) return <View key={`blank-${index}`} style={styles.calCell} />;
              const selected = cell === form.tomorrowDate;
              const isToday = cell === todayString();
              // A handover cannot be in the past; those days can only ever be a
              // mis-tap, and one saved silently would sit on the board looking
              // overdue from the moment it was booked.
              const past = cell < todayString();
              return (
                <Pressable
                  key={cell}
                  onPress={() => commitTomorrow(cell)}
                  disabled={past}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: past }}
                  style={[
                    styles.calCell,
                    selected && { backgroundColor: theme.colors.primary },
                    !selected && isToday && { borderWidth: 1, borderColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.calCellText,
                      {
                        color: selected
                          ? theme.colors.onPrimary
                          : isToday
                            ? theme.colors.primary
                            : theme.colors.onSurface,
                        opacity: past ? 0.28 : 1,
                      },
                    ]}
                  >
                    {Number(cell.slice(8))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.tomorrowActions}>
            <Button mode="outlined" onPress={clearTomorrow} style={styles.flex}>
              Цуцлах
            </Button>
            <Button mode="text" onPress={() => setTomorrowPickerVisible(false)} style={styles.flex}>
              Болих
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12 },
  stepLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  spaced: { marginTop: 8 },
  split: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },

  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceDashed: { borderStyle: 'dashed' },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitLabel: { fontSize: 13, fontWeight: '700', width: 92 },
  choiceText: { fontSize: 13, fontWeight: '700' },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
  },
  stepperButton: { paddingHorizontal: 18, paddingVertical: 8 },
  stepperSign: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  stepperInput: { flex: 1, height: 40 },
  stepperInputText: { fontSize: 16, fontWeight: '900', textAlign: 'center' },

  breakdown: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  breakdownValue: { fontSize: 13, fontWeight: '800' },
  breakdownTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: 8,
    marginTop: 2,
  },
  breakdownTotalLabel: { fontSize: 13, fontWeight: '800' },
  breakdownTotalValue: { fontSize: 17, fontWeight: '900' },

  note: { minHeight: 110 },
  noteContent: { paddingTop: 10 },

  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  totalLabel: { fontSize: 14, fontWeight: '800' },
  totalValue: { fontSize: 20, fontWeight: '900' },

  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tomorrow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tomorrowText: { fontSize: 12, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },

  jobImageWrap: { alignSelf: 'center', marginTop: 10 },
  jobImage: { width: 120, height: 120, borderRadius: 14 },

  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: { fontSize: 14, fontWeight: '700' },
  dropdownChevron: { fontSize: 16, fontWeight: '800' },
  /** Stacked rows, the way a dropdown reads — not two chips side by side. */
  optionList: { marginTop: 6, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionRowText: { fontSize: 14, fontWeight: '700' },
  optionTick: { fontSize: 15, fontWeight: '900' },

  sheet: { margin: 20, borderRadius: 20, padding: 16, gap: 10 },
  sheetRow: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
  sheetRowText: { fontSize: 15, fontWeight: '700' },
  sheetHint: { fontSize: 11, lineHeight: 16 },

  breakdownTotalAlone: { borderTopWidth: 0, paddingTop: 0 },

  modal: { marginHorizontal: 8, marginVertical: 24, borderRadius: 20, padding: 16, gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  /**
   * A floor as well as a ceiling. Without the floor the sheet shrank to fit
   * its contents, so narrowing the search down to one product collapsed the
   * whole panel to a sliver and the next keystroke had nowhere to land.
   */
  modalList: { minHeight: 300, maxHeight: 440 },

  tomorrowModal: { marginHorizontal: 8, marginVertical: 24, borderRadius: 20, padding: 16, gap: 10 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthNav: { paddingHorizontal: 14, paddingVertical: 4 },
  monthNavText: { fontSize: 22, fontWeight: '800' },
  tomorrowMonthTitle: { fontSize: 15, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, fontWeight: '800' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calCellText: { fontSize: 15, fontWeight: '700' },
  tomorrowActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productName: { fontSize: 14, fontWeight: '700' },
  productCat: { fontSize: 11 },
  productPrice: { fontSize: 14, fontWeight: '900' },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 12 },
});

export const WorkLogForm = memo(WorkLogFormBase);

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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppTheme } from '@/theme/ThemeProvider';
import type {
  InventoryItem,
  PayType,
  PaymentStatus,
  ServiceItem,
  WorkLogForm as FormShape,
} from '@/types';
import { formatCurrency } from '@/utils/price';
import { VAT_RATE } from '@/constants/config';

import { SquareMeterModal } from './SquareMeterModal';

/**
 * New-job form.
 *
 * Laid out as ten numbered steps so a counter clerk can work down the screen
 * without hunting for fields. Every choice is a full-width tap target rather
 * than a dropdown — the shop fills this in on a shared iPad, often one-handed.
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

const VAT_CHOICES: Choice[] = [
  { value: 'yes', label: 'НӨАТ-тэй' },
  { value: 'no', label: 'НӨАТ-гүй' },
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
  const [areaVisible, setAreaVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

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

  // Recomputed when the form opens rather than on every keystroke; a shortcut
  // drifting by a minute while the clerk types would be worse than useless.
  const deadlinePresets = useMemo(() => deadlinesFromNow(), []);

  const step = (delta: number): void =>
    onChange(applyQuantity(form, String(Math.max(1, quantity + delta))));

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
      {/* 1 ─ who the job is for */}
      <View style={cardStyle}>
        {stepLabel('1. Харилцагч')}
        {renderChoices(CUSTOMER_TYPES, form.customerType, (value) =>
          set('customerType', form.customerType === value ? '' : value),
        )}
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
          <Pressable
            onPress={() => setAreaVisible(true)}
            accessibilityRole="button"
            style={[
              styles.choice,
              styles.choiceDashed,
              { borderColor: theme.colors.primary, backgroundColor: theme.custom.cardBackground },
            ]}
          >
            <Text style={[styles.choiceText, { color: theme.colors.primary }]}>📐 МКВ</Text>
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
            {stepLabel('4. Нэгж үнэ (₮)')}
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

      {/* 5 ─ how they are paying */}
      <View style={cardStyle}>
        {stepLabel('5. Төлбөрийн хэлбэр')}
        {renderChoices(PAY_TYPES, form.payType, (value) =>
          set('payType', (form.payType === value ? '' : value) as PayType),
        )}
      </View>

      {/* 6 ─ the number that matters */}
      <View
        style={[
          styles.totalBar,
          {
            backgroundColor: theme.colors.primaryContainer,
            borderColor: theme.colors.primary,
          },
        ]}
      >
        <Text style={[styles.totalLabel, { color: theme.colors.onPrimaryContainer }]}>
          6. Нийт үнэ{form.hasVat ? ' (НӨАТ орсон)' : ''}
        </Text>
        <Text style={[styles.totalValue, { color: theme.colors.onPrimaryContainer }]}>
          {formatCurrency(grandTotal)}
        </Text>
      </View>

      {/* 7 ─ paid or not */}
      <View style={cardStyle}>
        {stepLabel('7. Төлбөрийн төлөв')}
        {renderChoices(PAYMENT_STATUSES, form.paymentStatus, (value) =>
          set('paymentStatus', value as PaymentStatus),
        )}
      </View>

      {/* 8 ─ VAT, with the arithmetic spelled out */}
      <View style={cardStyle}>
        {stepLabel('8. НӨАТ')}
        {renderChoices(VAT_CHOICES, form.hasVat ? 'yes' : 'no', (value) =>
          set('hasVat', value === 'yes'),
        )}

        {/* Customers ask "how much is the VAT?" at the counter, and the clerk
            should not have to work it out. Shown for both answers so the
            difference between them is visible before choosing. */}
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
              <Text
                style={[
                  styles.breakdownValue,
                  { color: form.hasVat ? theme.colors.onSurface : theme.custom.mutedText },
                ]}
              >
                {form.hasVat ? `+${formatCurrency(vatAmount)}` : '—'}
              </Text>
            </View>

            <View
              style={[styles.breakdownTotal, { borderTopColor: theme.custom.subtleBorder }]}
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

      {/* 9 ─ timing */}
      <View style={cardStyle}>
        <View style={styles.split}>
          <View style={styles.flex}>
            {stepLabel('9. Хүлээн авсан цаг')}
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
                onPress={() => set('isTomorrow', !form.isTomorrow)}
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
                  Маргааш
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* 10 ─ contact and delivery */}
      <View style={cardStyle}>
        {stepLabel('10. Утас + Хүргэлт')}
        <View style={styles.deadlineRow}>
          <TextInput
            mode="outlined"
            placeholder="99112233"
            value={form.phone}
            onChangeText={(value) => set('phone', value)}
            keyboardType="phone-pad"
            style={styles.flex}
            dense
          />
          <Pressable
            onPress={() => set('isDelivery', !form.isDelivery)}
            accessibilityRole="button"
            accessibilityState={{ selected: form.isDelivery }}
            style={[
              styles.tomorrow,
              {
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
        <TextInput
          mode="outlined"
          placeholder="Захиалагчийн нэр"
          value={form.customer}
          onChangeText={(value) => set('customer', value)}
          style={styles.spaced}
          dense
        />
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

      <ImageLightbox
        uri={zoomed ? jobImage : null}
        title={form.job}
        subtitle={form.unitPrice ? formatCurrency(Number(form.unitPrice) || 0) : ''}
        onDismiss={() => setZoomed(false)}
      />

      <SquareMeterModal
        visible={areaVisible}
        onDismiss={() => setAreaVisible(false)}
        onApply={(unitPrice) => onChange(applyUnitPrice(form, unitPrice))}
        initialRate={form.unitPrice}
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

  modal: { marginHorizontal: 8, marginVertical: 24, borderRadius: 20, padding: 16, gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  /**
   * A floor as well as a ceiling. Without the floor the sheet shrank to fit
   * its contents, so narrowing the search down to one product collapsed the
   * whole panel to a sliver and the next keystroke had nowhere to land.
   */
  modalList: { minHeight: 300, maxHeight: 440 },
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

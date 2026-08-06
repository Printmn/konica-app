import React, { useCallback, useRef } from 'react';

import { useAuth } from '@/authentication/AuthContext';
import { OfflineBanner, SyncErrorBanner, PermissionDenied } from '@/components/feedback/StateViews';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useData } from '@/features/data/DataContext';
import { buildQuickOrder } from '@/features/orders/orderLogic';
import { useScreenBack } from '@/hooks/useScreenBack';
import { useToast } from '@/hooks/useToast';
import { notifyNewOrder } from '@/services/notifications/notificationService';
import { formatCurrency } from '@/utils/price';

import { CatalogTab, type QuickOrderDraft } from '../orders/components/CatalogTab';

/**
 * Түргэн хэвлэл — «Цаг» табны оронд орсон шинэ таб.
 *
 * «Захиалга» цэсний «Үйлчилгээ» хэсэгтэй яг ижил: каталогоос сонгоод шууд
 * түргэн захиалга бүртгэнэ. `OrdersScreen`-ий `handleQuickOrder`-тай ижил
 * дүрмээр {@link buildQuickOrder} дуудаж, order болон жагсаалтад харагдах
 * ажлын бүртгэлийг хамт үүсгэнэ.
 */

/** How long a submit stays locked after a successful save. */
const SUBMIT_LOCK_MS = 1200;

export function QuickPrintScreen(): React.JSX.Element {
  const onBack = useScreenBack();
  const { show } = useToast();
  const { can } = useAuth();

  const { workLogs, setWorkLogs, setOrders, services, isOffline, pendingWrites, syncError, syncNow } =
    useData();

  /** Guards against a double tap booking the same job twice. */
  const submitting = useRef(false);

  const handleQuickOrder = useCallback(
    (draft: QuickOrderDraft) => {
      if (submitting.current) return;
      submitting.current = true;
      setTimeout(() => {
        submitting.current = false;
      }, SUBMIT_LOCK_MS);

      const { order, workLog } = buildQuickOrder(draft, workLogs);
      setOrders((previous) => [order, ...previous]);
      setWorkLogs((previous) => [workLog, ...previous]);
      void notifyNewOrder(workLog);
      show(`${workLog.job} — ${formatCurrency(order.price)}`, 'success');
    },
    [workLogs, setOrders, setWorkLogs, show],
  );

  if (!can('viewOrders')) {
    return (
      <Screen>
        <ScreenHeader title="Түргэн хэвлэл" onBack={onBack} />
        <PermissionDenied />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Түргэн хэвлэл" onBack={onBack} />

      {isOffline ? <OfflineBanner pendingWrites={pendingWrites} /> : null}
      {!isOffline && syncError ? <SyncErrorBanner onRetry={() => void syncNow()} /> : null}

      <CatalogTab services={services} onConfirm={handleQuickOrder} />
    </Screen>
  );
}

import { useNavigation } from '@react-navigation/native';

/**
 * A back handler for a screen, or `undefined` when there is nowhere to go.
 *
 * Tab screens are roots, so they carried no back button — which was fine until
 * the home shortcuts started opening destinations that have no tab-bar button
 * of their own. In iPad mode, Тайлан and Үзүүлэлт are reachable only from the
 * home grid, and once there the only way out was to kill the app.
 *
 * `canGoBack()` is what makes this safe to apply everywhere: the arrow appears
 * only when the navigator actually has somewhere to return to, so a tab opened
 * directly from the bar still shows no stray control.
 */
export function useScreenBack(): (() => void) | undefined {
  const navigation = useNavigation();
  if (!navigation.canGoBack()) return undefined;
  return () => navigation.goBack();
}

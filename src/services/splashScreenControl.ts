import * as SplashScreen from 'expo-splash-screen';

/**
 * Splash screen control during app startup
 */

let splashScreenVisible = true;

export async function hideSplashScreen(): Promise<void> {
  if (!splashScreenVisible) return;

  try {
    await SplashScreen.hideAsync();
    splashScreenVisible = false;
  } catch (error) {
    console.warn('Failed to hide splash screen:', error);
  }
}

export async function showSplashScreen(): Promise<void> {
  if (splashScreenVisible) return;

  try {
    await SplashScreen.showAsync();
    splashScreenVisible = true;
  } catch (error) {
    console.warn('Failed to show splash screen:', error);
  }
}

export function isSplashScreenVisible(): boolean {
  return splashScreenVisible;
}

export async function withSplashScreen<T>(
  fn: () => Promise<T>,
  hideWhenDone: boolean = true
): Promise<T> {
  try {
    const result = await fn();
    if (hideWhenDone) {
      await hideSplashScreen();
    }
    return result;
  } catch (error) {
    // Keep splash visible on error
    throw error;
  }
}

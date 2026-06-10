import { HashRouter, Routes, Route } from 'react-router-dom'
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import Pill from '@/app/components/pill/Pill'
import {
  STEP_NAMES,
  STEP_NAMES_ARRAY,
  useOnboardingStore,
} from '@/app/store/useOnboardingStore'
import { useAuth } from '@/app/components/auth/useAuth'
import { WindowContextProvider } from '@/lib/window'
import { Auth0Provider } from '@/app/components/auth/Auth0Provider'
import { useDeviceChangeListener } from './hooks/useDeviceChangeListener'
import { verifyStoredMicrophone } from './media/microphone'
import { useEffect } from 'react'

const MainApp = () => {
  const { onboardingCompleted, onboardingStep } = useOnboardingStore()
  const { isAuthenticated } = useAuth()
  useDeviceChangeListener()

  useEffect(() => {
    verifyStoredMicrophone()
  }, [])

  const onboardingSetupCompleted =
    onboardingStep >= STEP_NAMES_ARRAY.indexOf(STEP_NAMES.TRY_IT_OUT)

  const shouldEnableShortcutGlobally =
    onboardingCompleted || onboardingSetupCompleted

  // Persist the global-shortcut-enabled flag as a side effect, only when the
  // value actually changes. Previously this `window.api.send` ran *during render*
  // in both branches, firing on every render (and twice under React 18 Strict
  // Mode) — spamming the main process and racing the store write.
  useEffect(() => {
    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      shouldEnableShortcutGlobally,
    )
  }, [shouldEnableShortcutGlobally])

  // If authenticated and onboarding completed, show main app
  if (isAuthenticated && onboardingCompleted) {
    return <HomeKit />
  }

  // If authenticated but onboarding not completed, continue onboarding
  return <WelcomeKit />
}

export default function App() {
  return (
    <Auth0Provider>
      <HashRouter>
        <Routes>
          {/* Route for the pill window */}
          <Route
            path="/pill"
            element={
              <>
                <Pill />
              </>
            }
          />

          {/* Default route for the main application window */}
          <Route
            path="/"
            element={
              <>
                <WindowContextProvider
                  titlebar={{ title: 'Scriba', icon: appIcon }}
                >
                  <MainApp />
                </WindowContextProvider>
              </>
            }
          />
        </Routes>
      </HashRouter>
    </Auth0Provider>
  )
}

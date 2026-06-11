import { useState } from 'react'
import { Switch } from '@/app/components/ui/switch'
import { Button } from '@/app/components/ui/button'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { useWindowContext } from '@/app/components/window/WindowContext'
import { StatusIndicator } from '@/app/components/ui/status-indicator'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'

export default function GeneralSettingsContent() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [statusIndicator, setStatusIndicator] = useState<
    'success' | 'error' | null
  >(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const {
    shareAnalytics,
    launchAtLogin,
    showScribaBarAlways,
    showAppInDock,
    setShareAnalytics,
    setLaunchAtLogin,
    setShowScribaBarAlways,
    setShowAppInDock,
  } = useSettingsStore()

  const windowContext = useWindowContext()

  const handleDownloadLogs = async () => {
    setIsDownloading(true)
    try {
      const result = await window.api.logs.download()
      if (result.success) {
        console.log('Logs downloaded successfully to:', result.path)
      } else {
        if (result.error !== 'Download cancelled') {
          console.error('Failed to download logs:', result.error)
          setStatusMessage(`Failed to download logs: ${result.error}`)
          setStatusIndicator('error')
        }
      }
    } catch (error) {
      console.error('Error downloading logs:', error)
      setStatusMessage('An unexpected error occurred while downloading logs')
      setStatusIndicator('error')
    } finally {
      setIsDownloading(false)
    }
  }

  const performClearLogs = async () => {
    setShowClearConfirm(false)
    setIsClearing(true)
    try {
      const result = await window.api.logs.clear()
      if (result.success) {
        console.log('Logs cleared successfully')
        setStatusMessage('Logs cleared successfully')
        setStatusIndicator('success')
      } else {
        console.error('Failed to clear logs:', result.error)
        setStatusMessage(`Failed to clear logs: ${result.error}`)
        setStatusIndicator('error')
      }
    } catch (error) {
      console.error('Error clearing logs:', error)
      setStatusMessage('An unexpected error occurred while clearing logs')
      setStatusIndicator('error')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Share analytics</div>
              <div className="text-xs text-gray-600 mt-1">
                Share anonymous usage data to help us improve Scriba.
              </div>
            </div>
            <Switch
              checked={shareAnalytics}
              onCheckedChange={setShareAnalytics}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Launch at Login</div>
              <div className="text-xs text-gray-600 mt-1">
                Open Scriba automatically when your computer starts.
              </div>
            </div>
            <Switch
              checked={launchAtLogin}
              onCheckedChange={setLaunchAtLogin}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                Show Scriba bar at all times
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Show the Scriba bar at all times.
              </div>
            </div>
            <Switch
              checked={showScribaBarAlways}
              onCheckedChange={setShowScribaBarAlways}
            />
          </div>

          {windowContext?.window?.platform === 'darwin' && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Show app in dock</div>
                <div className="text-xs text-gray-600 mt-1">
                  Show the Scriba app in the dock for quick access.
                </div>
              </div>
              <Switch
                checked={showAppInDock}
                onCheckedChange={setShowAppInDock}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-lg font-medium mb-4">Log Management</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Download Logs</div>
              <div className="text-xs text-gray-600 mt-1">
                Export your local logs to a file for troubleshooting.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Clear Logs</div>
              <div className="text-xs text-gray-600 mt-1">
                Permanently delete all local logs from your device.
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear'}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogTitle>Clear all logs?</DialogTitle>
          <DialogDescription>
            This permanently deletes all local logs from your device and can&apos;t
            be undone.
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowClearConfirm(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={performClearLogs}
              type="button"
            >
              Clear
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StatusIndicator
        status={statusIndicator}
        successMessage={statusMessage}
        errorMessage={statusMessage}
        onHide={() => setStatusIndicator(null)}
      />
    </div>
  )
}

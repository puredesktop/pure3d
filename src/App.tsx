import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { usePlatformViewportResource } from '@purescience/platform-ui/bridge/react/usePlatformViewportResource'
import { isStandaloneDevMode } from './bridge/platformBridge'
import { useAppBoot } from './hooks/useAppBoot'
import { Workspace } from './components/Workspace'

export function App() {
  const { ready, error, meta } = usePlatformBridge()
  const { store, error: bootError } = useAppBoot(ready || isStandaloneDevMode())
  const { resource, clearResource } = usePlatformViewportResource(ready, meta)
  if (error && !isStandaloneDevMode())
    return (
      <AppFrame identityAppSlug="3d">
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={error.message}
        />
      </AppFrame>
    )
  if (!store)
    return (
      <AppFrame identityAppSlug="3d">
        <EmptyState
          tone={bootError ? 'error' : 'neutral'}
          title={bootError ? 'Could not start the workspace' : 'Pure3D'}
          message={bootError?.message ?? 'Loading 3D workspace…'}
        />
      </AppFrame>
    )
  return (
    <Workspace
      store={store}
      ready={ready}
      resource={resource}
      clearResource={clearResource}
    />
  )
}

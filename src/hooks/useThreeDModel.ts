import { useEffect } from 'react'
import { preferModelRole } from '../bridge/platformBridge'

/**
 * Pure3D's work runs on the 3D model (Settings › Models › 3D on PureDesktop; the organisation's choice where it
 * decides): once the bridge is ready, Pure3D makes `role:3d` its default model, but only while nobody has chosen a
 * model for it, only once, and only on a desktop that knows model roles. Unset, the 3D model is the default model,
 * so nothing changes until someone chooses one. Standalone development has no host to ask.
 */
export function useThreeDModel(ready: boolean, standalone: boolean): void {
  useEffect(() => {
    if (!ready || standalone) return
    void preferModelRole('3d', '3d')
  }, [ready, standalone])
}

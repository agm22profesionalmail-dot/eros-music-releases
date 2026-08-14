import { ElectronAPI } from '@electron-toolkit/preload'
import type { PreloadApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PreloadApi
  }
}

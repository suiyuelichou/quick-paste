import type { ProgressInfo, UpdateInfo } from 'builder-util-runtime'
import type { UpdateState } from '../shared/types'

export interface UpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: UpdateInfo) => void): unknown
  on(event: 'download-progress', listener: (info: ProgressInfo) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

type StateListener = (state: UpdateState) => void

export class UpdateService {
  private state: UpdateState
  private listeners = new Set<StateListener>()

  constructor(private readonly updater: UpdaterAdapter | null, currentVersion: string) {
    this.state = updater
      ? { phase: 'idle', currentVersion, message: '将自动检查更新，也可以立即手动检查。' }
      : { phase: 'unsupported', currentVersion, message: '开发模式不检查更新；安装版会从 GitHub Releases 获取更新。' }
    if (!updater) return
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.on('checking-for-update', () => this.setState({ phase: 'checking', message: '正在检查更新…' }))
    updater.on('update-available', (info) => this.setState({ phase: 'available', availableVersion: info.version, message: `发现新版本 ${info.version}` }))
    updater.on('update-not-available', () => this.setState({ phase: 'up-to-date', message: '当前已是最新版本。' }))
    updater.on('download-progress', (info) => {
      const progress = Math.max(0, Math.min(100, Math.round(info.percent)))
      this.setState({ phase: 'downloading', availableVersion: this.state.availableVersion, progress, message: `正在下载更新 ${progress}%` })
    })
    updater.on('update-downloaded', (info) => this.setState({ phase: 'downloaded', availableVersion: info.version, progress: 100, message: '更新已下载，重启应用后安装。' }))
    updater.on('error', () => this.fail('更新操作失败，请检查网络连接后重试。'))
  }

  snapshot(): UpdateState {
    return { ...this.state }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async check(): Promise<UpdateState> {
    if (!this.updater || this.state.phase === 'checking' || this.state.phase === 'downloading') return this.snapshot()
    this.setState({ phase: 'checking', message: '正在检查更新…' })
    try { await this.updater.checkForUpdates() }
    catch { if (this.snapshot().phase !== 'error') this.fail('检查更新失败，请检查网络连接后重试。') }
    return this.snapshot()
  }

  async download(): Promise<UpdateState> {
    if (!this.updater || this.state.phase !== 'available') return this.snapshot()
    this.setState({ phase: 'downloading', availableVersion: this.state.availableVersion, progress: 0, message: '正在下载更新 0%' })
    try { await this.updater.downloadUpdate() }
    catch { if (this.snapshot().phase !== 'error') this.fail('更新下载失败，请检查网络连接后重试。') }
    return this.snapshot()
  }

  canInstall(): boolean {
    return !!this.updater && this.state.phase === 'downloaded'
  }

  install(): void {
    if (this.canInstall()) this.updater?.quitAndInstall(false, true)
  }

  fail(message: string): UpdateState {
    this.setState({ phase: 'error', availableVersion: this.state.availableVersion, message })
    return this.snapshot()
  }

  private setState(next: Omit<UpdateState, 'currentVersion'>): void {
    this.state = { currentVersion: this.state.currentVersion, ...next }
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

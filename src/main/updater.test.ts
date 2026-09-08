import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { UpdateService, type UpdaterAdapter } from './updater'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = true
  checkForUpdates = vi.fn(async () => undefined)
  downloadUpdate = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
}

const createService = (): { service: UpdateService; updater: FakeUpdater } => {
  const updater = new FakeUpdater()
  const service = new UpdateService(updater as unknown as UpdaterAdapter, '1.1.1')
  return { service, updater }
}

describe('自动更新服务', () => {
  it('开发环境不发起网络检查', async () => {
    const service = new UpdateService(null, '1.1.1')
    expect((await service.check()).phase).toBe('unsupported')
  })

  it('检查到正式版本后等待用户下载', async () => {
    const { service, updater } = createService()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('update-available', { version: '1.2.0' })
    })
    const state = await service.check()
    expect(state).toMatchObject({ phase: 'available', availableVersion: '1.2.0' })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('报告下载进度，下载完成后才允许安装', async () => {
    const { service, updater } = createService()
    updater.checkForUpdates.mockImplementationOnce(async () => { updater.emit('update-available', { version: '1.2.0' }) })
    updater.downloadUpdate.mockImplementationOnce(async () => {
      updater.emit('download-progress', { percent: 44.6 })
      expect(service.snapshot()).toMatchObject({ phase: 'downloading', progress: 45 })
      updater.emit('update-downloaded', { version: '1.2.0' })
    })
    await service.check()
    expect((await service.download()).phase).toBe('downloaded')
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('网络失败不会安装并返回可重试状态', async () => {
    const { service, updater } = createService()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('secret network detail'))
    const state = await service.check()
    expect(state).toMatchObject({ phase: 'error', message: '检查更新失败，请检查网络连接后重试。' })
    service.install()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
})

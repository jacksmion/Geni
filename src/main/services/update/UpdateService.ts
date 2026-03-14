import { autoUpdater } from 'electron-updater';
import { UPDATE_EVENTS } from '../../../common/ipc/channels';
import { WebContents, app } from 'electron';
import { UpdateInfo, DownloadProgress } from '../../../common/types/update';

export class UpdateService {
    private mainWebContents: WebContents | null = null;
    private isInitialized = false;

    constructor() {
        // Option B: Allow development environment update testing
        // This allows you to use a local dev-update.yml for testing
        autoUpdater.forceDevUpdateConfig = true;
        
        // Disable auto download, let user choose
        autoUpdater.autoDownload = false;
        // Automatically install on app quit if update is downloaded
        autoUpdater.autoInstallOnAppQuit = true;

        // Add logging for easier debugging of signature/network issues
        autoUpdater.logger = console;
    }

    public setWebContents(contents: WebContents) {
        this.mainWebContents = contents;
        if (!this.isInitialized) {
            this.setupListeners();
            this.isInitialized = true;
        }
    }

    private setupListeners() {
        autoUpdater.on('checking-for-update', () => {
            console.log('[UpdateService] Checking for update...');
            this.send(UPDATE_EVENTS.CHECKING);
        });

        autoUpdater.on('update-available', (info: any) => {
            console.log('[UpdateService] Update available:', info.version);
            this.send(UPDATE_EVENTS.UPDATE_AVAILABLE, info);
        });

        autoUpdater.on('update-not-available', (info: any) => {
            console.log('[UpdateService] Update not available.');
            this.send(UPDATE_EVENTS.UPDATE_NOT_AVAILABLE, info);
        });

        autoUpdater.on('error', (err) => {
            console.error('[UpdateService] Error:', err);
            this.send(UPDATE_EVENTS.ERROR, err.message || 'Unknown update error');
        });

        autoUpdater.on('download-progress', (progress: any) => {
            this.send(UPDATE_EVENTS.DOWNLOAD_PROGRESS, progress);
        });

        autoUpdater.on('update-downloaded', (info: any) => {
            console.log('[UpdateService] Update downloaded:', info.version);
            this.send(UPDATE_EVENTS.UPDATE_DOWNLOADED, info);
        });
    }

    private send(channel: string, ...args: any[]) {
        if (this.mainWebContents && !this.mainWebContents.isDestroyed()) {
            this.mainWebContents.send(channel, ...args);
        }
    }

    public async checkForUpdates() {
        try {
            return await autoUpdater.checkForUpdates();
        } catch (error: any) {
            console.error('[UpdateService] Check failed:', error);
            this.send(UPDATE_EVENTS.ERROR, error.message || 'Check for updates failed');
            throw error;
        }
    }

    public async downloadUpdate() {
        try {
            return await autoUpdater.downloadUpdate();
        } catch (error: any) {
            console.error('[UpdateService] Download failed:', error);
            this.send(UPDATE_EVENTS.ERROR, error.message || 'Download failed');
            throw error;
        }
    }

    public quitAndInstall() {
        autoUpdater.quitAndInstall();
    }

    public getVersion() {
        return app.getVersion();
    }
}

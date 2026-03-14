import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { UPDATE_CHANNELS } from '../../common/ipc/channels';
import { UpdateService } from '../services/update/UpdateService';

export class UpdateController {
    constructor(private updateService: UpdateService) {}

    public registerHandlers() {
        ipcMain.handle(UPDATE_CHANNELS.CHECK_FOR_UPDATES, (event: IpcMainInvokeEvent) => {
            this.updateService.setWebContents(event.sender);
            return this.updateService.checkForUpdates();
        });

        ipcMain.handle(UPDATE_CHANNELS.DOWNLOAD_UPDATE, (event: IpcMainInvokeEvent) => {
            this.updateService.setWebContents(event.sender);
            return this.updateService.downloadUpdate();
        });

        ipcMain.handle(UPDATE_CHANNELS.QUIT_AND_INSTALL, () => {
            return this.updateService.quitAndInstall();
        });

        ipcMain.handle(UPDATE_CHANNELS.GET_VERSION, () => {
            return this.updateService.getVersion();
        });
    }
}

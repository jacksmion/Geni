import { ipcMain } from 'electron';
import { StaffManager } from '../services/staff/StaffManager';
import { STAFF_CHANNELS } from '../../common/ipc/channels';

/**
 * StaffController - 数字员工 IPC 控制器
 */
export class StaffController {
    constructor(private staffManager: StaffManager) {}

    public registerHandlers(): void {
        ipcMain.handle(STAFF_CHANNELS.LIST, () => {
            return this.staffManager.list();
        });

        ipcMain.handle(STAFF_CHANNELS.GET, (_e, id: string) => {
            return this.staffManager.get(id);
        });

        ipcMain.handle(STAFF_CHANNELS.CREATE, (_e, input: any) => {
            return this.staffManager.create(input);
        });

        ipcMain.handle(STAFF_CHANNELS.UPDATE, (_e, id: string, updates: any) => {
            return this.staffManager.update(id, updates);
        });

        ipcMain.handle(STAFF_CHANNELS.DELETE, (_e, id: string) => {
            return this.staffManager.delete(id);
        });
    }
}

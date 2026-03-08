import { app, Tray, Menu, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { TRAY_EVENTS } from '../../common/ipc/channels.js';

import zhDict from '../../common/i18n/locales/zh.json' assert { type: 'json' };
import enDict from '../../common/i18n/locales/en.json' assert { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SystemTrayManager {
    private tray: Tray | null = null;
    private mainWindow: BrowserWindow | null = null;
    private currentLanguage: 'zh' | 'en' = 'zh';

    constructor(mainWindow: BrowserWindow, language: 'zh' | 'en' = 'zh') {
        this.mainWindow = mainWindow;
        this.currentLanguage = language;
    }

    public initialize(): void {
        const iconPath = path.join(__dirname, '../build/icon.png');
        
        this.tray = new Tray(iconPath);
        this.tray.setToolTip('Geni - AI Coding Assistant');
        
        this.updateMenu();

        this.tray.on('double-click', () => {
            this.showMainWindow();
        });

        this.tray.on('click', () => {
            this.showMainWindow();
        });
    }

    public setLanguage(language: 'zh' | 'en'): void {
        if (this.currentLanguage === language) return;
        this.currentLanguage = language;
        this.updateMenu();
    }

    private updateMenu(): void {
        if (!this.tray) return;

        const dict = this.currentLanguage === 'zh' ? zhDict : enDict;
        const trayDict = dict.tray;

        const contextMenu = Menu.buildFromTemplate([
            { 
                label: trayDict.open, 
                click: () => {
                    this.showMainWindow();
                } 
            },
            { 
                label: trayDict.newTask, 
                click: () => {
                    this.showMainWindow();
                    this.mainWindow?.webContents.send(TRAY_EVENTS.NEW_TASK);
                } 
            },
            { 
                label: trayDict.settings, 
                click: () => {
                    this.showMainWindow();
                    this.mainWindow?.webContents.send(TRAY_EVENTS.NAVIGATE_TO_SETTINGS);
                } 
            },
            { type: 'separator' },
            { 
                label: trayDict.quit, 
                click: () => {
                    app.quit();
                } 
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    private showMainWindow(): void {
        if (this.mainWindow) {
            if (this.mainWindow.isMinimized()) this.mainWindow.restore();
            this.mainWindow.show();
            this.mainWindow.focus();
        }
    }

    public destroy(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

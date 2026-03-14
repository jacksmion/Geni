
export interface UpdateInfo {
    version: string;
    files: Array<{
        url: string;
        sha512: string;
        size?: number;
    }>;
    path: string;
    sha512: string;
    releaseName?: string | null;
    releaseNotes?: string | Array<any> | null;
    releaseDate: string;
}

export interface DownloadProgress {
    total: number;
    delta: number;
    transferred: number;
    percent: number;
    bytesPerSecond: number;
}

export type UpdateStatus = 
    | 'idle' 
    | 'checking' 
    | 'available' 
    | 'not-available' 
    | 'downloading' 
    | 'downloaded' 
    | 'error';

export interface UpdateState {
    status: UpdateStatus;
    info?: UpdateInfo;
    progress?: DownloadProgress;
    error?: string;
}

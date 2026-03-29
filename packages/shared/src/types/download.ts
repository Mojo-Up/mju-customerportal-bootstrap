export enum DownloadCategory {
  Solution = 'solution',
  PowerBI = 'powerbi',
  Guide = 'guide',
}

export interface FileDownload {
  id: string;
  name: string;
  description: string;
  category: DownloadCategory;
  version: string;
  blobPath: string;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

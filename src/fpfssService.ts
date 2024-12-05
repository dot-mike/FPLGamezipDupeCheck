import fetch from "node-fetch";

export interface FPFSSResponseData {
  sha256: string;
  sha1: string;
  crc32: string;
  md5: string;
  path: string;
  size: number;
  game_id: string;
  date_added: number;
}

export interface FPFSSResponse {
  type: string;
  hash: string;
  data: FPFSSResponseData[];
}

export class FPFSSService {
    private baseUrl: string;
    private authCookie: string;

    constructor(baseUrl: string, authCookie: string) {
        this.baseUrl = baseUrl + (baseUrl.endsWith('/api/') ? '' : '/api/');
        this.authCookie = authCookie;
    }

    public async lookupHash(hash: string, hashType: 'MD5' | 'SHA1' | 'SHA256'): Promise<FPFSSResponse> {
        const url = `${this.baseUrl}index/hash/${hash}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `login=${this.authCookie}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data from FPFSS API: ${response.statusText}`);
        }

        const data = await response.json() as FPFSSResponse;

        if (data.type.toLowerCase() !== hashType.toLowerCase()) {
            throw new Error(`Hash type mismatch: Expected ${hashType}, got ${data.type}`);
        }

        return data;
    }

    public async lookupPath(path: string): Promise<FPFSSResponse> {
        const url = `${this.baseUrl}index/path`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `login=${this.authCookie}`
            },
            body: JSON.stringify({ path })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data from FPFSS API: ${response.statusText}`);
        }

        const data = await response.json() as FPFSSResponse;
        return data;
    }

}
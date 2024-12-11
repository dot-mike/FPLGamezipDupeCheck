import * as flashpoint from 'flashpoint-launcher';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fpfssService from './fpfssService';

function getCurationPaths(loadedCuration: any): { currentCurationPath: string; } {
    const appPath = path.resolve(flashpoint.config.flashpointPath);
    const curationsPath = path.join(appPath, 'Curations');
    const cWorkingFolderPath = path.join(curationsPath, 'Working');
    const currentCurationPath = path.join(cWorkingFolderPath, loadedCuration.folder);
    return { currentCurationPath };
}

export async function activate(context: flashpoint.ExtensionContext) {   
    // Shortcut to register a command
    function registerCmd(n: string, f: (...args: any) => any) {
        flashpoint.registerDisposable(
            context.subscriptions,
            flashpoint.commands.registerCommand(n, f)
        );
    }

    /*
    * Register the command to search for duplicates of the game's launch command
    */
    registerCmd("gamezip-dupe-checker.search-launch", async loadedCuration => {
        const { currentCurationPath } = getCurationPaths(loadedCuration);
    
        let launchCommand = loadedCuration.game.launchCommand;
        if (launchCommand.startsWith('http://')) {
            launchCommand = launchCommand.substring(7);
        }
    
        const selectedFile = path.resolve(path.join(currentCurationPath, 'content', launchCommand));
        const hashType = flashpoint.getExtConfigValue('gamezip-dupe-checker.hashtype');
        const hash = await calculateHash(selectedFile, hashType);
    
        await handleHashLookup(hash, hashType);
    });

    /*
    * Register the command to search for duplicates of a selected file within the current curation folder
    */
    registerCmd("gamezip-dupe-checker.search-file", async loadedCuration => {
        const { currentCurationPath } = getCurationPaths(loadedCuration);
    
        const dialogOptions: flashpoint.ShowOpenDialogOptions = {
            title: 'Select a file',
            properties: ['openFile'],
            defaultPath: currentCurationPath,
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        };
    
        // ensure the file is within current curation folder
        const selectedFile = await getSelectedFile(dialogOptions, currentCurationPath);
        if (!selectedFile) return;
    
        const hashType = flashpoint.getExtConfigValue('gamezip-dupe-checker.hashtype');
        const hash = await calculateHash(selectedFile, hashType);
    
        await handleHashLookup(hash, hashType);
    });

    /*
    * Register the command to search for duplicates of a selected directory within the content folder
    */
    registerCmd("gamezip-dupe-checker.search-path", async loadedCuration => {
        const { currentCurationPath } = getCurationPaths(loadedCuration);
    
        const dialogOptions: flashpoint.ShowOpenDialogOptions = {
            title: 'Select a directory',
            properties: ['openDirectory'],
            defaultPath: currentCurationPath,
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        };
    
        // ensure the file is within current curation folder
        const selectedFile = await getSelectedFile(dialogOptions, currentCurationPath);
        if (!selectedFile) return;

        // get base directory of content folder
        const selectedFileBasename = selectedFile.replace(/.*content\\/, '');
    
        const fpfssBaseUrl = flashpoint.getPreferences()['fpfssBaseUrl'];

        // @ts-ignore
        const fpfssToken = await flashpoint.fpfss.getAccessToken();

        if (!fpfssToken) {
            return;
        }

        const fpfss = new fpfssService.FPFSSService(fpfssBaseUrl, fpfssToken);
        const response = await fpfss.lookupPath(selectedFileBasename);

        flashpoint.log.info(JSON.stringify(response));

        const formattedDuplicates = response.data.map((duplicate, index) => {
            const fpfssUrl = `${fpfssBaseUrl}/web/game/${duplicate.game_id}`;
            return `Duplicate ${index + 1}:\n` +
                `  Game UUID: ${duplicate.game_id}\n` +
                `  Path: ${duplicate.path}\n` +
                `  Size: ${duplicate.size} bytes\n` +
                `  Date Added: ${new Date(duplicate.date_added).toLocaleString()}\n` +
                `  Game URL: ${fpfssUrl}`;
        }).join('\n-----------------------------\n');
        const message = `Found ${response.data.length} duplicates:\n\n${formattedDuplicates}`;
        const v = await showMessageBox('Info', message, ['OK', 'Copy to log']);
        if (v === 1) {
            flashpoint.log.info(message);
        }
    });
};

async function calculateHash(selectedFile: string, hashType: 'MD5' | 'SHA1' | 'SHA256'): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(hashType);
        const fileStream = fs.createReadStream(selectedFile);
        
        fileStream.on('data', (data) => {
            hash.update(data);
        });
        
        fileStream.on('end', () => {
            const fileHash = hash.digest('hex');
            resolve(fileHash);
        });
        
        fileStream.on('error', (error) => {
            reject(error);
        });
    });
}

async function showMessageBox(title: string, message: string, buttons: string[] = ["OK"]): Promise<number> {
    return await flashpoint.dialogs.showMessageBox({ title, message, buttons });
}

async function getSelectedFile(dialogOptions: flashpoint.ShowOpenDialogOptions, currentCurationPath: string): Promise<string | null> {
    const result = await flashpoint.dialogs.showOpenDialog(dialogOptions);
    if (result.length === 0) {
        return null;
    }
    const selectedFile = result[0];
    const relativePath = path.relative(currentCurationPath, selectedFile);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        await showMessageBox('Error', 'File is not in the curation folder');
        return null;
    }
    return selectedFile;
}

async function handleHashLookup(hash: string, hashType: 'MD5' | 'SHA1' | 'SHA256'): Promise<void> {
    const fpfssBaseUrl = flashpoint.getPreferences()['fpfssBaseUrl'];

    // @ts-ignore
    const fpfssToken = await flashpoint.fpfss.getAccessToken();

    if (!fpfssToken) {
        return;
    }

    const fpfss = new fpfssService.FPFSSService(fpfssBaseUrl, fpfssToken);
    const response = await fpfss.lookupHash(hash, hashType);

    if (response.data.length === 0) {
        await showMessageBox('Info', 'Great news! No duplicates found!');
        return;
    }

    const formattedDuplicates = response.data.map((duplicate, index) => {
        const fpfssUrl = `${fpfssBaseUrl}/web/game/${duplicate.game_id}`;
        return `Duplicate ${index + 1}:\n` +
            `  Game UUID: ${duplicate.game_id}\n` +
            `  Path: ${duplicate.path}\n` +
            `  Size: ${duplicate.size} bytes\n` +
            `  Date Added: ${new Date(duplicate.date_added).toLocaleString()}\n` +
            `  Game URL: ${fpfssUrl}`;
    }).join('\n-----------------------------\n');
    const message = `Found ${response.data.length} duplicates:\n\n${formattedDuplicates}`;
    const v = await showMessageBox('Info', message, ['OK', 'Copy to log']);
    if (v === 1) {
        flashpoint.log.info(message);
    }
}

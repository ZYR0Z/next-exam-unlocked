/**
 * @license GPL LICENSE
 * Copyright (c) 2021-2022 Thomas Michael Weissel
 * 
 * This program is free software: you can redistribute it and/or modify it 
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */

/**
 * This is the ELECTRON main file that actually opens the electron window
 */

import { app, BrowserWindow, shell, ipcMain, dialog, powerSaveBlocker, nativeTheme  } from 'electron'
import { release } from 'os'
import { join } from 'path'
import config from '../server/src/config.js';
import server from "../server/src/server.js"
import multicastClient from '../server/src/classes/multicastclient.js'
import checkDiskSpace from 'check-disk-space'
import fs from 'fs'

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}


let win: BrowserWindow | null = null

async function createWindow() {

    win = new BrowserWindow({
        title: 'Main window',
        icon: join(__dirname, '../../public/icons/icon.png'),
        center:true,
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: join(__dirname, '../preload/preload.cjs')
        },
    })

    if (app.isPackaged || process.env["DEBUG"]) {
        win.removeMenu() 
        win.loadFile(join(__dirname, '../renderer/index.html'))
    } 
    else {
        const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`
        win.removeMenu() 
        win.loadURL(url)
    }

    if (config.showdevtools) { win.webContents.openDevTools()  }


    // Make all links open with the browser, not with the application
    // win.webContents.setWindowOpenHandler(({ url }) => {
    //     if (url.startsWith('https:')) shell.openExternal(url)
    //     return { action: 'deny' }
    // })


    win.webContents.session.setCertificateVerifyProc((request, callback) => {
        var { hostname, certificate, validatedCertificate, verificationResult, errorCode } = request;
        callback(0);
    });


    win.on('close', async  (e) => {   //ask before closing
        if (!config.development) {
            if (win?.webContents.getURL().includes("dashboard")){console.log("do not close running exam this way"); e.preventDefault(); return}
            let choice = dialog.showMessageBoxSync(win, {
                type: 'question',
                buttons: ['Ja', 'Nein'],
                title: 'Programm beenden',
                message: 'Sind sie sicher?',
                cancelId: 1
            });
            if(choice == 1){
                e.preventDefault();
            }
        }
     });
}




 /**
     * Screenlock Window (to cover everything) - block students from working
     * @param display 
     */

 let authwin: BrowserWindow | null = null

 async function createMsauthWindow() {
    authwin = new BrowserWindow({
        show: false,
        center:true,
        title: 'OAuth',
        width: 500,
        height: 800,
        minimizable: false,
        icon: join(__dirname, '../../public/icons/icon.png'),
        webPreferences: {
            preload: join(__dirname, '../preload/preload.cjs'),
        },
    });

    let url = `https://localhost:22422/server/control/oauth`
    authwin.loadURL(url)
    if (config.showdevtools) { authwin.webContents.openDevTools()  }
    authwin.once('ready-to-show', () => {
        authwin?.removeMenu() 
        authwin?.setMinimizable(false)
        authwin?.show()
        authwin?.moveTop();
    })
}






// SSL/TSL: this is the self signed certificate support
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.log(certificate)
    // On certificate error we disable default behaviour (stop loading the page)
    // and we then say "it is all fine - true" to the callback
    event.preventDefault();
    callback(true);
});


app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
    if (win) {
        // Focus on the main window if the user tried to open another
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})

app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length) {
        allWindows[0].focus()
    } else {
        createWindow()
    }
})

app.whenReady().then(()=>{
    nativeTheme.themeSource = 'light'
    server.listen(config.serverApiPort, () => {  
        console.log(`Express listening on https://${config.hostip}:${config.serverApiPort}`)
        console.log(`Vite-vue listening on http://${config.hostip}:${config.serverVitePort}`)
    }) 
})
.then(()=>{
    if (config.hostip) {
        multicastClient.init()
    }
    powerSaveBlocker.start('prevent-display-sleep')
    createWindow()
})



ipcMain.on('openmsauth', (event) => { createMsauthWindow();  event.returnValue = true })  

ipcMain.on('getconfig', (event) => {  
    const clonedObject = copyConfig(config);  // we cant just copy the config because it contains examServerList which contains confic (circular structure)
    event.returnValue = clonedObject
})  

ipcMain.on('resetToken', (event) => {  
    config.accessToken = false
    const clonedObject = copyConfig(config);  // we cant just copy the config because it contains examServerList which contains confic (circular structure)
    event.returnValue = clonedObject
})  

ipcMain.on('getCurrentWorkdir', (event) => {   event.returnValue = config.workdirectory  })

ipcMain.on('checkDiscspace', async (event) => {   
    let freespace = await checkDiskSpace(config.workdirectory).then((diskSpace) => {
        let free = Math.round(diskSpace.free/1024/1024/1024 * 1000)/1000
        return free

    })
    event.returnValue = freespace
})

ipcMain.on('setworkdir', async (event, arg) => {
    const result = await dialog.showOpenDialog( win, {
      properties: ['openDirectory']
    })
    if (!result.canceled){
        console.log('directories selected', result.filePaths)
        let message = ""
        try {
            let testdir = join(result.filePaths[0]   , config.examdirectory)
            if (!fs.existsSync(testdir)){fs.mkdirSync(testdir)}
            message = "success"
            config.workdirectory = testdir
        }
        catch (e){
            message = "error"
            console.log(e)
        }
        event.returnValue = {workdir: config.workdirectory, message : message}
    }
    else {
        event.returnValue = {workdir: config.workdirectory, message : 'canceled'}
    }
  })



  function copyConfig(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
  
    const clonedObj = Array.isArray(obj) ? [] : {};
  
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key !== 'examServerList') {
          if (typeof obj[key] === 'object') {
            clonedObj[key] = cloneObjectExcludingExamServerList(obj[key]);
          } else {
            clonedObj[key] = obj[key];
          }
        }
      }
    }
  
    return clonedObj;
  }
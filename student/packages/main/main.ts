/**
 * This is the ELECTRON main file that actually opens the electron window
 */

import { app, BrowserWindow, shell, ipcMain, screen, globalShortcut, TouchBar } from 'electron'
import { release } from 'os'
import { join } from 'path'
import {enableRestrictions, disableRestrictions} from './scripts/platformrestrictions.js';

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') {  app.setAppUserModelId(app.getName())}



if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null

async function createWindow() {
    const display = screen.getPrimaryDisplay();
    const dimensions = display.workAreaSize;


    win = new BrowserWindow({
        title: 'Main window',
        icon: join(__dirname, '../../public/icons/icon.png'),
        width: 1000,
        height: 600,
        minWidth: 760,
        minHeight: 600,
        alwaysOnTop: true,
        webPreferences: {
            preload: join(__dirname, '../preload/preload.cjs')
        }
    })

    if (app.isPackaged || process.env["DEBUG"]) {
        win.removeMenu() 
        win.loadFile(join(__dirname, '../renderer/index.html'))
        //win.webContents.openDevTools()  // you don't want this in the final build
    } 
    else {
        const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`
        win.removeMenu() 
        win.loadURL(url)
        win.webContents.openDevTools()
    }



    /**
     * we create custom listeners here
     * in electron frontend OR express api (import) ipcRenderer is exposed and usable to send or receive messages (see preload/index.ts)
     * we can call ipcRenderer.send('signal') to send and ipcMain to reveive in mainprocess
     */
    const blurevent = () => { 
        win?.webContents. send('blurevent'); 
        win?.show();  // we keep focus on the window.. no matter what
        win?.moveTop();
        win?.focus();
    }
   
    // if we receive "exam" from the express API (via ipcRenderer.send() ) - we inform our renderer (view) 
    // which sets a ipcRenderer listener for the "exam" signal to switch to the correct page (read examtype)  
    ipcMain.on("exam", (event, token, examtype) =>  {
        enableRestrictions(win)
        win?.setKiosk(true)
        win?.minimize()
        win?.focus()

        win?.webContents.send('exam', token, examtype);
        //on windows we might need a delay here until "enableRestrictions" has finished
        win?.addListener('blur', blurevent)  // send blurevent on blur
    }); 

    ipcMain.on("endexam", (event, token, examtype) =>  {
        disableRestrictions()
        win?.setKiosk(false)
        win?.removeListener('blur', blurevent)  // do not send blurevent on blur
        win?.webContents.send('endexam', token, examtype);
    }); 


    ipcMain.on("save", () =>  {
        win?.webContents.send('save');
    }); 




    //trying to fetch some common keyboardshortcuts (alt+tab strg-alt-entf is not possible)
    win.webContents.on('before-input-event', (event, input) => {
        if (input.alt || input.key.toLowerCase() === "alt") {
            console.log('Pressed Alt')
            event.preventDefault()
          }
        if (input.key.toLocaleLowerCase() === "meta" || input.key.toLocaleLowerCase() === "super"|| input.key.toLocaleLowerCase() === "cmd" ) {
            console.log('Pressed meta')
            event.preventDefault()
          }

        if ( (input.key.toLowerCase() === "meta" || input.key.toLowerCase() === "super"|| input.key.toLowerCase() === "cmd" ) && input.key.toLowerCase() === "p"   ) {
            console.log('Pressed meta')
            event.preventDefault()
          }
    })


    // Make all links open with the browser, not with the application
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })

    win.webContents.session.setCertificateVerifyProc((request, callback) => {
        var { hostname, certificate, validatedCertificate, verificationResult, errorCode } = request;
        callback(0);
    });
}





app.whenReady()
.then( () => {
    // trying to catch some keyboard shortcuts here
    globalShortcut.register('Alt+CommandOrControl+I', () => {
        console.log('Electron loves global shortcuts!')
        return false
    })
    globalShortcut.register('CommandOrControl+P', () => {
        console.log('Electron loves global shortcuts!')
        return false
    })
  })
.then(createWindow)



// SSL/TSL: this is the self signed certificate support
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // On certificate error we disable default behaviour (stop loading the page)
    // and we then say "it is all fine - true" to the callback
    event.preventDefault();
    callback(true);
});

// if window is closed
app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()

    disableRestrictions()
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

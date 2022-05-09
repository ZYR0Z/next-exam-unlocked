
import { app, BrowserWindow, shell, dialog, Menu, MenuItem } from 'electron'
import { join } from 'path'
import {enableRestrictions} from './platformrestrictions.js';

  ////////////////////////////////////////////////////////////
 // Window handling (ipcRenderer Process - Frontend) START
////////////////////////////////////////////////////////////


class WindowHandler {
    constructor () {
      this.blockwindows = []
      this.mainwindow = null
      this.examwindow = null
      this.config = null
      this.multicastClient = null
    }

    init (mc, config) {
        this.multicastClient = mc
        this.config = config
    }




    /**
     * BlockWindow (to cover additional screens)
     * @param display 
     */

    newBlockWin(display) {
        let blockwin = new BrowserWindow({
            x: display.bounds.x + 0,
            y: display.bounds.y + 0,
            parent: this.examwindow,
            skipTaskbar:true,
            title: 'Next-Exam',
            width: display.bounds.width,
            height: display.bounds.height,
            closable: false,
            alwaysOnTop: true,
            focusable: false,   //doesn't work with kiosk mode (no kiosk mode possible.. why?)
            minimizable: false,
            resizable:false,
            movable: false,
            icon: join(__dirname, '../../public/icons/icon.png'),
            webPreferences: {
                preload: join(__dirname, '../preload/preload.cjs'),
            },
        });
    
        let url = "notfound"
        if (app.isPackaged) {
            let path = join(__dirname, `../renderer/index.html`)
            blockwin.loadFile(path, {hash: `#/${url}/`})
        } 
        else {
            url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}/#/${url}/`
            blockwin.loadURL(url)
        }
        blockwin.removeMenu() 
        blockwin.moveTop();
        blockwin.setKiosk(true)
        blockwin.show()
        this.blockwindows.push(blockwin)
    }



    /**
     * Examwindow
     * @param examtype eduvidual, math, language
     * @param token student token
     * @param serverstatus the serverstatus object containing info about spellcheck language etc. 
     */
    createExamWindow(examtype, token, serverstatus) {
        this.examwindow = new BrowserWindow({
            // parent: win,  //this doesnt work together with kiosk on ubuntu gnome ?? wtf
            // modal: true,  // this blocks the main window on windows while the exam window is open
            skipTaskbar:true,
            title: 'Exam',
            width: 800,
            height: 600,
            // closable: false,  // if we can't define 'parent' this window has to be closable
            alwaysOnTop: true,
            show: false,
            icon: join(__dirname, '../../public/icons/icon.png'),
            webPreferences: {
                preload: join(__dirname, '../preload/preload.cjs'),
                spellcheck: true
            },
        });
    
        // Load correct url 
        if (examtype === "eduvidual"){    //external page
            let url ='https://eduvidual.at'  
            this.examwindow.loadURL(url)
        }
        else { 
            let url = examtype   // editor || math || tbd.
            if (app.isPackaged) {
                let path = join(__dirname, `../renderer/index.html`)
                this.examwindow.loadFile(path, {hash: `#/${url}/${token}`})
            } 
            else {
                url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}/#/${url}/${token}/`
                this.examwindow.loadURL(url)
            }
        }

        // HANDLE SPELLCHECK 
        if (serverstatus.spellcheck){  
            console.log(serverstatus.spellchecklang)
            this.examwindow.webContents.session.setSpellCheckerLanguages([serverstatus.spellchecklang])
            this.examwindow.webContents.session.setSpellCheckerDictionaryDownloadURL('https://localhost:11411/dicts/')
            if (serverstatus.suggestions){
                this.examwindow.webContents.on('context-menu', (event, params) => {
                    const menu = new Menu()
                    for (const suggestion of params.dictionarySuggestions) { // Add each spelling suggestion
                        menu.append(new MenuItem({ label: suggestion, click: () => this.examwindow.webContents.replaceMisspelling(suggestion) }))
                    }
                    menu.popup()
                })
            }
        }
        else { this.examwindow.webContents.session.setSpellCheckerLanguages([]) }

        // HANDLE EDUVIDUAL pdf embed
        if (serverstatus.examtype === "eduvidual"){
            this.examwindow.webContents.on('did-navigate', (event, url) => {
                this.examwindow.webContents.executeJavaScript(` 
                    const warning = document.createElement('div')
                    warning.setAttribute('id', 'nextexamwaring')
                    warning.setAttribute('style', 'display: none');
                    const background = document.createElement('div');
                    background.setAttribute('id', 'embedbackground')
                    background.setAttribute('style', 'display: none');
                    const embed = document.createElement('embed');` , true)
                    .catch(err => console.log(err))
            })
            this.examwindow.webContents.on('will-navigate', (event, url) => {
                console.log(url)
                if (url.includes('resource/view')&& !url.includes('forceview')){
                    event.preventDefault()
                    this.examwindow.webContents.executeJavaScript(` 
                        background.onclick = function() {  document.getElementById('embedbackground').style = "display: none;" };
                        background.setAttribute('style', 'display: block; position: fixed; top:0; left: 0; width:100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.4); z-index:100000;');
                        document.body.appendChild(background); 
                        embed.setAttribute('src', '${url}');
                        embed.setAttribute('style', 'position: absolute; top: 50%; left: 50%; margin-left: -30vw; margin-top: -45vh; width:60vw; height: 90vh; padding: 10px; background-color: rgba(255, 255, 255, 1);  box-shadow: 0 0 15px rgba(22, 9, 9, 0.589); padding: 10px; border-radius: 6px;');
                        background.appendChild(embed); ` , true)
                        .catch(err => console.log(err))
                }
            })
        }
        this.examwindow.webContents.openDevTools() 
        this.examwindow.removeMenu() 
        this.examwindow.once('ready-to-show', () => {
            this.examwindow.setKiosk(true)
            this.examwindow?.show()
            this.examwindow?.moveTop();
            this.examwindow?.focus();
           
        })

        // Handle BLUR event
        this.examwindow.addListener('blur', () => { this.blurevent(this)})
        enableRestrictions(WindowHandler.examwindow)
    }




    /**
     * the main window
     */
    async createMainWindow() {
        this.mainwindow = new BrowserWindow({
            title: 'Main window',
            icon: join(__dirname, '../../public/icons/icon.png'),
            width: 1000,
            height: 600,
            minWidth: 760,
            minHeight: 600,
            show: false,
            webPreferences: {
                preload: join(__dirname, '../preload/preload.cjs'),
                spellcheck: false
            }
        })

        if (app.isPackaged || process.env["DEBUG"]) {
            this.mainwindow.removeMenu() 
            this.mainwindow.loadFile(join(__dirname, '../renderer/index.html'))
            this.mainwindow.webContents.openDevTools()  // you don't want this in the final build
        } 
        else {
            const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`
            this.mainwindow.removeMenu() 
            this.mainwindow.loadURL(url)
            this.mainwindow.webContents.openDevTools()
        }

        // Make all links open with the browser, not with the application // this would trigger blur event in exam mode
        this.mainwindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('https:')) shell.openExternal(url)
            return { action: 'deny' }
        })

        this.mainwindow.webContents.session.setCertificateVerifyProc((request, callback) => {
            var { hostname, certificate, validatedCertificate, verificationResult, errorCode } = request;
            callback(0);
        });

        this.mainwindow.on('close', async  (e) => {   //ask before closing
            if (!this.config.development) {
                let choice = dialog.showMessageBoxSync(this.mainwindow, {
                    type: 'question',
                    buttons: ['Yes', 'No'],
                    title: 'Exit',
                    message: 'Are you sure?'
                });
                if(choice == 1){ e.preventDefault(); }
            }
        });

        this.mainwindow.once('ready-to-show', () => {
            this.mainwindow.show()
            this.mainwindow.moveTop();
            this.mainwindow.focus();
        })
    }





    blurevent(winhandler) { 
        console.log("blur")
        winhandler.examwindow.show();  // we keep focus on the window.. no matter what
        winhandler.examwindow.moveTop();
        winhandler.examwindow.focus();
        winhandler.multicastClient.clientinfo.focus = false
    
        // this only triggers in "eduvidual" mode because otherwise there is no element "warning" to append
        winhandler.examwindow.webContents.executeJavaScript(` 
                    if (typeof warning !== 'undefined'){
                        document.body.appendChild(warning); 
                        document.getElementById('nextexamwaring').innerHTML = "Leaving exam mode is not allowed";
                        warning.setAttribute('style', 'text-align: center; padding: 20px;display: block; background-color:#ffc107; border-radius:5px;  z-index:100000; position: absolute; top: 50%; left: 50%; margin-left: -10vw; margin-top: -5vh;width:20vw; height: 10vh; box-shadow: 0 0 10px rgba(0,0,0,0.4); ');
                        setTimeout( ()=>{ document.getElementById('nextexamwaring').style.display = 'none'  } , 5000); 
                    }` , true)
        .catch(err => console.log(err))
    }
    
}


export default new WindowHandler()
 









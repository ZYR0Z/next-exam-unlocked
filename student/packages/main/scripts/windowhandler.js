/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel
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



import { app, BrowserWindow, BrowserView, dialog, screen, ipcMain} from 'electron'
import { join } from 'path'
import {disableRestrictions, enableRestrictions} from './platformrestrictions.js';
import fs from 'fs' 
import examMenu from './examMenu.js';
import Nodehun from 'nodehun'

  ////////////////////////////////////////////////////////////
 // Window handling (ipcRenderer Process - Frontend) START
////////////////////////////////////////////////////////////





class WindowHandler {
    constructor () {
      this.blockwindows = []
      this.screenlockWindow = null
      this.mainwindow = null
      this.examwindow = null
      this.splashwin = null
      this.bipwindow = null
      this.config = null
      this.multicastClient = null
      this.nodehun = null  //needed for manual spellchecker
    }

    init (mc, config) {
        this.multicastClient = mc
        this.config = config
    }

    // return electron window in focus or an other electron window depending on the hierachy
    getCurrentFocusedWindow() {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
          return focusedWindow
        } else {
            if (this.screenlockWindow){return this.screenlockWindow}
            else if (this.examwindow){return this.examwindow}
            else if (this.mainwindow){return this.mainwindow}
            else { return false }
        }
    }


    createBiPLoginWin() {
        this.bipwindow = new BrowserWindow({
            title: 'Next-Exam',
            icon: join(__dirname, '../../public/icons/icon.png'),
            center:true,
            width: 1000,
            height:800,
            alwaysOnTop: true,
            skipTaskbar:true,
            autoHideMenuBar: true,
           // resizable: false,
            minimizable: false,
           // movable: false,
           // frame: false,
            show: false,
           // transparent: true
        })
     
        this.bipwindow.loadURL(`https://www.bildung.gv.at/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=next-exam`)

        this.bipwindow.once('ready-to-show', () => {
            this.bipwindow.show()
        });

        this.bipwindow.webContents.on('did-navigate', (event, url) => {    // a pdf could contain a link ^^
            console.log("did-navigate")
            console.log(url)
        })
        this.bipwindow.webContents.on('will-navigate', (event, url) => {    // a pdf could contain a link ^^
            console.log("will-navigate")
            console.log(url)
        })

         this.bipwindow.webContents.on('new-window', (event, url) => {  // if a new window should open triggered by window.open()
            console.log("new-window")
            console.log(url)
            event.preventDefault();    // Prevent the new window from opening
        }); 
     
         
         this.bipwindow.webContents.setWindowOpenHandler(({ url }) => { // if a new window should open triggered by target="_blank"
            console.log("target: _blank")
            console.log(url)
            return { action: 'deny' };   // Prevent the new window from opening
        }); 

        this.bipwindow.webContents.on('will-redirect', (event, url) => {
            console.log('Redirecting to:', url);
            // Prüfen, ob die URL das gewünschte Format hat
            if (url.startsWith('moodlemobile://')) {
                event.preventDefault(); // Verhindert den Standard-Redirect
                const prefix = 'moodlemobile://token=';

                const token = url.substring(prefix.length);
                
    
                console.log('Captured Token:');
                console.log(token);
                this.mainwindow.webContents.send('bipToken', token);
                this.bipwindow.close();
            }
          });

    }













    /**
     * this is the windows splashscreen
     */
    createSplashWin() {
        this.splashwin = new BrowserWindow({
            title: 'Next-Exam',
            icon: join(__dirname, '../../public/icons/icon.png'),
            center:true,
            width: 600,
            height:200,
            alwaysOnTop: true,
            skipTaskbar:true,
            autoHideMenuBar: true,
            resizable: false,
            minimizable: false,
            movable: false,
            frame: false,
            show: false,
            transparent: true
        })
     
        this.splashwin.loadFile(join(__dirname, `../../public/splash.html`))

        this.splashwin.once('ready-to-show', () => {
            this.splashwin.show()
            this.createMainWindow()
        });
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
            // resizable:false,   // leads to weird 20px bottomspace on windows
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
        blockwin.setKiosk(true)
        blockwin.setAlwaysOnTop(true, "screen-saver", 1) 
        blockwin.show()
        blockwin.moveTop();
        this.blockwindows.push(blockwin)
    }


    /**
     * Screenlock Window (to cover the mainscreen) - block students from working
     * @param display 
     */

    createScreenlockWindow(display) {
        this.screenlockWindow = new BrowserWindow({
            show: false,
            x: display.bounds.x + 0,
            y: display.bounds.y + 0,
            // parent: this.mainwindow,   // leads to visible titlebar in gnome-desktop
            skipTaskbar:true,
            title: 'Screenlock',
            width: display.bounds.width,
            height: display.bounds.height,
            closable: false,
            alwaysOnTop: true,
            //focusable: false,   //doesn't work with kiosk mode (no kiosk mode possible.. why?)
            minimizable: false,
            // resizable:false, // leads to weird 20px bottomspace on windows
            movable: false,
            icon: join(__dirname, '../../public/icons/icon.png'),
            webPreferences: {
                preload: join(__dirname, '../preload/preload.cjs'),
            },
        });

        let url = "lock"
        if (app.isPackaged) {
            let path = join(__dirname, `../renderer/index.html`)
            this.screenlockWindow.loadFile(path, {hash: `#/${url}/`})
        } 
        else {
            url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}/#/${url}/`
            this.screenlockWindow.loadURL(url)
        }

        if (this.config.showdevtools) { this.screenlockWindow.webContents.openDevTools()  }

        this.screenlockWindow.once('ready-to-show', () => {
            this.screenlockWindow.removeMenu() 
           
            this.screenlockWindow.setMinimizable(false)
            this.screenlockWindow.setKiosk(true)
            this.screenlockWindow.setAlwaysOnTop(true, "screen-saver", 1) 
            this.screenlockWindow.show()
            this.screenlockWindow.moveTop();
            this.screenlockWindow.setClosable(true)
            this.addBlurListener("screenlock")
        })

        this.screenlockWindow.on('close', async  (e) => {   // window should not be closed manually.. ever! but if you do make sure to clean examwindow variable and end exam for the client
            if (!this.config.development) { e.preventDefault(); }  
        });
    }




    /**
     * Examwindow
     * @param examtype eduvidual, math, language
     * @param token student token
     * @param serverstatus the serverstatus object containing info about spellcheck language etc. 
     */
    async createExamWindow(examtype, token, serverstatus, primarydisplay) {
        // just to be sure we check some important vars here
        if (examtype !== "gforms" && examtype !== "eduvidual" && examtype !== "editor" && examtype !== "math" && examtype !== "microsoft365" || !token){  // for now.. we probably should stop everything here
            console.log("missing parameters for exam-mode or mode not in allowed list!")
            examtype = "editor" 
        } 
        
        let px = 0
        let py = 0
        if (primarydisplay && primarydisplay.bounds && primarydisplay.bounds.x) {
            px = primarydisplay.bounds.x
            py = primarydisplay.bounds.y
        }

        this.examwindow = new BrowserWindow({
            x: px + 0,
            y: py + 0,
            // parent: win,  //this doesnt work together with kiosk on ubuntu gnome ?? wtf
            // modal: true,  // this blocks the main window on windows while the exam window is open
            skipTaskbar:true,
            autoHideMenuBar: true,
            title: 'Exam',
            width: 800,
            height: 600,
            // closable: false,  // if we can't define 'parent' this window has to be closable - why?
            alwaysOnTop: true,
            show: false,
            icon: join(__dirname, '../../public/icons/icon.png'),
            webPreferences: {
                preload: join(__dirname, '../preload/preload.cjs'),
                spellcheck: false,  
                contextIsolation: true,
                webviewTag: true
            }
        });

        this.examwindow.serverstatus = serverstatus //we keep it there to make it accessable via examwindow in ipcHandler
        this.examwindow.menuHeight = 94   // start position for the content view
        

        /**
         * Microsoft 365 emebeds its editor in an iframe with active Content Security Policy (CSP)
         * The only way to be able to inject code is to load it directly in the main window <embed> <iframe> or even <webview> offers no workaround
         * therefore we use "BrowserView" in order to display two pages in one window: on top > exam header, on bottom > office
         */

        if (examtype === "microsoft365"  ) { //external page
            console.log("starting microsoft365 exam...")
           
            let urlview = this.multicastClient.clientinfo.msofficeshare   
           

            if (!urlview) {// we wait for the next update tick - msofficeshare needs to be set ! (could happen when a student connects later then exam mode is set but his share url needs some time)
                console.log("no url for microsoft365 was set")
                console.log(this.multicastClient.clientinfo)
                this.examwindow.destroy(); 
                this.examwindow = null;
                disableRestrictions(this.examwindow)
                this.multicastClient.clientinfo.exammode = false
                this.multicastClient.clientinfo.focus = true
                return
            }


            // load top menu in MainPage
            let url = examtype   // editor || math || eduvidual || tbd.
            if (app.isPackaged) {
                let path = join(__dirname, `../renderer/index.html`)
                this.examwindow.loadFile(path, {hash: `#/${url}/${token}`})
            } 
            else {
                let backgroundurl = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}/#/${url}/${token}/`
                this.examwindow.loadURL(backgroundurl);
            }


            // Define the MainContentPage view
            let contentView = new BrowserView({
                webPreferences: {
                  spellcheck: false,  
                  contextIsolation: true,
                }
            });
            
           
            contentView.setBounds({
                x: 0,
                y: this.examwindow.menuHeight,
                width: this.examwindow.getBounds().width,
                height: this.examwindow.getBounds().height - this.examwindow.menuHeight
            });
            contentView.setAutoResize({ width: true, height: true, horizontal: true, vertical: true });
            contentView.webContents.loadURL(urlview);
            if (this.config.showdevtools) {       contentView.webContents.openDevTools() }

            this.examwindow.addBrowserView(contentView);

            this.examwindow.on('enter-full-screen', () => {
                this.examwindow.setBrowserView(contentView);

                let newBounds = this.examwindow.getBounds();
                contentView.setBounds({
                  x: 0,
                  y: this.examwindow.menuHeight,
                  width: newBounds.width,
                  height: newBounds.height - this.examwindow.menuHeight
                });
            });


            this.examwindow.on('resize', () => {
                let newBounds = this.examwindow.getBounds();
                contentView.setBounds({
                  x: 0,
                  y: this.examwindow.menuHeight,
                  width: newBounds.width,
                  height: newBounds.height - this.examwindow.menuHeight
                });
            });
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





        /**
         * HANDLE SPELLCHECK 
         */ 
      
        if (serverstatus.spellcheck){  
            const dictionaryPath = join( __dirname,'../../public/dictionaries');
            let language = serverstatus.spellchecklang
            let affix = null;
            let dictionary = null;

            if (language === "en-GB") {
                affix       = fs.readFileSync(join(dictionaryPath, 'en_US.aff'))
                dictionary  = fs.readFileSync(join(dictionaryPath, 'en_US.dic'))
            }
            else if (language === "de"){
                affix       = fs.readFileSync(join(dictionaryPath, 'de_DE_frami.aff'))
                dictionary  = fs.readFileSync(join(dictionaryPath, 'de_DE_frami.dic'))
            }
            else if (language === "it"){
                affix       = fs.readFileSync(join(dictionaryPath, 'it_IT.aff'))
                dictionary  = fs.readFileSync(join(dictionaryPath, 'it_IT.dic'))
            }
            else if (language === "fr"){
                affix       = fs.readFileSync(join(dictionaryPath, 'fr.aff'))
                dictionary  = fs.readFileSync(join(dictionaryPath, 'fr.dic'))
            }
            else if (language === "es"){
                affix       = fs.readFileSync(join(dictionaryPath, 'es_ES.aff'))
                dictionary  = fs.readFileSync(join(dictionaryPath, 'es_ES.dic'))
            }
            this.nodehun  = new Nodehun(affix, dictionary)
        }
        



        /**
         * Handle special NAVIGATION situations
         */

        /***************************
         *  Texteditor
         ***************************/
        if (serverstatus.examtype === "editor" ){  // do not under any circumstances allow navigation away from the editor
            this.examwindow.webContents.on('will-navigate', (event, url) => {    // a pdf could contain a link ^^
                event.preventDefault()
            })
        }

        /***************************
         *  Microsoft Excel/Word
         ***************************/
        if ( serverstatus.examtype === "microsoft365"){  // do not under any circumstances allow navigation away from the current exam url
            const browserView = this.examwindow.getBrowserView(0);

            // if the user wants to navigate away from this page
            browserView.webContents.on('will-navigate', (event, url) => {
                if (url !== this.multicastClient.clientinfo.msofficeshare ) {
                    console.log("do not navigate away from this test.. ")
                    event.preventDefault()
                }  
            })

            // if a new window should open triggered by window.open()
            browserView.webContents.on('new-window', (event, url) => { event.preventDefault();   }); // Prevent the new window from opening
     
            // if a new window should open triggered by target="_blank"
            browserView.webContents.setWindowOpenHandler(({ url }) => { return { action: 'deny' };   }); // Prevent the new window from opening
                 
            // Wait until the webContents is fully loaded
            browserView.webContents.on('did-finish-load', async () => {
                browserView.webContents.mainFrame.frames.filter((frame) => {
                    let executeCode =  `
                            function lock(){

                                // 'WACDialogOuterContainer','WACDialogInnerContainer','WACDialogPanel',
                                const hideusByID = ['InsertAddInFlyout','Designer','Editor','FarPane','Help','InsertAppsForOffice','FileMenuLauncherContainer','Help-wrapper','Review-wrapper','Header','FarPeripheralControlsContainer','BusinessBar']
                                for (entry of hideusByID) {
                                    let element = document.getElementById(entry)
                                    if (element) { element.style.display = "none" }
                                }

                                let buttonAppsOverflow = document.getElementsByName('Add-Ins')[0];  // this button is redrawn on resize (doesn't happen in exam mode but still there must be a cleaner way - inserting css before it appears is not working)
                                if (buttonAppsOverflow){ buttonAppsOverflow.style.display = "none" }

                                let elements = document.querySelectorAll('[aria-label="Suchen"]');
                                elements.forEach(element => { element.style.display = 'none';});
                                elements = document.querySelectorAll('[aria-label="Übersetzen"]');
                                elements.forEach(element => { element.style.display = 'none';});
                                elements = document.querySelectorAll('[aria-label="Copilot"]');
                                elements.forEach(element => { element.style.display = 'none'; });
                                elements = document.querySelectorAll('[aria-label="Add-Ins"]');
                                elements.forEach(element => { element.style.display = 'none'; });
                                elements = document.querySelectorAll('[data-unique-id="ContextMenu-SmartLookupContextMenu"]');
                                elements.forEach(element => {element.style.display = 'none';});
                                elements = document.querySelectorAll('[data-unique-id="ContextMenu-SmartLookupSynonyms"]');
                                elements.forEach(element => {element.style.display = 'none'; });
                                elements = document.querySelectorAll('[data-unique-id="Ribbon-ReferencesSmartLookUp"]');
                                elements.forEach(element => {element.style.display = 'none';});
                                elements = document.querySelectorAll('[data-unique-id="Dictation"]');
                                elements.forEach(element => { element.style.display = 'none'; });
                                elements = document.querySelectorAll('[data-unique-id="GetAddins"]');
                                elements.forEach(element => { element.style.display = 'none'; });
                            }
                            const intervalId = setInterval(lock, 400);
                            lock()  //for some reason excel delays that call.. doesnt happen on page finish load
                            `
                    if (frame && frame.name === 'WebApplicationFrame') {
                        frame.executeJavaScript(executeCode); 
                    }
                })
            });
        }

       






        this.examwindow.once('ready-to-show', async () => {
            if (!this.config.development) { 
                this.examwindow.setKiosk(true)
                this.examwindow.setMinimizable(false)

                if (process.platform ==='darwin') {  this.examwindow.setAlwaysOnTop(true, "pop-up-menu", 0)  }  // do not display above popup because of colorpicker in editor (fix that!)
                else { this.examwindow.setAlwaysOnTop(true, "screen-saver", 1)   }

                this.examwindow.moveTop();
                enableRestrictions(this.examwindow)  // enable restriction only when exam window is fully loaded and in focus
                await this.sleep(2000) // wait an additional 2 sec for windows restrictions to kick in (they steal focus)
                this.examwindow.focus()
                this.addBlurListener()
            }
            this.examwindow.removeMenu() 
            if (this.config.showdevtools) { this.examwindow.webContents.openDevTools()  }
            this.examwindow.show()
            this.examwindow.focus()
        })

        this.examwindow.on('close', async  (e) => {   // window should not be closed manually.. ever! but if you do make sure to clean examwindow variable and end exam for the client
            if (this.multicastClient.clientinfo.exammode) {
                if (!this.config.development) { e.preventDefault(); }
            }
            else {
                this.examwindow.destroy(); 
                this.examwindow = null;
                disableRestrictions(this.examwindow)
                this.multicastClient.clientinfo.exammode = false
                this.multicastClient.clientinfo.focus = true
            }  
        });
    }













    /**
     * the main window
     */
    async createMainWindow() {
        let primarydisplay = screen.getPrimaryDisplay()

        this.mainwindow = new BrowserWindow({
            title: 'Main window',
            icon: join(__dirname, '../../public/icons/icon.png'),
            center:true,
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
        } 
        else {
            const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`
            this.mainwindow.removeMenu() 
            this.mainwindow.loadURL(url)
        }

        if (this.config.showdevtools) { this.mainwindow.webContents.openDevTools()  } // you don't want this in the final build

        this.mainwindow.webContents.session.setCertificateVerifyProc((request, callback) => {
            var { hostname, certificate, validatedCertificate, verificationResult, errorCode } = request;
            callback(0);
        });

        this.mainwindow.on('close', async  (e) => {   //ask before closing
            if (!this.config.development) {
                let choice = dialog.showMessageBoxSync(this.mainwindow, {
                    type: 'question',
                    buttons: ['Ja', 'Nein'],
                    title: 'Programm Beenden',
                    message: 'Sind sie sicher?',
                    cancelId: 1
                });
                if(choice == 1){ e.preventDefault(); }
            }
        });

        this.mainwindow.once('ready-to-show', () => {
           // this.splashwin.close()
            this.mainwindow.show()
            this.mainwindow.moveTop();
            this.mainwindow.focus();
        })
    }





    /**
     * Additional Functions
     */

    //adds blur listener when entering exammode
    addBlurListener(window = "examwindow"){
        console.log("adding blur listener")
        console.log(window)
        if (window === "examwindow"){ 
            console.log(`Setting Blur Event for ${window}`)
            this.examwindow.addListener('blur', () => this.blurevent(this)) 
        }
        else if (window === "screenlock") {
            console.log(`Setting Blur Event for ${window}window`)
            this.screenlockWindow.addListener('blur', () => this.blureventScreenlock(this))    
        }
    }
    //removes blur listener when leaving exam mode
    removeBlurListener(){
        console.log("removing blur listener")
        this.examwindow.removeAllListeners('blur')
    }
    // implementing a sleep (wait) function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    //student fogus went to another window
    blurevent(winhandler) { 
        console.log("blur-exam")
        if (winhandler.screenlockWindow) { return }// do nothing if screenlockwindow stole focus // do not trigger an infinite loop between exam window and screenlock window (stealing each others focus)
            
        winhandler.multicastClient.clientinfo.focus = false
        winhandler.examwindow.show();  // we keep focus on the window.. no matter what
        winhandler.examwindow.moveTop();
        winhandler.examwindow.focus();

        //turn volume up ^^
        // if (process.platform === 'win32') { spawn('powershell', ['Set-VolumeLevel -Level 100; Set-VolumeMute -Mute $false']); }
        // if (process.platform ==='darwin') { exec('osascript -e "set volume output volume 100" -e "set volume output muted false"'); }  
        // if (process.platform === 'linux') { 
        //     exec('amixer set Master 100% ');
        //     exec('pactl set-sink-mute `pactl get-default-sink` 0');
        // }
        
        //we could play a sound file here.. tbd.
        
        // if (this.multicastClient.clientinfo.examtype === "eduvidual" || this.multicastClient.clientinfo.examtype === "gforms" ){
        //     // this only works in "eduvidual" mode because otherwise there is no element "warning" to append (clicking on an external link is considered a blur event)
        //     winhandler.examwindow.webContents.executeJavaScript(` 
        //                 if (typeof warning !== 'undefined'){
        //                     document.body.appendChild(warning); 
        //                     document.getElementById('nextexamwaring').innerHTML = "Leaving exam mode is not allowed";
        //                     warning.setAttribute('style', 'text-align: center; padding: 20px;display: block; background-color:#ffc107; border-radius:5px;  z-index:100000; position: absolute; top: 50%; left: 50%; margin-left: -10vw; margin-top: -5vh;width:20vw; height: 10vh; box-shadow: 0 0 10px rgba(0,0,0,0.4); ');
        //                     setTimeout( ()=>{ document.getElementById('nextexamwaring').style.display = 'none'  } , 5000); 
        //                 }` , true)
        //     .catch(err => console.log(err))
        // }
    }
    //special blur event for temporary low security screenlock
    blureventScreenlock(winhandler) { 
        console.log("blur-screenlock")
        winhandler.screenlockWindow.show();  // we keep focus on the window.. no matter what
        winhandler.screenlockWindow.moveTop();
        winhandler.screenlockWindow.focus();
    }
    
}


export default new WindowHandler()
 









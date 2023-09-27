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


import axios from "axios";
import {disableRestrictions, enableRestrictions} from './platformrestrictions.js';
import fs from 'fs' 
import crypto from 'crypto';
import archiver from 'archiver'
import extract from 'extract-zip'
import screenshot from 'screenshot-desktop'
import FormData from 'form-data/lib/form_data.js';     //we need to import the file directly otherwise it will introduce a "window" variable in the backend and fail
import { join } from 'path'
import { screen } from 'electron'
import WindowHandler from './windowhandler.js'

import { execSync } from 'child_process';
const shell = (cmd) => execSync(cmd, { encoding: 'utf8' });




 /**
  * Handles information fetching from the server and acts on status updates
  */
 
 class CommHandler {
    constructor () {
        this.multicastClient = null
        this.config = null
        this.updateStudentIntervall = null
        this.WindowHandler = null
        this.screenshotAbility = false
        this.screenshotFails = 0 // we count fails and deactivate on 4 consequent fails
    }
 
    init (mc, config) {
        this.multicastClient = mc
        this.config = config
        this.updateStudentIntervall = setInterval(() => { this.requestUpdate() }, 5000)
        this.heartbeatInterval = setInterval(() => { this.sendHeartbeat() }, 4000)
        this.screenshotInterval = setInterval( () => { this.sendScreenshot() }, this.multicastClient.clientinfo.screenshotinterval )
        if (process.platform !== 'linux' || (  !this.isWayland() && this.imagemagickAvailable()  )){ this.screenshotAbility = true } // only on linux we need to check for wayland or the absence of imagemagick - other os have other problems ^^
    }
 
    /**
     * checks for wayland session on linux - no screenshots here for now
     * @returns true or false
     */
    isWayland(){
        try{ 
            let output = shell(`loginctl show-session $(loginctl | grep $(whoami) | awk '{print $1}') -p Type`); 
            if (output.includes('wayland')){ return true } 
            return false
        } catch(error){
            console.log("Next-Exam detected a Wayland Session - Screenshots are not supported yet")
            return false
        }
    }
    
    /**
     * Checks if imagemagick on linux is available
     * @returns true or false
     */
    imagemagickAvailable(){
        try{ shell(`which import`); return true}
        catch(error){
            console.log("ImageMagick is required to take screenshots on linux")
            return false
        }
    }

    /** 
     * SEND HEARTBEAT in order to set Online/Offline Status 
     * 5 Heartbeats lost is considered offline 
     */
    async sendHeartbeat(){
        // CONNECTION LOST - UNLOCK SCREEN
        if (this.multicastClient.beaconsLost >= 5 ){ // no serversignal for 20 seconds
            console.log("Connection to Teacher lost! Removing registration.") //remove server registration locally (same as 'kick')
            this.multicastClient.beaconsLost = 0
            this.resetConnection()
            this.killScreenlock()
            if (this.multicastClient.clientinfo.exammode === true) {
                // lets try to allow students to gracefully exit exam on connection loss manually (only in geogebra and editor for now bc. we control the ui) 
                // this should lead to less irritation when the teacher connection is lost
                if (this.multicastClient.clientinfo.examtype === "eduvidual" || this.multicastClient.clientinfo.examtype === "microsoft365" || this.multicastClient.clientinfo.examtype === "gforms") {
                    this.gracefullyEndExam()  // this should end kiosk mode, the blur listener and all (keyboard) restrictions but not kill the window
                }else {
                    console.log("Keeping Examwindow Lockdown")
                }
            }
        }

        // ACTIVE SERVER CONNECTION - SEND HEARTBEAT
        if (this.multicastClient.clientinfo.serverip) { 
            axios({
                method: "post", 
                url: `https://${this.multicastClient.clientinfo.serverip}:${this.config.serverApiPort}/server/control/heartbeat/${this.multicastClient.clientinfo.servername}/${this.multicastClient.clientinfo.token}`, 
                headers: {'Content-Type': 'application/json' }
            }).then( response => {
                if (response.data && response.data.status === "error") { 
                     if      (response.data.message === "notavailable"){ console.log('Exam Instance not found!');        this.multicastClient.beaconsLost = 5} //server responded but exam is not available anymore 
                     else if (response.data.message === "removed"){      console.log('Student registration not found!'); this.multicastClient.beaconsLost = 5} //server responded but student is no registered anymore (kicked)
                     else { this.multicastClient.beaconsLost += 1;       console.log("heartbeat lost..") }  // other error
                }
                else if (response.data && response.data.status === "success") {  this.multicastClient.beaconsLost = 0  }
            })
            .catch(error => { console.log(`SendHeartbeat Axios: ${error}`); this.multicastClient.beaconsLost += 1; console.log("heartbeat lost..") });
        }
    }


    /** 
     * Update current Serverstatus + Studenttstatus (every 5 seconds)
     */
    async requestUpdate(){
        if (this.multicastClient.clientinfo.serverip) {  //check if server connected - get ip
            const formData = new FormData()  //create formdata
            formData.append('clientinfo', JSON.stringify(this.multicastClient.clientinfo) );   //we send the complete clientinfo object

            axios({    //send update and fetch server status
                method: "post", 
                url: `https://${this.multicastClient.clientinfo.serverip}:${this.config.serverApiPort}/server/control/update`, 
                data: formData, 
                headers: { 'Content-Type': `multipart/form-data; boundary=${formData._boundary}` }  
            })
            .then( response => {
                if (response.data && response.data.status === "error") { console.log("requestUpdate Axios: status error - try again in 5 seconds") }
                else if (response.data && response.data.status === "success") { 
                    this.multicastClient.beaconsLost = 0 // this also counts as successful heartbeat - keep connection
                    this.processUpdatedServerstatus(response.data.serverstatus, response.data.studentstatus)
                }
            })
            .catch(error => { console.log(`requestUpdate Axios: ${error}`); console.log("requestUpdate Axios: failed - try again in 5 seconds")});
        }
    }



    /** 
     * Update Screenshot on Server  (every 4 seconds - or depending on the server setting)
     */
    async sendScreenshot(){
        if (this.multicastClient.clientinfo.serverip) {  //check if server connected - get ip
    
            let img = null
            const formData = new FormData()  //create formdata
            formData.append('clientinfo', JSON.stringify(this.multicastClient.clientinfo) );   //we send the complete clientinfo object

            //Add screenshot to formData - "imagemagick" has to be installed for linux - wayland is not (yet) supported by imagemagick !!
            if (this.screenshotAbility){
                img = await screenshot()   //grab "screenshot" with screenshot node module
                .then( (res) => { this.screenshotFails=0; return res} )
                .catch((err) => { this.screenshotFails+=1; if(this.screenshotFails > 4){ this.screenshotAbility=false;console.log(`requestUpdate Screenshot: switching to PageCapture`) } console.log(`requestUpdate Screenshot: ${err}`) });
            }
            else {
                //grab "screenshot" from appwindow
                let currentFocusedMindow = WindowHandler.getCurrentFocusedWindow()  //returns exam window if nothing in focus or main window
                if (currentFocusedMindow) {
                    img = await currentFocusedMindow.webContents.capturePage()  // this should always work because it's onboard electron
                    .then((image) => {
                        const imageBuffer = image.toPNG();// Convert the nativeImage to a Buffer (PNG format)
                        return imageBuffer
                      })
                    .catch((err) => {console.log(`requestUpdate Screenshot: ${err}`)   });
                }
            }

            if (Buffer.isBuffer(img)){
                let screenshotfilename = this.multicastClient.clientinfo.token +".jpg"
                formData.append(screenshotfilename, img, screenshotfilename );
                let hash = crypto.createHash('md5').update(img).digest("hex");
                formData.append('screenshothash', hash);
                formData.append('screenshotfilename', screenshotfilename);
            }
            else { console.log("Image is no buffer:", img) }

            axios({    //send screenshot update
                method: "post", 
                url: `https://${this.multicastClient.clientinfo.serverip}:${this.config.serverApiPort}/server/control/updatescreenshot`, 
                data: formData, 
                headers: { 'Content-Type': `multipart/form-data; boundary=${formData._boundary}` }  
            })
            .then( response => {
                if (response.data && response.data.status === "error") { console.log("sendScreenshot Axios: status error",  response.data.message ) }
            })
            .catch(error => { console.log(`sendScreenshot Axios: ${error}`); });
        }
    }

















    /**
     * react to server status 
     * this currently only handle startexam & endexam
     * could also handle kick, focusrestore, and even trigger file requests
     */
    processUpdatedServerstatus(serverstatus, studentstatus){

        this.multicastClient.clientinfo.printrequest = false  //low priority request - always deactivate after sending once to avoid triggering it twice

        // individual status updates
        if ( studentstatus && Object.keys(studentstatus).length !== 0) {  // we have status updates (tasks) - do it!
            if (studentstatus.printdenied) {
                WindowHandler.examwindow.webContents.send('denied','toomany')   //trigger, why
            }

            if (studentstatus.restorefocusstate === true){
                this.multicastClient.clientinfo.focus = true
            }
            if (studentstatus.sendexam === true){
                this.sendExamToTeacher()
            }
            if (studentstatus.fetchfiles === true){
                this.requestFileFromServer(studentstatus.files)
            }

            // this is an microsoft365 thing. check if exam mode is office, check if this is set - otherwise do not enter exammode - it will fail
            if (studentstatus.msofficeshare){
                console.log("officeshare is set")
                //set or update sharing link - it will be used in "microsoft365" exam mode
                this.multicastClient.clientinfo.msofficeshare = studentstatus.msofficeshare
            }

        }

        // global status updates
        if (serverstatus.screenlock && !this.multicastClient.clientinfo.screenlock) {  this.activateScreenlock() }
        else if (!serverstatus.screenlock ) { this.killScreenlock() }

        //update screenshotinterval
        if (serverstatus.screenshotinterval) { 
            if (this.multicastClient.clientinfo.screenshotinterval !== serverstatus.screenshotinterval*1000) {
                console.log("ScreenshotInterval changed to", serverstatus.screenshotinterval*1000)
                this.multicastClient.clientinfo.screenshotinterval = serverstatus.screenshotinterval*1000
                
                // clear old interval and start new interval if set to something bigger than zero
                clearInterval( this.screenshotInterval )
                if (this.multicastClient.clientinfo.screenshotinterval > 0){
                    this.screenshotInterval = setInterval( () => { this.sendScreenshot() }, this.multicastClient.clientinfo.screenshotinterval )
                }
            }
        }
        
        if (serverstatus.exammode && !this.multicastClient.clientinfo.exammode){
            this.killScreenlock() // remove lockscreen immediately - don't wait for server info
            this.startExam(serverstatus)
        }
        else if (!serverstatus.exammode && this.multicastClient.clientinfo.exammode){
            this.killScreenlock() 
            this.endExam(serverstatus)
        }

    }


    // show temporary screenlock window
    activateScreenlock(){
        let displays = screen.getAllDisplays()
        let primary = screen.getPrimaryDisplay()
        if (!primary || primary === "" || !primary.id){ primary = displays[0] }       
       
        if (!WindowHandler.screenlockWindow){  // why do we check? because exammode is left if the server connection gets lost but students could reconnect while the exam window is still open and we don't want to create a second one
            this.multicastClient.clientinfo.screenlock = true
            WindowHandler.createScreenlockWindow(primary);
        }

    }

    // remove temporary screenlockwindow
    killScreenlock(){
        if (WindowHandler.screenlockWindow){ 
            try {  
                WindowHandler.screenlockWindow.close(); 
                WindowHandler.screenlockWindow.destroy(); 
            }
            catch(e){ console.log(e)}
            WindowHandler.screenlockWindow = null;
        }
        this.multicastClient.clientinfo.screenlock = false
    }














    /**
     * Starts exam mode for student
     * deletes workfolder contents (if set)
     * opens a new window in kiosk mode with the given examtype
     * enables the blur listener and activates restrictions (disable keyboarshortcuts etc.)
     * @param serverstatus contains information about exammode, examtype, and other settings from the teacher instance
     */
    async startExam(serverstatus){
        if (serverstatus.delfolder === true){
            console.log("cleaning exam workfolder")
            try {
                if (fs.existsSync(this.config.workdirectory)){   // set by server.js (desktop path + examdir)
                    fs.rmSync(this.config.workdirectory, { recursive: true });
                    fs.mkdirSync(this.config.workdirectory);
                }
            } catch (error) { console.error(error); }
        }

        let displays = screen.getAllDisplays()
        let primary = screen.getPrimaryDisplay()
        if (!primary || primary === "" || !primary.id){ primary = displays[0] }       
       
        this.multicastClient.clientinfo.exammode = true
        this.multicastClient.clientinfo.cmargin = serverstatus.cmargin  // this is used to configure margin settings for the editor

        if (!WindowHandler.examwindow){  // why do we check? because exammode is left if the server connection gets lost but students could reconnect while the exam window is still open and we don't want to create a second one
            console.log("creating exam window")
            this.multicastClient.clientinfo.examtype = serverstatus.examtype
            WindowHandler.createExamWindow(serverstatus.examtype, this.multicastClient.clientinfo.token, serverstatus, primary);
        }
        else if (WindowHandler.examwindow){  //reconnect into active exam session with exam window already open
            console.error("communicationhandler @ startExam: found existing Examwindow..")
            try {  // switch existing window back to exam mode
                WindowHandler.examwindow.show() 
                if (!this.config.development) { 
                    WindowHandler.examwindow.setFullScreen(true)  //go fullscreen again
                    WindowHandler.examwindow.setAlwaysOnTop(true, "screen-saver", 1)  //make sure the window is 1 level above everything
                    enableRestrictions(WindowHandler.examwindow)
                    await this.sleep(2000) // wait an additional 2 sec for windows restrictions to kick in (they steal focus)
                    WindowHandler.addBlurListener();
                }   
            }
            catch (e) { //examwindow variable is still set but the window is not managable anymore (manually closed in dev mode?)
                console.error("communicationhandler @ startExam: no functional examwindow found.. resetting")
                WindowHandler.examwindow = null;
                disableRestrictions()
                this.multicastClient.clientinfo.exammode = false
                this.multicastClient.clientinfo.focus = true
                return  // in that case.. we are finished here !
            }
        }

        if (!this.config.development) {  // lock additional screens
            for (let display of displays){
                if ( display.id !== primary.id ) {
                    WindowHandler.newBlockWin(display)  // add blockwindows for additional displays
                }
            }
        }
       
    }


    /**
     * Disables Exam mode
     * closes exam window
     * disables restrictions and blur 
     */
    async endExam(serverstatus){
        console.log(serverstatus)
        // delete students work on students pc (makes sense if exam is written on school property)
        if (serverstatus.delfolderonexit === true){
            console.log("cleaning exam workfolder on exit")
            try {
                if (fs.existsSync(this.config.workdirectory)){   // set by server.js (desktop path + examdir)
                    fs.rmSync(this.config.workdirectory, { recursive: true });
                    fs.mkdirSync(this.config.workdirectory);
                }
            } catch (error) { console.error(error); }
        }


        if (WindowHandler.examwindow){ // in some edge cases in development this is set but still unusable - use try/catch
            
            try {  //send save trigger to exam window
                if (!serverstatus.delfolderonexit){
                    WindowHandler.examwindow.webContents.send('save', 'exitexam') //trigger, why
                    await this.sleep(3000)  // give students time to read whats happening (and the editor time to save the content)
                }
                WindowHandler.examwindow.close(); 
                WindowHandler.examwindow.destroy(); 
            }
            catch(e){ console.log(e)}
           
            WindowHandler.examwindow = null;
            for (let blockwindow of WindowHandler.blockwindows){
                blockwindow.close(); 
                blockwindow.destroy(); 
                blockwindow = null;
            }
            WindowHandler.blockwindows = []
        }
        disableRestrictions()
        this.multicastClient.clientinfo.exammode = false
        this.multicastClient.clientinfo.focus = true
    }


    // this is triggered if connection is lost during exam - we allow the student to get out of the kiosk mode but keep his work in the editor
    gracefullyEndExam(){
        if (WindowHandler.examwindow){ 
            console.log("Unlocking Workstation")
            try {
                WindowHandler.examwindow.setKiosk(false)
                WindowHandler.examwindow.setAlwaysOnTop(false)
                WindowHandler.examwindow.alwaysOnTop = false
                  // remove listener
                WindowHandler.removeBlurListener();
                disableRestrictions()
            } catch (e) { 
                WindowHandler.examwindow = null
                console.error("communicationhandler: no functional examwindow to handle")
            }
          
            try {
                for (let blockwindow of WindowHandler.blockwindows){
                    blockwindow.close(); 
                    blockwindow.destroy(); 
                    blockwindow = null;
                }
            } catch (e) { 
                WindowHandler.blockwindows = []
                console.error("communicationhandler: no functional blockwindow to handle")
            } 
            this.multicastClient.clientinfo.focus = true
            this.multicastClient.clientinfo.exammode = false
        }
    }

    requestFileFromServer(files){
        let servername = this.multicastClient.clientinfo.servername
        let serverip = this.multicastClient.clientinfo.serverip
        let token = this.multicastClient.clientinfo.token
        let backupfile = false
        for (const file of files) {
            if (file.name && file.name.includes('bak')){
                backupfile = file.name
            }
        }
        
        let data = JSON.stringify({ 'files' : files, 'type': 'studentfilerequest'})
        
        axios({
            method: "post", 
            url: `https://${serverip}:${this.config.serverApiPort}/server/data/download/${servername}/${token}`, 
            data: data, 
            responseType: 'arraybuffer',
            headers: { 'Content-Type': 'application/json' }  
        })
        .then(response =>{ 
            let absoluteFilepath = join(this.config.tempdirectory, token.concat('.zip'));
            fs.writeFile(absoluteFilepath, response.data, (err) => {
                if (err){console.log(err);}
                else {
                    extract(absoluteFilepath, { dir: this.config.workdirectory }, ()=>{ 
                        console.log("CommunicationHandler - files extracted")
                        fs.unlink(absoluteFilepath, (err) => { if (err) console.log(err); }); // remove zip file after extracting
                    }).then( () => {
                        if (backupfile) {    if (WindowHandler.examwindow){ WindowHandler.examwindow.webContents.send('backup', backupfile  ); console.log("CommunicationHandler - Trigger Replace Event") } }
                        if (WindowHandler.examwindow){ WindowHandler.examwindow.webContents.send('loadfilelist')}
                    })
                }
            });
        })
        .catch( err =>{console.log(`CommunicationHandler - requestFileFromServer: ${err}`) })   
    }


    resetConnection(){
        this.multicastClient.clientinfo.token = false
        this.multicastClient.clientinfo.ip = false
        this.multicastClient.clientinfo.serverip = false
        this.multicastClient.clientinfo.servername = false
        this.multicastClient.clientinfo.focus = true  // we are focused 
        //this.multicastClient.clientinfo.exammode = false   // do not set to false until exam window is manually closed
        this.multicastClient.clientinfo.timestamp = false
        this.multicastClient.clientinfo.virtualized = false  
    }
 

    async sendExamToTeacher(){
        //send save trigger to exam window
        if (WindowHandler.examwindow){
            WindowHandler.examwindow.webContents.send('save','teacherrequest')   //trigger, why
        }
        // give it some time
        await this.sleep(1000)  // wait one second before zipping workdirectory (give save some time - unfortunately we have no way to wait for save - we could check the filetime in a "while loop" though)
     
        //zip config.work directory
        if (!fs.existsSync(this.config.tempdirectory)){ fs.mkdirSync(this.config.tempdirectory); }
        //fsExtra.emptyDirSync(this.config.tempdirectory)
        let zipfilename = this.multicastClient.clientinfo.name.concat('.zip')
        let servername = this.multicastClient.clientinfo.servername
        let serverip = this.multicastClient.clientinfo.serverip
        let token = this.multicastClient.clientinfo.token
        let zipfilepath = join(this.config.tempdirectory, zipfilename);
     
        await this.zipDirectory(this.config.workdirectory, zipfilepath)
        let file = fs.readFileSync(zipfilepath);
        const form = new FormData()
        form.append(zipfilename, file, {contentType: 'application/zip', filename: zipfilename });   
     
        axios({
            method: "post", 
            url: `https://${serverip}:${this.config.serverApiPort}/server/data/receive/${servername}/${token}`, 
            data: form, 
            headers: { 'Content-Type': `multipart/form-data; boundary=${form._boundary}` }  
        })
        .then(response =>{ console.log(`Communication handler @ sendExamToTeacher: ${response.data.message}`)  })
        .catch( err =>{console.log(`Communication handler @ sendExamToTeacher: ${err}`) })
     
     }



    /**
     * @param {String} sourceDir: /some/folder/to/compress
     * @param {String} outPath: /path/to/created.zip
     * @returns {Promise}
     */
    zipDirectory(sourceDir, outPath) {
        const archive = archiver('zip', { zlib: { level: 9 }});
        const stream = fs.createWriteStream(outPath);
        return new Promise((resolve, reject) => {
        archive
            .directory(sourceDir, false)
            .on('error', err => reject(err))
            .pipe(stream)
        ;
        stream.on('close', () => resolve());
        archive.finalize();
        });
    }






    // timeout 
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
   
 }
 
 export default new CommHandler()
 
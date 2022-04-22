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


import dgram from 'dgram';
import config from '../config.js';  // node not vue (relative path needed)
import axios from 'axios';
import FormData from 'form-data';
import screenshot from 'screenshot-desktop';

/**
 * Starts a dgram (udp) socket that listens for mulitcast messages
 */
class MulticastClient {
    constructor () {
        this.PORT = config.multicastClientPort
        this.MULTICAST_ADDR = '239.255.255.250'
        this.client = dgram.createSocket('udp4')
        this.examServerList = []
        this.address = '0.0.0.0'
        this.refreshExamsIntervall = null
        this.browser = false
        this.clientinfo = {
            name: "DemoUser",
            token: false,
            ip: false,
            serverip: false,
            servername: false,
            focus: true,
            exammode: false,
            timestamp: false,
            virtualized: false
        }
        this.beaconsLost = 0
    }

    /**
     * receives messages and stores new exam instances in this.examServerList[]
     * starts an intervall to check server status by timestamp
     */
    init () {
        this.client.on('listening', () => { 
            this.address = this.client.address()
            console.log(`UDP MC Client listening on http://${config.hostip}:${this.address.port}`)
        })
        this.client.on('message', (message, rinfo) => { this.messageReceived(message, rinfo) })
        this.client.bind(this.PORT, () => { this.client.addMembership(this.MULTICAST_ADDR) })
    
        //start loops
        this.refreshExamsIntervall = setInterval(() => {  this.isDeprecatedInstance()  }, 5000)
        this.updateStudentIntervall = setInterval(() => { this.sendBeacon() }, 5000)
        this.running = true
    }



    /** 
     * sends heartbeat to registered server and updates screenshot on server 
     */
    async sendBeacon(){
        //check if server connected - get ip
        if (this.clientinfo.serverip) {
        
            //create screenshot
            screenshot().then(async (img) => {
                let screenshotfilename = this.clientinfo.token +".jpg"
                //create formdata
                const formData = new FormData()
                
                if (config.electron){
                    let blob =  new Blob( [ new Uint8Array(img).buffer], { type: 'image/jpeg' })
                    formData.append(screenshotfilename, blob, screenshotfilename );
                }
                else {
                    formData.append(screenshotfilename, img, screenshotfilename );
                }
                //update timestamp
                this.clientinfo.timestamp =  new Date().getTime()
                formData.append('clientinfo', JSON.stringify(this.clientinfo) );

                //post to /studentlist/update/:token
                axios({
                    method: "post", 
                    url: `https://${this.clientinfo.serverip}:${config.serverApiPort}/server/control/studentlist/update`, 
                    data: formData, 
                    headers: { 'Content-Type': `multipart/form-data; boundary=${formData._boundary}` }  
                })
                .then( response => {
                    //console.log(`MulticastClient: ${response.data.message}`)
                    if (response.data && response.data.status === "error") { this.beaconsLost += 1; console.log("beacon lost..") }

                    if (response.data && response.data.status === "success") { 
                        this.beaconsLost = 0 
                        let serverStatusObject = response.data.data


                        //react 
                        if (serverStatusObject.exammode && !this.clientinfo.exammode){
                            axios.get(`https://localhost:${config.clientApiPort}/client/control/exammode/start/${this.clientinfo.token}/${serverStatusObject.examtype}/${serverStatusObject.delfolder}`)
                            .then( response => {console.log(response.data);})
                            .catch(error => {console.log(error)});
                        }
                        else if (!serverStatusObject.exammode && this.clientinfo.exammode){
                            axios.get(`https://localhost:${config.clientApiPort}/client/control/exammode/stop/${this.clientinfo.token}`)
                            .then( response => {console.log(response.data);})
                            .catch(error => {console.log(error)});
                        }



                 
                    }

                })
                .catch(error => {
                    console.log(`MulticastClient: ${error}`) 
                    this.beaconsLost += 1; console.log("beacon lost..")
                });  //on kick there is a racecondition that leads to a failed fetch here because values are already "false"


                if (this.beaconsLost >= 4){ //remove server registration
                    console.log("Connection to Teacher lost! Removing registration.")
                    this.beaconsLost = 0
                    this.clientinfo.serverip = false
                    this.clientinfo.servername = false
                    this.clientinfo.token = false
                    // for (const [key, value] of Object.entries(this.clientinfo)) {
                    //     this.clientinfo[key] = false   
                    // }
                }

            })
            .catch((err) => {
                console.log(`MulticastClient: ${err}`)
            });
        }
    }


    /**
     * receives messages and stores new exam instances in this.examServerList[]
     */
    messageReceived (message, rinfo) {
        const serverInfo = JSON.parse(String(message))
        serverInfo.serverip = rinfo.address
        serverInfo.serverport = rinfo.port
        
        if (this.isNewExamInstance(serverInfo)) {
            console.log(`Adding new Exam Instance "${serverInfo.servername}" to Serverlist`)
            this.examServerList.push(serverInfo)
        }
    }


    /**
     * checks if the message came from a new exam instance or an old one that is already registered
     */
    isNewExamInstance (obj) {
        for (let i = 0; i < this.examServerList.length; i++) {
            if (this.examServerList[i].id === obj.id) {
                //console.log('existing server - updating timestamp')
                this.examServerList[i].timestamp = obj.timestamp // existing server - update timestamp
                return false
            }
        }
        return true
    }


    /**
     * checks servertimestamp and removes server from list if older than 1 minute
     */
    isDeprecatedInstance () {
        for (let i = 0; i < this.examServerList.length; i++) {
            const now = new Date().getTime()
            if (now - 20000 > this.examServerList[i].timestamp) {
                console.log('Removing inactive server from list')
                this.examServerList.splice(i, 1)
            }
        }
    }
}

export default new MulticastClient()

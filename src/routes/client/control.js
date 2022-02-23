import { Router } from 'express'
const router = Router()
import * as config from '../../config.js'
import multiCastclient from '../../classes/multicastclient.js'
import path  from 'path'



import axios from 'axios'
import nodenotify  from 'node-notifier'
import ip from 'ip'
import puppeteer from 'puppeteer'




/**
 * Returns all found Servers and the information about this client
 */ 
router.get('/', function (req, res, next) {
    res.send({serverlist:multiCastclient.examServerList, clientinfo: multiCastclient.clientinfo})
})
  


/**
 * Starts the Multicast Client that receives the broadcasts of an exam server instance 
 * Block requests from remote Host
 * on localhost you'll see 127.0.0.1 if you're using IPv4 or ::1, ::ffff:127.0.0.1 if you're using IPv6
 */ 
router.get('/start', function (req, res, next) {
    if (!requestSourceAllowed(req, res)) return
   
    console.log('Starting up: Multicast')
    if (multiCastclient.running) {
      console.log('Multicasting ist already running')
      res.json('Multicasting Client running')
    } else {
      multiCastclient.init()
      res.json('Multicasting Client started')
    }
})



/**
 * Sends a register request to the given server ip
 * @param serverip the examserver instance ip 
 * @param pin the given pin code to authenticate on the server
 * @param clientname the given username of the student
 */
router.get('/register/:serverip/:servername/:pin/:clientname', async function (req, res, next) {
    const clientname = req.params.clientname
    const pin = req.params.pin
    const serverip = req.params.serverip
    const servername = req.params.servername
    const clientip = address()

    if (multiCastclient.clientinfo.token){
        res.json({status: "already registered on a server"})
        return
    }
  
    await axios.get(`http://${serverip}:3000/server/control/registerclient/${servername}/${pin}/${clientname}/${clientip}`)
      .then(response => response.json())
      .then(data => {

        console.log(JSON.stringify(data))
        if (data && data.status == "success") { // registration successfull otherwise data would be "false"
          multiCastclient.clientinfo.name = clientname
          multiCastclient.clientinfo.serverip = serverip
          multiCastclient.clientinfo.servername = servername
          multiCastclient.clientinfo.ip = clientip
          multiCastclient.clientinfo.token = data.token // we need to store the client token in order to check against it before processing critical api calls
          multiCastclient.clientinfo.focus = true
        }
        res.json(data)
      })
})




/**
 * Runs a tokencheck and STARTS THE EXAM MODE
 * @param token a csrf token for validation
 */ 
 router.get('/exammode/start/:token', function (req, res, next) {
  const token = req.params.token
  if ( checkToken(token) ) {
    
    //start chromium in kiosk mode on exam landing page here https://peter.sh/experiments/chromium-command-line-switches/
    let kiosk = ""
    if (!development){ kiosk = "--kiosk" }
    (async () => {
      multiCastclient.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
          "--bwsi",
          "--force-dark-mode",
          "--disable-crash-reporter",
          "--force-app-mode",
          `${kiosk}`,
          "--no-first-run",
          "--noerrdialogs",
          "--no-default-browser-check",
          "--disable-popup-blocking",
          "--suppress-message-center-popups",
          "--disable-breakpad",
          "--disable-component-update",
          "--disable-default-apps",
          "--disable-dinosaur-easter-egg",
          "--disable-extensions",
          "--disable-logging",
          "--disable-notifications"
        ],
        ignoreDefaultArgs: ["--enable-automation"]
      });
      const page = await multiCastclient.browser.newPage();
      await page.goto(`http://localhost:3000/client/ui/exammode/${token}`);
      multiCastclient.clientinfo.exammode = true
    })();

    res.json({ sender: "client",message:"exam initialized", status:"success" })

  }
  else {
    res.json({ sender: "client", message:"token is not valid", status: "error" })
  }
})


/**
 * Runs a tokencheck and STOPS THE EXAM MODE
 * @param token a csrf token for validation
 */ 
 router.get('/exammode/stop/:token', function (req, res, next) {
  const token = req.params.token
  if ( checkToken(token) ) {
    if (!multiCastclient.browser){return res.json({ sender: "client",message:"exam not running", status:"error" })}

    multiCastclient.browser.close()
    console.log("browser closed")
    multiCastclient.clientinfo.exammode = false
    multiCastclient.browser = false
    res.json({ sender: "client",message:"exam stopped", status:"success" })

  }
  else {
    res.json({ sender: "client", message:"token is not valid", status: "error" })
  }
})





/**
 * Runs a tokencheck and removes the SERVER REGISTRATION
 * @param token a csrf token for validation
 */ 
 router.get('/kick/:token', function (req, res, next) {
  const token = req.params.token
  if ( checkToken(token) ) {
    for (const [key, value] of Object.entries(multiCastclient.clientinfo)) {
        multiCastclient.clientinfo[key] = false   
    }
    showOSD("Kicked by Server!")
    res.json({ sender: "client", status : "client unsubscribed" })
  }
  else {
    res.json({ sender: "client", tokenisvalid: false })
  }
})






/**
 * Runs a tokencheck and returns true or false
 * @param token a csrf token for validation
 */ 
router.get('/tokencheck/:token', function (req, res, next) {
    const token = req.params.token
    const filepath = '/src/assets/img/icons/success.png'
  
    if ( checkToken(token) ) {
        console.log('Show Notification')
        nodenotify.notify( {
                title: 'OSD Notification Test',
                message: `Hello from Next-Exam Server, ${multiCastclient.clientinfo.name}!`,
                icon: filepath, // Absolute path (doesn't work on balloons)
            },
            function(err, response) {
                console.log(err)
                console.log(response)
            }
        );
       
      res.json({ sender: "client", tokenisvalid: true })
    }
    else {
      res.json({ sender: "client", tokenisvalid: false })
    }
})




/**
 * Runs a specific command in a child process
 */ 
 router.get('/cmd', function (req, res, next) {
    const filepath = '/src/assets/img/icons/success.png'
  

    // could  trigger a shellscript or a python script
    // childProcess.execFile('python3', [filepath], (error, stdout, stderr) => {
    //   if (stderr) {
    //     console.log(stderr)
    //   }
    //   if (error) {
    //     console.log(error)
    //     res.json(error)
    //   } else {
    //     res.json(stdout)
    //   }
    // })

    return res.json({ status: "doing nothing" })
  })
  


export default router


//do not allow requests from external hosts
function requestSourceAllowed(req,res){
    if (req.ip !== "::1" && req.ip !== "127.0.0.1"){ 
      console.log("Blocked request from remote Host"); 
      res.json('Request denied') 
      return false
    }   
    return true
}

/**
 * Checks if the token is valid and the api is allowed to process the request
 */ 
function checkToken(token){
    if (token === multiCastclient.clientinfo.token) {
      return true
    }
    return false
}



function showOSD(notification){
  const filepath =  '/src/assets/img/icons/success.png'
  nodenotify.notify( {
              title: 'Next Exam',
              message: notification,
              icon: filepath, // Absolute path (doesn't work on balloons)
          },
          function(err, response) {
              console.log(err)
              console.log(response)
          }
  );
}
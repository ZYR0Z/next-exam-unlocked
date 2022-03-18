
import { Router } from 'express'
const router = Router()
import config from '../../config.js'
import multiCastclient from '../../classes/multicastclient.js'
import path from 'path'
import FormData from 'form-data'
import archiver from 'archiver'
import fs from 'fs' 
import axios from "axios"


import i18n from '../../../../renderer/src/locales/locales.js'
const { t } = i18n.global
 

/**
 * ZIPs and sends all files from a CLIENTS workdirectory TO the registered exam SERVER
 * @param token the students token (needed to accept this "abgabe" request from the server)
 */
 router.post('/abgabe/send/:token', async (req, res, next) => { 
     console.log("request received")    
    const token = req.params.token
    const serverip = multiCastclient.clientinfo.serverip  //this is set if you are registered on a server
    const servername = multiCastclient.clientinfo.servername

    if ( !checkToken(token) ) { return res.json({ sender: "client", message:t("data.tokennotvalid"), status: "error" })}
    else {
        console.log(`token checked - preparing file to send to server: ${serverip}`)
 
        //zip config.work directory
        let zipfilename = multiCastclient.clientinfo.name.concat('.zip')
        let zipfilepath = path.join(config.tempdirectory, zipfilename);
        await zipDirectory(config.workdirectory, zipfilepath)
        let file = await fs.readFileSync(zipfilepath);
        const form = new FormData()

        if (config.electron){
            let blob =  new Blob( [ new Uint8Array(file).buffer], { type: 'application/zip' })
            form.append(zipfilename, blob, zipfilename );
        } 
        else {
            form.append(zipfilename, file, {contentType: 'application/zip', filename: zipfilename });
        }

        axios({
            method: "post", 
            url: `http://${serverip}:${config.serverApiPort}/server/data/receive/${servername}/${token}`, 
            data: form, 
            headers: { 'Content-Type': `multipart/form-data; boundary=${form._boundary}` }  
        })
        .then(response =>{
            if (response.status === "success"){
                res.json({ sender: "client", message:response.data.message, status: "success",  errors: response.data.errors, clienttoken: response.data.clienttoken })  //we actually send the servers (backend) response back to the server (frontend)
            }
            else {
                res.json({ sender: "client", message:response.data.message, status: "error", errors: response.data.errors, clienttoken: response.data.clienttoken })  //we actually send the servers (backend) response back to the server (frontend)
            } 
        }).catch( err =>{console.log(`ClientData API: ${err}`) })
    }
})










/**
 * Stores file(s) to the workdirectory (files coming FROM the SERVER (Questions, tasks)  )
 * @param token the students token - this has to be valid (coming from the examserver you registered) 
 * in order to process the request - DO NOT STORE FILES COMING from anywhere.. always check if token belongs to a registered student (or server)
 */
 router.post('/receive/:token', async (req, res, next) => {  
    const token = req.params.token
    if ( !checkToken(token) ) { return res.json({ sender: "client", message:t("data.tokennotvalid"), status: "error" })}  //only accept files with valid token (coming from the server)
    if ( !req.files) { return res.send({sender: "client", message:t("data.nofiles"), status:"error"});  }

    console.log("receiving file(s)...")
    let errors = 0
   
    let filesArray = []  // depending on the number of files this comes as array of objects or object
    if (!Array.isArray(req.files.files)){ filesArray.push(req.files.files)}
    else {filesArray = req.files.files}

    filesArray.forEach(file => {
        let absoluteFilepath = path.join(config.workdirectory, file.name);
        file.mv(absoluteFilepath, (err) => {  
            if (err) { errors++; console.log( "client couldn't store file") }
            console.log( "file(s) received")
        });
    })
    
    res.json({sender: "client", message:t("data.filereceived"), status: "success", errors: errors, client: multiCastclient.clientinfo  })
    
})





/**
 * Stores file(s) to the workdirectory (files coming FROM the EDITOR  )
 * Only store file if request source is local
 */
 router.post('/store', async (req, res, next) => {  
    if (!requestSourceAllowed(req, res)) return //only allow this api route on localhost (same machine)
    
    const htmlContent = req.body.editorcontent
    const currentfilename = req.body.currentfilename
    const htmlfilename = currentfilename ? currentfilename +".html" : multiCastclient.clientinfo.name +".html"
    const htmlfile = path.join(config.workdirectory, htmlfilename);

    
    if (htmlContent) { fs.writeFile(htmlfile, htmlContent, (err) => {if (err) console.log(err); });  }

    console.log("saving students work to disk...")
    let errors = 0
    for (const [key, file] of Object.entries( req.files)) {
        let absoluteFilepath = path.join(config.workdirectory, file.name);
        file.mv(absoluteFilepath, (err) => {  
        if (err) { errors++; console.log( "client couldn't store file") }
               // console.log( "file(s) received")
        });
    }
    res.json({sender: "client", message:t("data.filestored"), status: "success", errors: errors  })
    
})


/**
 * GET all files from workdirectory
 */ 
 router.post('/getfiles', function (req, res, next) {
    if (!requestSourceAllowed(req, res)) return //only allow this api route on localhost (same machine)

    const workdir = path.join(config.workdirectory,"/")
    const filename = req.body.filename
    if (filename) {
        let filepath = path.join(workdir,filename)
        fs.readFile(filepath, 'utf8' , (err, data) => {
            if (err) {console.error(err);  return }
            return res.json( data )
        })
    }
    else {
        let files=  fs.readdirSync(workdir, { withFileTypes: true })
            .filter(dirent => dirent.isFile())
            .map(dirent => dirent.name)
            .filter( file => file.includes('html'))
        return res.send( files )
    }
})
  





export default router


/**
 * @param {String} sourceDir: /some/folder/to/compress
 * @param {String} outPath: /path/to/created.zip
 * @returns {Promise}
 */
 function zipDirectory(sourceDir, outPath) {
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



/**
 * Checks if the token is valid in order to process api request
 * Attention: no all api requests check tokens atm!
 */
function checkToken(token){
    if (token === multiCastclient.clientinfo.token) {
        return true
    }
    return false
}

//do not allow requests from external hosts
function requestSourceAllowed(req,res){
    if (req.ip == "::1"  || req.ip == "127.0.0.1" || req.ip.includes('127.0.0.1') ){ 
      return true
    }  
    console.log(`Blocked request from remote Host: ${req.ip}`); 
    res.json('Request denied') 
    return false 
}
  
  

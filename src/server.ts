import * as express from "express";
import * as bodyParser from "body-parser";
import * as cors from "cors";

import {UPLOADED_VIDEOS_PATH} from "./constants";
import {VideoPreviewBuilder} from "./userMediaLibrary/preview/VideoPreviewBuilder";
import {UserMediaLibrary} from "./userMediaLibrary/UserMediaLibrary";

export class Server{

    public app: any;
    private videoUploader:any;

    //private counter:number = 0;
    //private videoPreviewBuilder:VideoPreviewBuilder = new VideoPreviewBuilder();

    private mediaLibrary:UserMediaLibrary = new UserMediaLibrary();

    constructor() {

        this.app = express();

        const http = require('http');
        const httpServer:any = http.createServer(this.app);

        this.app.set('json replacer', (k, v) => (v === null ? undefined : v)); //

        const jsonParser       = bodyParser.json({limit:1024*1024*20, type:'application/json'});
        const urlencodedParser = bodyParser.urlencoded({ extended:true,limit:1024*1024*20,type:'application/x-www-form-urlencoded' });

        this.app.use(jsonParser);
        this.app.use(urlencodedParser);

        this.app.use(cors({
            origin: '*'
        }));

        // To use "public" folder for images upload
        this.app.use(express.static('public'));

        httpServer.listen(3000, () => {
            this.log("Server started on port 3000");

            this.createVideoUploader();
            this.createRoutes();
        });
    }

    private createVideoUploader():void{
        const that = this;
        const videosMulter:any = require('multer');

        const videosStorage:any = videosMulter.diskStorage(
            {
                destination: UPLOADED_VIDEOS_PATH,
                filename: function ( req, file, callback ) {
                    let ext = file.originalname.substring(file.originalname.lastIndexOf('.'), file.originalname.length);
                    const newFileName = Date.now()+ext;
                    console.log(" --- start upload file name: "+newFileName);

                    that.mediaLibrary.onVideoUploadStarted(newFileName);

                    callback( null, newFileName);
                }
            }
        );

        this.videoUploader = videosMulter( {
            storage: videosStorage,
            limits: { fieldSize: 25 * 1024 * 1024 }
        } );
    }

    private createRoutes():void{
        this.app.get('/', function (req, res) {
            res.send('Hello World');
        })

        this.app.post(
            "/uploadVideo",
            [
                cors(),
                this.videoUploader.single('video'),
                (req, res) => {
                    if(req.file) {
                        const filename = req.file.filename;
                        const userId:string = req.body.userId;
                        const type:number = parseInt(req.body.type)

                        const result:any = this.mediaLibrary.onVideoUploadComplete(filename, userId, type);

                        res.status(200).send(result).end();
                    }
                    else{
                        console.error("no file provided");
                        res.status(200).send({result:"ERROR", error:"no file provided"}).end();
                    }
                }
            ]
        );

        this.app.post(
            '/detectPreviewReady',
            [
                (req, res) => {
                    if(req.body){
                        const mediaId = req.body.mediaId ? req.body.mediaId : null;
                        if(mediaId){
                            this.mediaLibrary.detectPreviewReady(mediaId).subscribe(data => {
                                res.status(200).send(data).end();
                            })
                        }
                        else{
                            res.status(200).send({result:"ERROR", error:"mediaId not found in request body"}).end();
                        }
                    }
                    else{
                        res.status(200).send({result:"ERROR", error:"No body provided"}).end();
                    }
                }
            ]
        );

        this.app.post(
            '/removeUserMedia',
            [
                (req, res) => {
                    if(req.body){
                        const mediaId = req.body.mediaId ? req.body.mediaId : null;
                        console.log("removeUserMedia() mediaId = ",mediaId);

                        this.mediaLibrary.removeMedia(mediaId).subscribe(data => {
                            res.status(200).send(data).end();
                        })
                    }
                    else{
                        res.status(200).send({result:"ERROR", error:"No body provided"}).end();
                    }
                }
            ]
        );
    }

    private log(data:any):void{
        console.log("["+this.getClassName()+"] "+data);
        //AppLogger.getInstance().log(data, this.getClassName()+"_"+Settings.getInstance().getVersion());
    }

    private getClassName():string{
        return this.constructor.toString().match(/\w+/g)[1];
    }
}
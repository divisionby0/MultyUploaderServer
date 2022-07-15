import {ClearTempFolder} from "./ClearTempFolder";
import {CreateStillImage} from "./CreateStillImage";
import {Observable, Subscription} from "rxjs";
import {UPLOADED_VIDEOS_PATH, VIDEO_PREVIEW_FPS} from "../../constants";
import {spawn} from "child_process";
declare function require(data:any):any;

export class VideoPreviewBuilder {

    readonly tmpFolder:string;
    private stillImageCreator:CreateStillImage;

    public static AUTO_STOP:string = "AUTO_STOP";
    public static MANUAL_STOP:string = "MANUAL_STOP";

    public static BUILD_IMAGE_SEQUENCE:string = "BUILD_IMAGE_SEQUENCE";
    public static BUILD_STILL_PREVIEW:string = "BUILD_STILL_PREVIEW";
    public static BUILD_ANIM_PREVIEW:string = "BUILD_ANIM_PREVIEW";

    private stopState:string;
    private state:string;

    private ffmpegCreateSequence:any;
    private ffmpegCreateVideo:any;

    private stillImage:string;

    constructor() {
        this.tmpFolder = UPLOADED_VIDEOS_PATH+'tmp/';
        this.stillImageCreator = new CreateStillImage(this.tmpFolder);
    }

    public destroy():void{
        this.stopState = VideoPreviewBuilder.MANUAL_STOP;
        switch(this.state){
            case VideoPreviewBuilder.BUILD_IMAGE_SEQUENCE:
                this.ffmpegCreateSequence.kill();
                break;
            case VideoPreviewBuilder.BUILD_STILL_PREVIEW:
                this.stillImageCreator.destroy();
                break;
            case VideoPreviewBuilder.BUILD_ANIM_PREVIEW:
                this.ffmpegCreateVideo.kill();
                break;
        }

        setTimeout(() => {
            this.clearTempFolder();
        },2000);
    }

    public createPreview(media:any):Observable<any>{
        return Observable.create(observer => {

            this.state = VideoPreviewBuilder.BUILD_IMAGE_SEQUENCE;
            this.stopState = VideoPreviewBuilder.AUTO_STOP;

            const {spawn} = require('child_process');

            const filename:string = media.filename;
            const id:number = media.id;
            const filePath:string = UPLOADED_VIDEOS_PATH + media.filename;

            const sequenceTemplate:string = this.tmpFolder + 'out_'+filename+'_%d.png';
            this.log("start create images sequence media id "+id);
            this.log("filePath "+filePath);

            this.ffmpegCreateSequence = spawn('ffmpeg', ['-i', filePath, '-vf', 'fps='+VIDEO_PREVIEW_FPS, sequenceTemplate]);

            this.ffmpegCreateSequence.stderr.on('data', (data) => {
                //console.log("Std error: "+data);
                //observer.next({result:"ERROR", error:data, mediaId:mediaId});
            });

            this.ffmpegCreateSequence.on('close', (code) => {
                this.log("create images sequence media id "+id+" closed with code "+code);
                if(code == 0){

                    this.state = VideoPreviewBuilder.BUILD_STILL_PREVIEW;
                    const createStillImageSubscription:Subscription = this.stillImageCreator.execute(filename, id).subscribe(createStillImageResponse => {

                        createStillImageSubscription.unsubscribe();

                        this.stillImage = createStillImageResponse.stillImage;

                        if(createStillImageResponse.result =="OK"){

                            this.state = VideoPreviewBuilder.BUILD_ANIM_PREVIEW;
                            const createAnimationSubscription:Subscription = this.createAnimation(sequenceTemplate, id).subscribe(data => {

                                createAnimationSubscription.unsubscribe();

                                if(data.result == "OK"){
                                    data.mediaId = id;
                                    data.stillImage = this.stillImage;

                                    observer.next(data);
                                }
                                else{
                                    observer.next(data);
                                }
                            });
                        }
                        else{
                            observer.next(createStillImageResponse);
                        }
                    });
                }
                else{
                    switch(this.stopState){
                        case VideoPreviewBuilder.AUTO_STOP:
                            observer.next({result:"ERROR", error:"FFMPEG create sequence code is not 0", manualCanceled:false});
                            break;
                        case VideoPreviewBuilder.MANUAL_STOP:
                            observer.next({result:"ERROR", error:"manual canceled", mediaId:media.id, manualCanceled:true, stillImage:this.stillImage, state:this.state});
                            break;
                    }
                    //observer.next({result:"ERROR", error:"FFMPEG create sequence code is not 0"});
                }
            });
        });
    }

    private createAnimation(sequenceTemplate:string, mediaId:number):Observable<any>{
        return Observable.create(observer=>{

            this.stopState = VideoPreviewBuilder.AUTO_STOP;

            const {spawn} = require('child_process');

            this.log("create animation from sequence media id "+mediaId);
            
            //const previewFileName:string = fileName+"_preview.gif";
            const previewFileName:string = mediaId + "_preview_"+Math.round(Math.random()*99999999999)+".gif";
            //const ffmpegCreateVideo = spawn('ffmpeg', ['-f', 'image2', '-framerate', VIDEO_PREVIEW_FPS.toString(), '-i', sequenceTemplate, '-vf', 'scale='+VIDEO_PREVIEW_SIZE, UPLOADED_VIDEOS_PATH + previewFileName]);
            this.ffmpegCreateVideo = spawn('ffmpeg', ['-f', 'image2', '-framerate', VIDEO_PREVIEW_FPS.toString(), '-i', sequenceTemplate, '-vf', 'scale=176:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', UPLOADED_VIDEOS_PATH + previewFileName]);

            /*
            setTimeout(() => {
                this.log("DEBUG cancel during creating video from images sequence");
                this.destroy();
            },200);
             */

            this.ffmpegCreateVideo.stderr.on('data', (data) => {
                //console.log("CREATE VIDEO FROM SEQUENCE Std error: "+data);
                //observer.next({result:"ERROR", error:data, mediaId:mediaId});
            });

            this.ffmpegCreateVideo.on('close', (code) => {
                this.log("create animation from sequence media id "+mediaId+" closed with code "+code);
                
                this.clearTempFolder();

                if(code == 0){
                    observer.next({result:"OK", preview:previewFileName});
                }
                else{
                    switch(this.stopState){
                        case VideoPreviewBuilder.AUTO_STOP:
                            observer.next({result:"ERROR", error:"FFMPEG create video from sequence code is not 0", manualCanceled:false});
                            break;
                        case VideoPreviewBuilder.MANUAL_STOP:
                            observer.next({result:"ERROR", manualCanceled:true, error:"manual canceled", mediaId:mediaId, previewFileName:previewFileName, stillImage:this.stillImage, state:this.state});
                            break;
                    }

                    //observer.next({result:"ERROR", error:"FFMPEG create video from sequence code is not 0"});
                }
            });

        });
    }

    private clearTempFolder():void{
        const folderCleaner:ClearTempFolder = new ClearTempFolder(this.tmpFolder);
        folderCleaner.execute();
    }

    private getClassName():string{
        return this.constructor.toString().match(/\w+/g)[1];
    }

    private log(data:any):void{
        console.log("["+this.getClassName()+"] "+data);
        //AppLogger.getInstance().log(data, this.getClassName());
    }
}
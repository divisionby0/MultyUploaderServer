import {VideoPreviewBuilder} from "./preview/VideoPreviewBuilder";
import {interval, Observable, of, Subscription} from "rxjs";

import {VideoConverter} from "./VideoConverter";

//import {UserMediaEvent} from "./UserMediaEvent";
import {UPLOADED_VIDEOS_BASE_URL, UPLOADED_VIDEOS_PATH} from "../constants";
import {timeout} from "rxjs/operators";
import {MediaState} from "./MediaState";
import {DeleteFile} from "./DeleteFile";

declare function require(data:any):any;
const fs = require('fs');

const sharp = require("sharp");

export class UserMediaLibrary {

    public static IDLE_STATE:string = "IDLE_STATE";
    public static BUSY_STATE:string = "BUSY_STATE";

    private state:string;

    private mediaCollection:any[] = [];
    private videoPreviewBuilder:VideoPreviewBuilder = new VideoPreviewBuilder();
    private videoConverter:VideoConverter = new VideoConverter();
    private queue:any[] = [];
    private counter:number = 0;

    constructor() {
        this.state = UserMediaLibrary.IDLE_STATE;
    }

    public createImage(imageData:any, imageUrl:string, quality:number):Observable<any>{
        return Observable.create(observer => {
            const buffer = Buffer.from(imageData, "base64");
            sharp(buffer)
                .jpeg({ quality: quality })
                .toFile(imageUrl, (error, info) => {
                    if(error){
                        observer.next({result:"ERROR", error:error});
                    }
                    else{
                        observer.next({result:"OK", data:info});
                    }
            });
        });
    }

    public removeMedia(mediaId:number):Observable<any>{
        this.log("Manual remove media id "+mediaId);

        const media:any = this.getMediaById(mediaId);

        this.log("media "+JSON.stringify(media));

        if(media){
            const state:string = media.state;

            switch(state){
                case MediaState.UPLOADING:
                    this.log("UPLOADING state ...");
                    break;
                case MediaState.CONVERTING:
                    this.log("CONVERTING state ...");
                    this.videoConverter.destroy();
                    break;
                case MediaState.BUILDING_PREVIEW:
                    this.log("BUILDING_PREVIEW state ...");
                    this.videoPreviewBuilder.destroy();

                    setTimeout(() => {
                        const fileToRemove:string = UPLOADED_VIDEOS_PATH + media.filename;
                        this.log("file to remove: "+fileToRemove);

                        const deleteFile:DeleteFile = new DeleteFile(fileToRemove);
                        const subscription:Subscription = deleteFile.execute().subscribe(data => {
                            subscription.unsubscribe();
                        });
                    },2000);
                    break;
            }
            return of({result:"OK", media:{id:mediaId}});
        }
        else{
            return of({result:"ERROR", error:"Media "+mediaId+" not found"});
        }
        //return undefined;
    }

    public onVideoUploadStarted(filename:string):void{
        // video id is undefined yet - creating id by counter or DB
        this.counter++;
        const media:any = {id:this.counter, filename:filename, stillUrl:"", previewUrl:"", date:new Date(), state:MediaState.UPLOADING};
        this.mediaCollection.push(media);
    }

    public onVideoUploadComplete(filename:string, userId:string, type:number):any{
        const media = this.getMediaByFilename(filename);

        if(media){
            media.state = MediaState.BUILDING_PREVIEW;
            media.userId = userId;
            media.type = type;

            this.addQueueTask(media);
            return {result:"OK", media:media};
        }
        else{
            return {result:"ERROR", error:"Media by filename "+filename+" not found"};
        }
    }

    public detectPreviewReady(mediaId:number):Observable<any>{
        //return this.dbService.hasPreview(mediaId);

        const media:any = this.getMediaById(mediaId);

        let response:any;

        if(media){
            switch(media.state){
                case MediaState.CONVERTING:
                case MediaState.BUILDING_PREVIEW:
                    response = {result:"OK", exists:false};
                    break;
                case MediaState.PREVIEW_READY:
                    response = {result:"OK", exists:true, media: media};
                    break;
            }
        }
        else{
            response = {result:"ERROR", error:"Media by id "+media+" not found"};
        }

        return of(response).pipe(
            timeout(400)
        );
    }

    public getUserMediaById(mediaId:number, customerId?:number):Observable<any>{
        this.log("getUserMediaById mediaId="+mediaId+" customerId="+customerId);
        return undefined;
        //return this.dbService.getUserMediaById(mediaId, customerId);
    }
    
    private addQueueTask(media:any):void{
        this.log("adding queue task to create preview. media:" + JSON.stringify(media));
        this.queue.push(media);

        if(this.state == UserMediaLibrary.IDLE_STATE){
            this.nextTask();
        }
    }

    private nextTask():void{
        this.log("next task...");
        const media:any = this.queue[0];

        let srcFilePath:string;

        if(media){
            this.state = UserMediaLibrary.BUSY_STATE;

            this.log("start convert to mp4 task. mediaId="+media.id+" filename="+media.filename);

            media.state = MediaState.CONVERTING;

            const convertToMP4Subscription:Subscription = this.convertVideoToPM4(media).subscribe(data => {
                convertToMP4Subscription.unsubscribe();

                const result:string = data.result;
                this.log("convert video response: "+JSON.stringify(data));

                if(result == "OK"){
                    media.state = MediaState.BUILDING_PREVIEW;
                    srcFilePath = data.srcFilePath;
                    const convertedFileName:string = data.convertedFileName;
                    const duration:number = data.duration;
                    const cost:number = this.generateCost(duration);

                    media.filename = convertedFileName;
                    media.url = UPLOADED_VIDEOS_BASE_URL + convertedFileName;
                    media.cost = cost;
                    media.duration = duration;

                    this.log("removing uploaded source : "+srcFilePath);

                    // TODO remove uploaded
                    fs.unlink(srcFilePath, (removeMediaError) => {
                        if (removeMediaError) {
                            this.log("Error remove user media file: "+removeMediaError);
                        }
                        else{
                            this.log("Uploaded file "+srcFilePath+"removed");
                        }
                    });

                    // TODO rest actions
                    const subscription:Subscription = this.createVideoPreview(media).subscribe(data => {
                        this.log("create video preview result: "+JSON.stringify(data));
                        subscription.unsubscribe();

                        if(data.result == "OK"){
                            media.state = MediaState.PREVIEW_READY;
                            media.previewUrl = UPLOADED_VIDEOS_BASE_URL + data.preview
                            media.stillUrl = UPLOADED_VIDEOS_BASE_URL + data.stillImage;

                            delete media.filename;

                            this.log("task complete. media: "+JSON.stringify(media));

                            // todo update db

                            //EventBus.dispatchEvent(UserMediaEvent.USER_MEDIA_ADDED, media);

                            this.removeTask(media.id);
                            this.nextTask();
                        }
                        else{
                            this.onCreatePreviewError(data, media);
                        }
                    });
                }
                else{
                    this.onConvertingToMP4Error(data, media);
                }
            });
        }
        else{
            this.log("all tasks complete");
            this.state = UserMediaLibrary.IDLE_STATE;
        }
    }

    private onConvertingToMP4Error(data:any, media:any):void{
        this.log("Error convert. Error:"+data.error+" manual canceled: "+data.manualCanceled);

        if(data.manualCanceled){
            // TODO remove uploaded and partially converted files
            const srcFilePath:string = data.srcFilePath;
            const partiallyConvertedFilePath:string = data.partiallyConvertedFilePath;

            let deleteFile:DeleteFile = new DeleteFile(srcFilePath);
            let subscription:Subscription = deleteFile.execute().subscribe(deteleSourceResult => {
                subscription.unsubscribe();
                this.log("delete uploaded source file result: "+JSON.stringify(deteleSourceResult));

                deleteFile = new DeleteFile(partiallyConvertedFilePath);
                subscription = deleteFile.execute().subscribe(deletePartiallyConvertedFileResult => {
                    subscription.unsubscribe();
                    this.log("delete partially converted file result: "+JSON.stringify(deletePartiallyConvertedFileResult));
                })
            });
        }

        this.log("Error executing task media id "+media.id+" fileName="+media.filename+" . Starting new task...");
        this.removeTask(media.id);
        this.nextTask();
    }

    private onCreatePreviewError(data:any, media:any):void{
        this.log("Error creating preview. Error: "+data.error);
        this.removeTask(media.id);
        this.nextTask();
    }

    private removeTask(mediaId:number):void{
        this.queue = this.queue.filter(item=>{
            return item.id!=mediaId;
        });
    }

    private convertVideoToPM4(media:any):Observable<any>{
        return this.videoConverter.convert(media);
    }

    private createVideoPreview(media:any):Observable<any>{
        return this.videoPreviewBuilder.createPreview(media);
    }

    private generateCost(duration:number):number{
        if(duration < 20){
            return 1;
        }
        else if(duration > 19 && duration < 39){
            return 2;
        }
        else{
            return 4;
        }
    }

    private getMediaById(id:number):any {
        const filtered = this.mediaCollection.filter(item => {
            return item.id === id;
        });
        return filtered != null ? filtered[0] : null;
    }

    private getMediaByFilename(filename:string):any{
        const filtered = this.mediaCollection.filter(item => {
            return item.filename === filename;
        });
        return filtered != null ? filtered[0] : null;
    }

    private getClassName():string{
        return this.constructor.toString().match(/\w+/g)[1];
    }

    private log(data:any):void{
        console.log("["+this.getClassName()+"] "+data);
        //AppLogger.getInstance().log(data, this.getClassName());
    }
}

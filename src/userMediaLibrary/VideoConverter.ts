import {Observable} from "rxjs";
import {GetVideoProperties} from "./preview/GetVideoProperties";
import {UPLOADED_VIDEOS_PATH} from "../constants";
declare function require(data:any):any;
export class VideoConverter {
    // 1080P ffmpeg -i input.mov -preset slow -codec:a libfdk_aac -b:a 128k -codec:v libx264 -pix_fmt yuv420p -b:v 4500k -minrate 4500k -maxrate 9000k -bufsize 9000k -vf scale=-1:1080 output.mp4
    // 720P ffmpeg -i D:/workspaces/DenverServers/home/dreamonlove3/dolserver/public/uploads/videos/1649220201497.AVI -preset slow -codec:a opus -b:a 128k -codec:v libx264 -pix_fmt yuv420p -b:v 2500k -minrate 1500k -maxrate 4000k -bufsize 5000k -vf scale=-1:720 D:/workspaces/DenverServers/home/dreamonlove3/dolserver/public/uploads/videos/1649220201497.AVI.mp4

    public static AUTO_STOP:string = "AUTO_STOP";
    public static MANUAL_STOP:string = "MANUAL_STOP";

    private ffmpegConvert:any;

    private state:string;

    constructor() {
    }

    public destroy():void{
        this.log("destroy");
        this.state = VideoConverter.MANUAL_STOP;
        if(this.ffmpegConvert){
            this.ffmpegConvert.kill();
        }
    }

    public convert(media:any):Observable<any>{
        return Observable.create(observer=>{

            this.state = VideoConverter.AUTO_STOP;

            const filename:string = media.filename;
            const id:number = media.id;

            const {spawn} = require('child_process');
            const srcFilePath:string = UPLOADED_VIDEOS_PATH + filename;
            const convertedFileName:string = id + "_" +filename + ".mp4";
            const convertedFilePath:string = UPLOADED_VIDEOS_PATH + convertedFileName;

            this.log("start convert to mp4 media id "+id+" source file name "+filename);
            this.log("srcFilePath "+srcFilePath);
            this.log("convertedFileName "+convertedFileName);
            this.log("convertedFilePath "+convertedFilePath);

            const parameters:any[] = [
                '-y',
                '-i', srcFilePath,
                '-preset', 'slow',
                '-acodec', 'mp3',
                '-b:a', '128k',
                '-vcodec', 'libx264',
                '-b:v', '3500k',
                '-minrate', '3500k',
                '-maxrate', '4000k',
                '-bufsize', '5000k',
                '-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-loglevel','error',
                '-report',
                convertedFilePath];

            this.log("parameters "+JSON.stringify(parameters));

            this.ffmpegConvert = spawn('ffmpeg', parameters);

            this.ffmpegConvert.stderr.on('data', (data) => {
                this.log("video id "+id+" filename "+filename+" converting error data: "+data);
                //console.log("converter:",data);
                observer.next({result:"ERROR", error:data, mediaId:id});
            });

            this.ffmpegConvert.on('close', (code) => {
                this.log("convert to mp4 media id "+id+" closed with code "+code);
                if(code == 0){
                    
                    const getVideoProperties:GetVideoProperties = new GetVideoProperties();
                    getVideoProperties.execute(convertedFilePath).subscribe(videoPropertiesData => {
                        this.log("video properties response: "+JSON.stringify(videoPropertiesData));

                        const duration:number = videoPropertiesData.duration;
                        
                        const data:any = {result:"OK", srcFilePath:srcFilePath, convertedFileName:convertedFileName, duration:duration};
                        observer.next(data);
                    });
                }
                else{
                    switch(this.state){
                        case VideoConverter.AUTO_STOP:
                            observer.next({result:"ERROR", error:"FFMPEG video converting result code is not 0", manualCanceled:false});
                            break;
                        case VideoConverter.MANUAL_STOP:
                            observer.next({result:"ERROR", manualCanceled:true, srcFilePath:srcFilePath, partiallyConvertedFilePath:convertedFilePath});
                            break;
                    }
                }
            });
        });
    }

    private getClassName():string{
        return this.constructor.toString().match(/\w+/g)[1];
    }

    private log(data:any):void{
        console.log("["+this.getClassName()+"] "+data);
        //AppLogger.getInstance().log(data, this.getClassName());
    }
}
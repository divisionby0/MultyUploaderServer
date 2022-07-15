import {Observable} from "rxjs";
import {UPLOADED_VIDEOS_PATH} from "../../constants";
declare function require(data:any):any;
export class CreateStillImage {

    readonly tmpFolder:string;

    private stopState:string;
    public static AUTO_STOP:string = "AUTO_STOP";
    public static MANUAL_STOP:string = "MANUAL_STOP";

    private ffmpegConvertToJpg:any;

    constructor(tmpFolder:string) {
        this.tmpFolder = tmpFolder;
    }

    public destroy():void{
        this.stopState = CreateStillImage.MANUAL_STOP;
        this.ffmpegConvertToJpg.kill();
    }

    public execute(fileName:string, mediaId:number):Observable<any>{
        this.stopState = CreateStillImage.AUTO_STOP;

        return Observable.create(observer=>{
            const sourcePath:string = this.tmpFolder + 'out_'+fileName+'_1.png';
            const jpgFileName:string = mediaId + "_" + Math.round(Math.random()*999999999)+"_still.jpg";
            const targetPathJpg:string = UPLOADED_VIDEOS_PATH + jpgFileName;

            const {spawn} = require('child_process');
            this.ffmpegConvertToJpg = spawn('ffmpeg', ['-i', sourcePath, '-preset', 'ultrafast', '-vf', 'scale=320:-1', targetPathJpg]);

            this.ffmpegConvertToJpg.stderr.on('data', (data) => {
                //console.log("CREATE VIDEO FROM SEQUENCE Std error: "+data);
                //observer.next({result:"ERROR", error:data, mediaId:mediaId});
            });

            this.ffmpegConvertToJpg.on('close', (code) => {
                if(code == 0){
                    observer.next({result:"OK", stillImage:jpgFileName});
                }
                else{
                    switch(this.stopState){
                        case CreateStillImage.AUTO_STOP:
                            observer.next({result:"ERROR", error:"FFMPEG create still image result code is not 0"});
                            break;
                        case CreateStillImage.MANUAL_STOP:
                            observer.next({result:"ERROR", manualCanceled:true, stillImage:jpgFileName});
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
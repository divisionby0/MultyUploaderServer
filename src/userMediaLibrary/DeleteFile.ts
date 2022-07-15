import {Observable, of} from "rxjs";

const fs = require('fs');

export class DeleteFile{
    private filePath:string;

    constructor(filePath:string) {
        this.filePath = filePath;
    }

    public execute():Observable<any>{
        return Observable.create(observer => {
            fs.unlink(this.filePath, (removeMediaError) => {
                if (removeMediaError) {
                    console.log("Error remove user media file: "+removeMediaError);
                    observer.next({result:"ERROR", error:removeMediaError});
                }
                else{
                    console.log("file "+this.filePath+"removed");
                    observer.next({result:"OK"});
                }
            });
        });
    }
}